import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import type { EmbeddingProvider } from "./interfaces/embedding-provider.js";
import type { MemoryStore } from "./interfaces/memory-store.js";
import type { VectorIndex } from "./interfaces/vector-index.js";
import {
	compareHits,
	decodeCursor,
	encodeCursor,
	isVisible,
	normalizeLimit,
	normalizeTags,
	toScoredHit,
} from "./query-utils.js";
import type {
	MemoryCompactionRequest,
	MemoryCompactionResult,
	MemoryCursor,
	MemoryEntry,
	MemoryEntryId,
	MemoryFilter,
	MemoryQuery,
	MemoryQueryDiagnostics,
	MemoryQueryResult,
	MemoryRemoveRequest,
	MemoryRemoveResult,
	MemoryStoreHealth,
	MemoryTag,
	MemoryUpsertEntry,
	RetrievalProfile,
} from "./types.js";

interface SchemaMigration {
	version: number;
	statements: string[];
}

const SCHEMA_VERSION_KEY = "schema_version";
const SCHEMA_MIGRATIONS: SchemaMigration[] = [
	{
		version: 1,
		statements: [
			`CREATE TABLE IF NOT EXISTS metadata (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS memory_entries (
				namespace TEXT NOT NULL,
				id TEXT NOT NULL,
				kind TEXT NOT NULL,
				content_text TEXT NOT NULL,
				content_structured_json TEXT,
				tags_json TEXT NOT NULL,
				provenance_json TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				expires_at TEXT,
				deleted_at TEXT,
				version INTEGER NOT NULL,
				PRIMARY KEY(namespace, id)
			)`,
			"CREATE INDEX IF NOT EXISTS idx_memory_entries_namespace_updated ON memory_entries(namespace, updated_at DESC)",
			"CREATE INDEX IF NOT EXISTS idx_memory_entries_kind ON memory_entries(kind)",
			"CREATE INDEX IF NOT EXISTS idx_memory_entries_expires ON memory_entries(expires_at)",
		],
	},
];

export interface SqliteMemoryStoreOptions {
	path: string;
	timeoutMs?: number;
	now?: () => Date;
	embeddingProvider?: EmbeddingProvider;
	vectorIndex?: VectorIndex;
}

export class SqliteMemoryStore implements MemoryStore {
	public readonly backend = "sqlite";
	private readonly db: DatabaseSync;
	private readonly now: () => Date;
	private readonly embeddingProvider?: EmbeddingProvider;
	private readonly vectorIndex?: VectorIndex;

	public constructor(options: SqliteMemoryStoreOptions) {
		this.db = new DatabaseSync(options.path, {
			timeout: options.timeoutMs ?? 1_000,
		});
		this.now = options.now ?? (() => new Date());
		this.embeddingProvider = options.embeddingProvider;
		this.vectorIndex = options.vectorIndex;
		this.migrate();
	}

	public close(): void {
		if (this.db.isOpen) {
			this.db.close();
		}
	}

	public getSchemaVersion(): number {
		return this.readSchemaVersion();
	}

