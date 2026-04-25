import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import type { JobDefinition, RetryPolicy, RunRecord, RunStatus, Trigger } from "./types.js";
import type { OrchestrationStore, RunRetentionPolicy, StoreStats, StoreStatsOptions } from "./store.js";

interface SchemaMigration {
	version: number;
	statements: string[];
}

const SCHEMA_VERSION_KEY = "schema_version";

const SCHEMA_MIGRATIONS: SchemaMigration[] = [
	{
		version: 1,
		statements: [
			`CREATE TABLE IF NOT EXISTS jobs (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				trigger_json TEXT NOT NULL,
				retry_json TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,
			`CREATE TABLE IF NOT EXISTS runs (
				run_id TEXT PRIMARY KEY,
				job_id TEXT NOT NULL,
				status TEXT NOT NULL,
				attempt INTEGER NOT NULL,
				queued_at TEXT NOT NULL,
				started_at TEXT,
				finished_at TEXT,
				last_error TEXT,
				FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
			)`,
			"CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id)",
			"CREATE INDEX IF NOT EXISTS idx_runs_job_time ON runs(job_id, COALESCE(finished_at, started_at, queued_at))",
		],
	},
	{
		version: 2,
		statements: [
			`CREATE TABLE IF NOT EXISTS compaction_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				job_id TEXT NOT NULL,
				compacted_at TEXT NOT NULL,
				deleted_runs INTEGER NOT NULL,
				policy_json TEXT NOT NULL
			)`,
			"CREATE INDEX IF NOT EXISTS idx_compaction_history_job_time ON compaction_history(job_id, compacted_at)",
		],
	},
];

export interface SqliteOrchestrationStoreOptions {
	path: string;
	timeoutMs?: number;
}

export interface SqliteCompactionHistoryEntry {
	id: number;
	jobId: string;
	compactedAt: string;
	deletedRuns: number;
	policyJson: string;
}

export class SqliteOrchestrationStore implements OrchestrationStore {
	private readonly db: DatabaseSync;
	private readonly path: string;

	constructor(options: SqliteOrchestrationStoreOptions) {
		this.path = options.path;
		this.db = new DatabaseSync(options.path, {
			timeout: options.timeoutMs ?? 1_000,
			enableForeignKeyConstraints: true,
		});
		this.migrate();
	}

	close(): void {
		if (this.db.isOpen) {
			this.db.close();
		}
	}

	getSchemaVersion(): number {
		return this.readSchemaVersion();
	}

	listCompactionHistory(jobId: string): SqliteCompactionHistoryEntry[] {
		const rows = this.db
			.prepare(
				"SELECT id, job_id, compacted_at, deleted_runs, policy_json FROM compaction_history WHERE job_id = :jobId ORDER BY id ASC",
			)
			.all({ jobId });

		return rows.map((row) => ({
			id: readNumber(row, "id"),
			jobId: readString(row, "job_id"),
			compactedAt: readString(row, "compacted_at"),
			deletedRuns: readNumber(row, "deleted_runs"),
			policyJson: readString(row, "policy_json"),
		}));
	}

	async upsertJob(job: JobDefinition): Promise<void> {
		this.db
			.prepare(
				`INSERT INTO jobs (id, name, trigger_json, retry_json)
				 VALUES (:id, :name, :triggerJson, :retryJson)
				 ON CONFLICT(id) DO UPDATE SET
				   name = excluded.name,
				   trigger_json = excluded.trigger_json,
				   retry_json = excluded.retry_json,
				   updated_at = datetime('now')`,
			)
			.run({
				id: job.id,
				name: job.name,
				triggerJson: JSON.stringify(job.trigger),
				retryJson: JSON.stringify(job.retry),
			});
	}

	async getJob(jobId: string): Promise<JobDefinition | undefined> {
		const row = this.db
			.prepare("SELECT id, name, trigger_json, retry_json FROM jobs WHERE id = :jobId")
			.get({ jobId });
		if (!row) {
			return undefined;
		}
		return decodeJobRow(row);
	}

	async listJobs(): Promise<JobDefinition[]> {
		const rows = this.db
			.prepare("SELECT id, name, trigger_json, retry_json FROM jobs ORDER BY id ASC")
			.all();
		return rows.map((row) => decodeJobRow(row));
	}

	async deleteJob(jobId: string): Promise<boolean> {
		const result = this.db.prepare("DELETE FROM jobs WHERE id = :jobId").run({ jobId });
		return Number(result.changes) > 0;
	}

	async upsertRun(run: RunRecord): Promise<void> {
		this.db
			.prepare(
				`INSERT INTO runs (
					run_id, job_id, status, attempt, queued_at, started_at, finished_at, last_error
				 ) VALUES (
					:runId, :jobId, :status, :attempt, :queuedAt, :startedAt, :finishedAt, :lastError
				 )
				 ON CONFLICT(run_id) DO UPDATE SET
					job_id = excluded.job_id,
					status = excluded.status,
					attempt = excluded.attempt,
					queued_at = excluded.queued_at,
					started_at = excluded.started_at,
					finished_at = excluded.finished_at,
					last_error = excluded.last_error`,
			)
			.run({
				runId: run.runId,
				jobId: run.jobId,
				status: run.status,
				attempt: run.attempt,
				queuedAt: run.queuedAt,
				startedAt: run.startedAt ?? null,
				finishedAt: run.finishedAt ?? null,
				lastError: run.lastError ?? null,
			});
	}

	async getRun(runId: string): Promise<RunRecord | undefined> {
		const row = this.db
			.prepare(
				"SELECT run_id, job_id, status, attempt, queued_at, started_at, finished_at, last_error FROM runs WHERE run_id = :runId",
			)
			.get({ runId });
		if (!row) {
			return undefined;
		}
		return decodeRunRow(row);
	}

	async listRuns(jobId: string): Promise<RunRecord[]> {
		const rows = this.db
			.prepare(
				"SELECT run_id, job_id, status, attempt, queued_at, started_at, finished_at, last_error FROM runs WHERE job_id = :jobId ORDER BY COALESCE(finished_at, started_at, queued_at) DESC, run_id DESC",
			)
			.all({ jobId });
		return rows.map((row) => decodeRunRow(row));
	}

	async deleteRunsForJob(jobId: string): Promise<number> {
		const result = this.db.prepare("DELETE FROM runs WHERE job_id = :jobId").run({ jobId });
		return Number(result.changes);
	}

	async pruneRuns(jobId: string, policy: RunRetentionPolicy): Promise<number> {
		let deleted = 0;
		const now = policy.now ?? new Date();

		if (typeof policy.maxAgeMs === "number" && policy.maxAgeMs > 0) {
			const cutoffIso = new Date(now.getTime() - policy.maxAgeMs).toISOString();
			const result = this.db
				.prepare(
					"DELETE FROM runs WHERE job_id = :jobId AND COALESCE(finished_at, started_at, queued_at) < :cutoffIso",
				)
				.run({ jobId, cutoffIso });
			deleted += Number(result.changes);
		}

		if (typeof policy.maxRunsPerJob === "number" && policy.maxRunsPerJob >= 0) {
			const rows = this.db
				.prepare(
					"SELECT run_id FROM runs WHERE job_id = :jobId ORDER BY COALESCE(finished_at, started_at, queued_at) DESC, run_id DESC",
				)
				.all({ jobId });
			const overflowRows = rows.slice(policy.maxRunsPerJob);
			for (const row of overflowRows) {
				const runId = readString(row, "run_id");
				const result = this.db.prepare("DELETE FROM runs WHERE run_id = :runId").run({ runId });
				deleted += Number(result.changes);
			}
		}

		this.recordCompaction(jobId, now, policy, deleted);
		return deleted;
	}

	async getStats(options: StoreStatsOptions = {}): Promise<StoreStats> {
		const now = options.now ?? new Date();
		const jobCount = this.readCount("SELECT COUNT(*) AS count_value FROM jobs");
		const runCount = this.readCount("SELECT COUNT(*) AS count_value FROM runs");
		const runsByStatus = createEmptyRunStatusCounts();
		const statusRows = this.db.prepare("SELECT status, COUNT(*) AS count_value FROM runs GROUP BY status").all();
		for (const row of statusRows) {
			const status = readString(row, "status");
			const count = readNumber(row, "count_value");
			if (isRunStatus(status)) {
				runsByStatus[status] = count;
			}
		}

		const compactionRows = this.db
			.prepare(
				"SELECT job_id, MAX(compacted_at) AS last_compacted_at FROM compaction_history GROUP BY job_id ORDER BY job_id ASC",
			)
			.all();
		const lastCompactionAtByJob: Record<string, string> = {};
		for (const row of compactionRows) {
			const jobId = readString(row, "job_id");
			const compactedAt = readOptionalString(row, "last_compacted_at");
			if (compactedAt) {
				lastCompactionAtByJob[jobId] = compactedAt;
			}
		}

		const sqliteVersionRow = this.db.prepare("SELECT sqlite_version() AS sqlite_version").get();
		const sqliteVersion = sqliteVersionRow ? readString(sqliteVersionRow, "sqlite_version") : "unknown";

		return {
			backend: "sqlite",
			generatedAt: now.toISOString(),
			jobCount,
			runCount,
			runsByStatus,
			lastCompactionAtByJob,
			metadata: {
				schemaVersion: this.getSchemaVersion(),
				path: this.path,
				isOpen: this.db.isOpen,
				sqliteVersion,
			},
		};
	}

	private migrate(): void {
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(
			`CREATE TABLE IF NOT EXISTS orchestration_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)`,
		);

		let currentVersion = this.readSchemaVersion();
		for (const migration of SCHEMA_MIGRATIONS) {
			if (migration.version <= currentVersion) {
				continue;
			}

			this.db.exec("BEGIN IMMEDIATE");
			try {
				for (const statement of migration.statements) {
					this.db.exec(statement);
				}
				this.setSchemaVersion(migration.version);
				this.db.exec("COMMIT");
				currentVersion = migration.version;
			} catch (error) {
				this.db.exec("ROLLBACK");
				throw error;
			}
		}
	}

	private readSchemaVersion(): number {
		const row = this.db
			.prepare("SELECT value FROM orchestration_meta WHERE key = :key")
			.get({ key: SCHEMA_VERSION_KEY });

		if (!row) {
			return 0;
		}

		const rawValue = row.value;
		if (typeof rawValue !== "string") {
			throw new Error("Invalid schema version value in orchestration_meta.");
		}

		const parsed = Number.parseInt(rawValue, 10);
		if (!Number.isInteger(parsed) || parsed < 0) {
			throw new Error(`Invalid schema version in orchestration_meta: ${rawValue}`);
		}
		return parsed;
	}

	private setSchemaVersion(version: number): void {
		this.db
			.prepare(
				`INSERT INTO orchestration_meta (key, value)
				 VALUES (:key, :value)
				 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			)
			.run({ key: SCHEMA_VERSION_KEY, value: String(version) });
	}

	private recordCompaction(jobId: string, now: Date, policy: RunRetentionPolicy, deletedRuns: number): void {
		this.db
			.prepare(
				`INSERT INTO compaction_history (job_id, compacted_at, deleted_runs, policy_json)
				 VALUES (:jobId, :compactedAt, :deletedRuns, :policyJson)`,
			)
			.run({
				jobId,
				compactedAt: now.toISOString(),
				deletedRuns,
				policyJson: JSON.stringify({
					maxRunsPerJob: policy.maxRunsPerJob,
					maxAgeMs: policy.maxAgeMs,
				}),
			});
	}

	private readCount(sql: string): number {
		const row = this.db.prepare(sql).get();
		if (!row) {
			return 0;
		}
		return readNumber(row, "count_value");
	}
}

