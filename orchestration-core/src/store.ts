import type { JobDefinition, RunRecord, RunStatus } from "./types.js";

export interface RunRetentionPolicy {
	maxRunsPerJob?: number;
	maxAgeMs?: number;
	now?: Date;
}

export interface StoreStats {
	backend: "in_memory" | "sqlite";
	generatedAt: string;
	jobCount: number;
	runCount: number;
	runsByStatus: Record<RunStatus, number>;
	lastCompactionAtByJob: Record<string, string>;
	metadata: Record<string, string | number | boolean | null>;
}

export interface StoreStatsOptions {
	now?: Date;
}

export interface OrchestrationStore {
	upsertJob(job: JobDefinition): Promise<void>;
	getJob(jobId: string): Promise<JobDefinition | undefined>;
	listJobs(): Promise<JobDefinition[]>;
	deleteJob(jobId: string): Promise<boolean>;

	upsertRun(run: RunRecord): Promise<void>;
	getRun(runId: string): Promise<RunRecord | undefined>;
	listRuns(jobId: string): Promise<RunRecord[]>;
	deleteRunsForJob(jobId: string): Promise<number>;
	pruneRuns(jobId: string, policy: RunRetentionPolicy): Promise<number>;
	getStats(options?: StoreStatsOptions): Promise<StoreStats>;
}

export class InMemoryOrchestrationStore implements OrchestrationStore {
	private readonly jobs = new Map<string, JobDefinition>();
	private readonly runs = new Map<string, RunRecord>();
	private readonly runsByJobId = new Map<string, Set<string>>();

	async upsertJob(job: JobDefinition): Promise<void> {
		this.jobs.set(job.id, { ...job });
	}

	async getJob(jobId: string): Promise<JobDefinition | undefined> {
		const job = this.jobs.get(jobId);
		return job ? { ...job } : undefined;
	}

	async listJobs(): Promise<JobDefinition[]> {
		return [...this.jobs.values()].map((job) => ({ ...job }));
	}

	async deleteJob(jobId: string): Promise<boolean> {
		const existed = this.jobs.delete(jobId);
		if (existed) {
			await this.deleteRunsForJob(jobId);
		}
		return existed;
	}

	async upsertRun(run: RunRecord): Promise<void> {
		this.runs.set(run.runId, { ...run });
		if (!this.runsByJobId.has(run.jobId)) {
			this.runsByJobId.set(run.jobId, new Set<string>());
		}
		this.runsByJobId.get(run.jobId)?.add(run.runId);
	}

	async getRun(runId: string): Promise<RunRecord | undefined> {
		const run = this.runs.get(runId);
		return run ? { ...run } : undefined;
	}

	async listRuns(jobId: string): Promise<RunRecord[]> {
		const runIds = this.runsByJobId.get(jobId);
		if (!runIds) return [];
		const records: RunRecord[] = [];
		for (const runId of runIds) {
			const run = this.runs.get(runId);
			if (run) {
				records.push({ ...run });
			}
		}
		return records;
	}

	async deleteRunsForJob(jobId: string): Promise<number> {
		const runIds = this.runsByJobId.get(jobId);
		if (!runIds) return 0;
		let count = 0;
		for (const runId of runIds) {
			if (this.runs.delete(runId)) {
				count += 1;
			}
		}
		this.runsByJobId.delete(jobId);
		return count;
	}

	async pruneRuns(jobId: string, policy: RunRetentionPolicy): Promise<number> {
		const runIds = this.runsByJobId.get(jobId);
		if (!runIds) {
			return 0;
		}

		let deleted = 0;
		const nowIso = (policy.now ?? new Date()).toISOString();
		const cutoffIso =
			typeof policy.maxAgeMs === "number" && policy.maxAgeMs > 0
				? new Date(Date.parse(nowIso) - policy.maxAgeMs).toISOString()
				: undefined;

		if (cutoffIso) {
			for (const runId of [...runIds]) {
				const run = this.runs.get(runId);
				if (!run) {
					runIds.delete(runId);
					continue;
				}
				if (runSortTimestamp(run) < cutoffIso) {
					this.runs.delete(runId);
					runIds.delete(runId);
					deleted += 1;
				}
			}
		}

		if (typeof policy.maxRunsPerJob === "number" && policy.maxRunsPerJob >= 0) {
			const runs = [...runIds]
				.map((runId) => this.runs.get(runId))
				.filter((run): run is RunRecord => Boolean(run))
				.sort((a, b) => runSortTimestamp(b).localeCompare(runSortTimestamp(a)));

			const overflow = runs.slice(policy.maxRunsPerJob);
			for (const run of overflow) {
				if (this.runs.delete(run.runId)) {
					runIds.delete(run.runId);
					deleted += 1;
				}
			}
		}

		if (runIds.size === 0) {
			this.runsByJobId.delete(jobId);
		}

		return deleted;
	}

	async getStats(options: StoreStatsOptions = {}): Promise<StoreStats> {
		const now = options.now ?? new Date();
		const runsByStatus = createEmptyRunStatusCounts();

		for (const run of this.runs.values()) {
			runsByStatus[run.status] += 1;
		}

		return {
			backend: "in_memory",
			generatedAt: now.toISOString(),
			jobCount: this.jobs.size,
			runCount: this.runs.size,
			runsByStatus,
			lastCompactionAtByJob: {},
			metadata: {},
		};
	}
}

export function createInMemoryOrchestrationStore(): OrchestrationStore {
	return new InMemoryOrchestrationStore();
}

function runSortTimestamp(run: RunRecord): string {
	return run.finishedAt ?? run.startedAt ?? run.queuedAt;
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