	public async upsert(entry: MemoryUpsertEntry): Promise<MemoryEntry> {
		const nowIso = this.now().toISOString();
		const id = entry.id ?? crypto.randomUUID();
		const existing = this.db
			.prepare("SELECT created_at, version FROM memory_entries WHERE namespace = :namespace AND id = :id")
			.get({
				namespace: entry.namespace,
				id,
			});
		const createdAt = readOptionalString(existing, "created_at") ?? entry.createdAt ?? nowIso;
		const version = (readOptionalNumber(existing, "version") ?? 0) + 1;
		const tags = normalizeTags(entry.tags ?? []);
		this.db
			.prepare(
				`INSERT INTO memory_entries (
					namespace, id, kind, content_text, content_structured_json, tags_json,
					provenance_json, created_at, updated_at, expires_at, deleted_at, version
				) VALUES (
					:namespace, :id, :kind, :contentText, :contentStructuredJson, :tagsJson,
					:provenanceJson, :createdAt, :updatedAt, :expiresAt, NULL, :version
				)
				ON CONFLICT(namespace, id) DO UPDATE SET
					kind = excluded.kind,
					content_text = excluded.content_text,
					content_structured_json = excluded.content_structured_json,
					tags_json = excluded.tags_json,
					provenance_json = excluded.provenance_json,
					updated_at = excluded.updated_at,
					expires_at = excluded.expires_at,
					deleted_at = excluded.deleted_at,
					version = excluded.version`,
			)
			.run({
				namespace: entry.namespace,
				id,
				kind: entry.kind,
				contentText: entry.content.text,
				contentStructuredJson: entry.content.structured ? JSON.stringify(entry.content.structured) : null,
				tagsJson: JSON.stringify(tags),
				provenanceJson: entry.provenance ? JSON.stringify(entry.provenance) : null,
				createdAt,
				updatedAt: entry.updatedAt ?? nowIso,
				expiresAt: entry.expiresAt ?? null,
				version,
			});

		const row = this.db
			.prepare("SELECT * FROM memory_entries WHERE namespace = :namespace AND id = :id")
			.get({ namespace: entry.namespace, id });
		if (!row) {
			throw new Error(`SQLite memory upsert failed for ${entry.namespace}/${id}.`);
		}
		const decoded = decodeEntryRow(row);
		await this.upsertVectorForEntry(decoded);
		return decoded;
	}

	public async upsertMany(entries: readonly MemoryUpsertEntry[]): Promise<readonly MemoryEntry[]> {
		const outputs: MemoryEntry[] = [];
		for (const entry of entries) {
			outputs.push(await this.upsert(entry));
		}
		return outputs;
	}

	public async getById(id: MemoryEntryId, namespace?: string): Promise<MemoryEntry | undefined> {
		const now = this.now();
		if (namespace) {
			const row = this.db
				.prepare("SELECT * FROM memory_entries WHERE namespace = :namespace AND id = :id")
				.get({ namespace, id });
			if (!row) {
				return undefined;
			}
			const entry = decodeEntryRow(row);
			if (!isVisible(entry, { includeDeleted: false }, now)) {
				return undefined;
			}
			return entry;
		}

		const rows = this.db.prepare("SELECT * FROM memory_entries WHERE id = :id ORDER BY namespace ASC").all({ id });
		for (const row of rows) {
			const entry = decodeEntryRow(row);
			if (!isVisible(entry, { includeDeleted: false }, now)) {
				continue;
			}
			return entry;
		}
		return undefined;
	}

	public async query(request: MemoryQuery): Promise<MemoryQueryResult> {
		const now = this.now();
		const limit = normalizeLimit(request.limit);
		const offset = decodeCursor(request.cursor);
		const profile = request.profile ?? "lexical";
		const filter = request.filter ?? {};
		const rows = this.db.prepare("SELECT * FROM memory_entries").all();
		const filtered = rows.map(decodeEntryRow).filter((entry) => isVisible(entry, filter, now));

		const vectorContext = await this.resolveVectorScores(request, profile, filtered.map((entry) => entry.id));
		const hits = filtered.map((entry) => {
			const vectorScore = vectorContext.vectorScores.get(entry.id) ?? 0;
			return toScoredHit(entry, request, profile, now, vectorScore);
		});
		hits.sort((a, b) => compareHits(a, b));

		const paginated = hits.slice(offset, offset + limit);
		const nextOffset = offset + limit;
		const nextCursor: MemoryCursor | undefined = nextOffset < hits.length ? encodeCursor(nextOffset) : undefined;

		const diagnostics: MemoryQueryDiagnostics | undefined = request.includeDiagnostics
			? {
					storeBackend: this.backend,
					retrievalProfile: profile,
					vectorUsed: vectorContext.vectorUsed,
					vectorBackend: this.vectorIndex?.backend,
					embeddingProvider: this.embeddingProvider?.provider,
					fallbackReason: vectorContext.fallbackReason,
				}
			: undefined;

		return {
			hits: paginated,
			nextCursor,
			diagnostics,
		};
	}