export function createSqliteOrchestrationStore(options: SqliteOrchestrationStoreOptions): SqliteOrchestrationStore {
	return new SqliteOrchestrationStore(options);
}

function decodeJobRow(row: Record<string, SQLOutputValue>): JobDefinition {
	const triggerJson = readString(row, "trigger_json");
	const retryJson = readString(row, "retry_json");
	return {
		id: readString(row, "id"),
		name: readString(row, "name"),
		trigger: parseTrigger(triggerJson),
		retry: parseRetryPolicy(retryJson),
	};
}

function decodeRunRow(row: Record<string, SQLOutputValue>): RunRecord {
	return {
		jobId: readString(row, "job_id"),
		runId: readString(row, "run_id"),
		status: parseRunStatus(readString(row, "status")),
		attempt: readNumber(row, "attempt"),
		queuedAt: readString(row, "queued_at"),
		startedAt: readOptionalString(row, "started_at"),
		finishedAt: readOptionalString(row, "finished_at"),
		lastError: readOptionalString(row, "last_error"),
	};
}

function parseTrigger(json: string): Trigger {
	const value = parseJsonRecord(json);
	if (value.kind === "cron" && typeof value.expression === "string") {
		return { kind: "cron", expression: value.expression };
	}
	if (value.kind === "heartbeat" && typeof value.intervalMs === "number") {
		return { kind: "heartbeat", intervalMs: value.intervalMs };
	}
	throw new Error("Invalid trigger payload in sqlite store.");
}

function parseRetryPolicy(json: string): RetryPolicy {
	const value = parseJsonRecord(json);
	if (
		typeof value.maxRetries === "number" &&
		typeof value.baseDelayMs === "number" &&
		typeof value.maxDelayMs === "number"
	) {
		return {
			maxRetries: value.maxRetries,
			baseDelayMs: value.baseDelayMs,
			maxDelayMs: value.maxDelayMs,
		};
	}
	throw new Error("Invalid retry policy payload in sqlite store.");
}

function parseRunStatus(status: string): RunRecord["status"] {
	if (
		status === "queued" ||
		status === "running" ||
		status === "succeeded" ||
		status === "failed" ||
		status === "canceled"
	) {
		return status;
	}
	throw new Error(`Invalid run status in sqlite store: ${status}`);
}

function isRunStatus(status: string): status is RunStatus {
	return (
		status === "queued" ||
		status === "running" ||
		status === "succeeded" ||
		status === "failed" ||
		status === "canceled"
	);
}

function parseJsonRecord(json: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(json);
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Invalid JSON payload in sqlite store.");
	}
	return parsed as Record<string, unknown>;
}

function readString(row: Record<string, SQLOutputValue>, key: string): string {
	const value = row[key];
	if (typeof value !== "string") {
		throw new Error(`Expected string value for ${key}`);
	}
	return value;
}

function readOptionalString(row: Record<string, SQLOutputValue>, key: string): string | undefined {
	const value = row[key];
	if (value === null || value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new Error(`Expected nullable string value for ${key}`);
	}
	return value;
}

function readNumber(row: Record<string, SQLOutputValue>, key: string): number {
	const value = row[key];
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "bigint") {
		return Number(value);
	}
	throw new Error(`Expected numeric value for ${key}`);
}

function createEmptyRunStatusCounts(): Record<RunStatus, number> {
	return {
		queued: 0,
		running: 0,
		succeeded: 0,
		failed: 0,
		canceled: 0,
	};
}