	public async remove(request: MemoryRemoveRequest): Promise<MemoryRemoveResult> {
		const nowIso = this.now().toISOString();
		const targets = this.resolveTargets(request);
		let softDeletedCount = 0;
		let hardDeletedCount = 0;

		for (const target of targets) {
			if (request.hardDelete) {
				const result = this.db
					.prepare("DELETE FROM memory_entries WHERE namespace = :namespace AND id = :id")
					.run(target);
				hardDeletedCount += Number(result.changes);
				if (Number(result.changes) > 0) {
					await this.vectorIndex?.remove([target.id], target.namespace);
				}
				continue;
			}
			const result = this.db
				.prepare(
					`UPDATE memory_entries
					 SET deleted_at = :deletedAt,
					     updated_at = :updatedAt,
					     version = version + 1
					 WHERE namespace = :namespace AND id = :id AND deleted_at IS NULL`,
				)
				.run({
					namespace: target.namespace,
					id: target.id,
					deletedAt: nowIso,
					updatedAt: nowIso,
				});
			softDeletedCount += Number(result.changes);
		}

		return {
			removedCount: softDeletedCount + hardDeletedCount,
			softDeletedCount,
			hardDeletedCount,
		};
	}

	public async compact(request?: MemoryCompactionRequest): Promise<MemoryCompactionResult> {
		const now = request?.now ? new Date(request.now) : this.now();
		const namespace = request?.namespace;
		const maxAgeMs = request?.maxAgeMs;
		const maxEntries = request?.maxEntries;
		const rows = namespace
			? this.db.prepare("SELECT * FROM memory_entries WHERE namespace = :namespace").all({ namespace })
			: this.db.prepare("SELECT * FROM memory_entries").all();
		const entries = rows.map(decodeEntryRow);
		let removedCount = 0;
		const removedByNamespace = new Map<string, string[]>();

		for (const entry of entries) {
			if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= now.getTime()) {
				removedCount += this.deleteEntry(entry.namespace, entry.id);
				pushRemovedEntry(removedByNamespace, entry.namespace, entry.id);
				continue;
			}
			if (maxAgeMs !== undefined) {
				const ageMs = now.getTime() - new Date(entry.updatedAt).getTime();
				if (ageMs > maxAgeMs) {
					removedCount += this.deleteEntry(entry.namespace, entry.id);
					pushRemovedEntry(removedByNamespace, entry.namespace, entry.id);
				}
			}
		}

		if (maxEntries !== undefined && maxEntries >= 0) {
			const remainingRows = namespace
				? this.db.prepare("SELECT * FROM memory_entries WHERE namespace = :namespace").all({ namespace })
				: this.db.prepare("SELECT * FROM memory_entries").all();
			const remaining = remainingRows.map(decodeEntryRow);
			const byNamespace = new Map<string, MemoryEntry[]>();
			for (const entry of remaining) {
				const list = byNamespace.get(entry.namespace) ?? [];
				list.push(entry);
				byNamespace.set(entry.namespace, list);
			}
			for (const [ns, nsEntries] of byNamespace.entries()) {
				const active = nsEntries
					.filter((entry) => !entry.deletedAt)
					.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
				const overflow = active.length - maxEntries;
				if (overflow <= 0) {
					continue;
				}
				for (const entry of active.slice(0, overflow)) {
					removedCount += this.deleteEntry(ns, entry.id);
					pushRemovedEntry(removedByNamespace, ns, entry.id);
				}
			}
		}

		await this.removeVectorsForDeletedEntries(removedByNamespace);

		return {
			scannedCount: entries.length,
			removedCount,
			compactedAt: now.toISOString(),
		};
	}

	public async health(): Promise<MemoryStoreHealth> {
		return {
			backend: this.backend,
			ok: true,
		};
	}

	private resolveTargets(request: MemoryRemoveRequest): Array<{ namespace: string; id: string }> {
		const targets = new Map<string, { namespace: string; id: string }>();
		if (request.id) {
			const rows = this.db.prepare("SELECT namespace, id FROM memory_entries WHERE id = :id").all({ id: request.id });
			for (const row of rows) {
				const namespace = readString(row, "namespace");
				const id = readString(row, "id");
				targets.set(`${namespace}::${id}`, { namespace, id });
			}
		}
		if (request.ids && request.ids.length > 0) {
			for (const id of request.ids) {
				const rows = this.db.prepare("SELECT namespace, id FROM memory_entries WHERE id = :id").all({ id });
				for (const row of rows) {
					const namespace = readString(row, "namespace");
					const rowId = readString(row, "id");
					targets.set(`${namespace}::${rowId}`, { namespace, id: rowId });
				}
			}
		}
		if (request.filter) {
			const now = this.now();
			const rows = this.db.prepare("SELECT * FROM memory_entries").all();
			for (const row of rows) {
				const entry = decodeEntryRow(row);
				if (!isVisible(entry, { ...request.filter, includeDeleted: true }, now)) {
					continue;
				}
				targets.set(`${entry.namespace}::${entry.id}`, {
					namespace: entry.namespace,
					id: entry.id,
				});
			}
		}
		return Array.from(targets.values());
	}

	private deleteEntry(namespace: string, id: string): number {
		const result = this.db
			.prepare("DELETE FROM memory_entries WHERE namespace = :namespace AND id = :id")
			.run({ namespace, id });
		return Number(result.changes);
	}

	private async resolveVectorScores(
		request: MemoryQuery,
		profile: RetrievalProfile,
		entryIds: readonly string[],
	): Promise<{ vectorScores: Map<string, number>; vectorUsed: boolean; fallbackReason?: string }> {
		const vectorScores = new Map<string, number>();
		if (profile === "lexical") {
			return { vectorScores, vectorUsed: false };
		}
		if (!this.vectorIndex) {
			return { vectorScores, vectorUsed: false, fallbackReason: "vector_index_unavailable" };
		}

		let queryVector = request.queryVector;
		if (!queryVector) {
			if (!request.text) {
				return { vectorScores, vectorUsed: false, fallbackReason: "missing_query_text" };
			}
			if (!this.embeddingProvider) {
				return { vectorScores, vectorUsed: false, fallbackReason: "embedding_provider_unavailable" };
			}
			const embedding = await this.embeddingProvider.embed({ texts: [request.text] });
			queryVector = embedding.vectors[0];
		}
		if (!queryVector || queryVector.length === 0) {
			return { vectorScores, vectorUsed: false, fallbackReason: "empty_query_vector" };
		}

		const idSet = new Set(entryIds);
		const vectorResults = await this.vectorIndex.search({
			namespace: request.filter?.namespaces?.length === 1 ? request.filter.namespaces[0] : undefined,
			limit: Math.max(entryIds.length, normalizeLimit(request.limit)),
			vector: queryVector,
			filter: request.filter,
		});
		for (const hit of vectorResults) {
			if (!idSet.has(hit.entryId)) {
				continue;
			}
			const current = vectorScores.get(hit.entryId);
			if (current === undefined || hit.score > current) {
				vectorScores.set(hit.entryId, hit.score);
			}
		}
		return { vectorScores, vectorUsed: true };
	}

	private async upsertVectorForEntry(entry: MemoryEntry): Promise<void> {
		if (!this.vectorIndex || !this.embeddingProvider) {
			return;
		}
		const response = await this.embeddingProvider.embed({ texts: [entry.content.text] });
		const vector = response.vectors[0];
		if (!vector || vector.length === 0) {
			return;
		}
		await this.vectorIndex.upsert([
			{
				entryId: entry.id,
				namespace: entry.namespace,
				vector,
				updatedAt: entry.updatedAt,
			},
		]);
	}

	private async removeVectorsForDeletedEntries(removedByNamespace: Map<string, string[]>): Promise<void> {
		if (!this.vectorIndex) {
			return;
		}
		for (const [namespace, ids] of removedByNamespace.entries()) {
			if (ids.length === 0) {
				continue;
			}
			await this.vectorIndex.remove(ids, namespace);
		}
	}

	private migrate(): void {
		this.db.exec("BEGIN");
		try {
			let current = this.readSchemaVersion();
			for (const migration of SCHEMA_MIGRATIONS) {
				if (migration.version <= current) {
					continue;
				}
				for (const statement of migration.statements) {
					this.db.exec(statement);
				}
				current = migration.version;
				this.writeSchemaVersion(current);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	private readSchemaVersion(): number {
		const hasMetadata = this.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'metadata'")
			.get();
		if (!hasMetadata) {
			return 0;
		}
		const row = this.db.prepare("SELECT value FROM metadata WHERE key = :key").get({ key: SCHEMA_VERSION_KEY });
		const version = readOptionalNumberString(row, "value");
		return version ?? 0;
	}

	private writeSchemaVersion(version: number): void {
		this.db
			.prepare(
				`INSERT INTO metadata (key, value) VALUES (:key, :value)
				 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			)
			.run({
				key: SCHEMA_VERSION_KEY,
				value: String(version),
			});
	}
}

export function createSqliteMemoryStore(options: SqliteMemoryStoreOptions): SqliteMemoryStore {
	return new SqliteMemoryStore(options);
}

function decodeEntryRow(row: Record<string, SQLOutputValue>): MemoryEntry {
	return {
		id: readString(row, "id"),
		namespace: readString(row, "namespace"),
		kind: readMemoryKind(row, "kind"),
		content: {
			text: readString(row, "content_text"),
			structured: parseOptionalJsonRecord(readOptionalString(row, "content_structured_json")),
		},
		tags: parseTags(readString(row, "tags_json")),
		provenance: parseOptionalJsonRecord(readOptionalString(row, "provenance_json")) as MemoryEntry["provenance"],
		createdAt: readString(row, "created_at"),
		updatedAt: readString(row, "updated_at"),
		expiresAt: readOptionalString(row, "expires_at"),
		deletedAt: readOptionalString(row, "deleted_at"),
		version: readNumber(row, "version"),
	};
}

function parseTags(tagsJson: string): readonly MemoryTag[] {
	try {
		const parsed = JSON.parse(tagsJson) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}
		const values: string[] = [];
		for (const item of parsed) {
			if (typeof item === "string" && item.trim().length > 0) {
				values.push(item);
			}
		}
		return normalizeTags(values);
	} catch {
		return [];
	}
}

function parseOptionalJsonRecord(value: string | undefined): Record<string, unknown> | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return undefined;
		}
		return parsed as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function readString(row: Record<string, SQLOutputValue> | undefined, key: string): string {
	if (!row) {
		throw new Error(`Expected row for key "${key}"`);
	}
	const value = row[key];
	if (typeof value !== "string") {
		throw new Error(`Expected string for key "${key}", received ${typeof value}`);
	}
	return value;
}

function readOptionalString(row: Record<string, SQLOutputValue> | undefined, key: string): string | undefined {
	if (!row) {
		return undefined;
	}
	const value = row[key];
	if (value === null || value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		return undefined;
	}
	return value;
}

function readNumber(row: Record<string, SQLOutputValue> | undefined, key: string): number {
	if (!row) {
		throw new Error(`Expected row for key "${key}"`);
	}
	const value = row[key];
	if (typeof value !== "number") {
		throw new Error(`Expected number for key "${key}", received ${typeof value}`);
	}
	return value;
}

function readOptionalNumber(row: Record<string, SQLOutputValue> | undefined, key: string): number | undefined {
	if (!row) {
		return undefined;
	}
	const value = row[key];
	if (typeof value !== "number") {
		return undefined;
	}
	return value;
}

function readOptionalNumberString(row: Record<string, SQLOutputValue> | undefined, key: string): number | undefined {
	if (!row) {
		return undefined;
	}
	const value = row[key];
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return undefined;
}

function readMemoryKind(row: Record<string, SQLOutputValue>, key: string): MemoryEntry["kind"] {
	const value = readString(row, key);
	if (value === "working" || value === "episodic" || value === "semantic" || value === "fact") {
		return value;
	}
	return "working";
}

function pushRemovedEntry(map: Map<string, string[]>, namespace: string, id: string): void {
	const list = map.get(namespace) ?? [];
	list.push(id);
	map.set(namespace, list);
}
