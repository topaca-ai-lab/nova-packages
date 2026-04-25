import type { EmbeddingProvider } from "./interfaces/embedding-provider.js";
import type { MemoryStore } from "./interfaces/memory-store.js";
import type { VectorIndex } from "./interfaces/vector-index.js";
import {
	cloneEntry,
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
	MemoryQuery,
	MemoryQueryDiagnostics,
	MemoryQueryResult,
	MemoryRemoveRequest,
	MemoryRemoveResult,
	MemoryStoreHealth,
	MemoryUpsertEntry,
	RetrievalProfile,
} from "./types.js";

export interface InMemoryMemoryStoreOptions {
	now?: () => Date;
	idFactory?: () => string;
	embeddingProvider?: EmbeddingProvider;
	vectorIndex?: VectorIndex;
}

type StoredEntryMap = Map<string, MemoryEntry>;

export class InMemoryMemoryStore implements MemoryStore {
	public readonly backend = "in_memory";
	private readonly entries: StoredEntryMap = new Map();
	private readonly now: () => Date;
	private readonly idFactory: () => string;
	private readonly embeddingProvider?: EmbeddingProvider;
	private readonly vectorIndex?: VectorIndex;

	public constructor(options: InMemoryMemoryStoreOptions = {}) {
		this.now = options.now ?? (() => new Date());
		this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.embeddingProvider = options.embeddingProvider;
		this.vectorIndex = options.vectorIndex;
	}

	public async upsert(entry: MemoryUpsertEntry): Promise<MemoryEntry> {
		const nowIso = this.now().toISOString();
		const id = entry.id ?? this.idFactory();
		const key = toStoreKey(entry.namespace, id);
		const existing = this.entries.get(key);
		const createdAt = existing?.createdAt ?? entry.createdAt ?? nowIso;
		const version = (existing?.version ?? 0) + 1;
		const normalized: MemoryEntry = {
			id,
			namespace: entry.namespace,
			kind: entry.kind,
			content: {
				text: entry.content.text,
				structured: entry.content.structured,
			},
			tags: normalizeTags(entry.tags ?? existing?.tags ?? []),
			provenance: entry.provenance ?? existing?.provenance,
			createdAt,
			updatedAt: entry.updatedAt ?? nowIso,
			expiresAt: entry.expiresAt,
			deletedAt: undefined,
			version,
		};
		this.entries.set(key, normalized);
		await this.upsertVectorForEntry(normalized);
		return cloneEntry(normalized);
	}

	public async upsertMany(entries: readonly MemoryUpsertEntry[]): Promise<readonly MemoryEntry[]> {
		const results: MemoryEntry[] = [];
		for (const entry of entries) {
			results.push(await this.upsert(entry));
		}
		return results;
	}

	public async getById(id: MemoryEntryId, namespace?: string): Promise<MemoryEntry | undefined> {
		const now = this.now();
		if (namespace) {
			const match = this.entries.get(toStoreKey(namespace, id));
			if (!match || !isVisible(match, { includeDeleted: false }, now)) {
				return undefined;
			}
			return cloneEntry(match);
		}

		for (const entry of this.entries.values()) {
			if (entry.id !== id) {
				continue;
			}
			if (!isVisible(entry, { includeDeleted: false }, now)) {
				continue;
			}
			return cloneEntry(entry);
		}

		return undefined;
	}

	public async query(request: MemoryQuery): Promise<MemoryQueryResult> {
		const now = this.now();
		const limit = normalizeLimit(request.limit);
		const offset = decodeCursor(request.cursor);
		const profile = request.profile ?? "lexical";
		const filter = request.filter ?? {};
		const filteredEntries = Array.from(this.entries.values()).filter((entry) => isVisible(entry, filter, now));

		const vectorContext = await this.resolveVectorScores(request, profile, filteredEntries.map((entry) => entry.id));
		const weighted = filteredEntries.map((entry) => {
			const vectorScore = vectorContext.vectorScores.get(entry.id) ?? 0;
			return toScoredHit(entry, request, profile, now, vectorScore);
		});
		weighted.sort((a, b) => compareHits(a, b));

		const paginated = weighted.slice(offset, offset + limit);
		const nextOffset = offset + limit;
		const nextCursor: MemoryCursor | undefined = nextOffset < weighted.length ? encodeCursor(nextOffset) : undefined;

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

		for (const key of targets) {
			const entry = this.entries.get(key);
			if (!entry) {
				continue;
			}
			if (request.hardDelete) {
				this.entries.delete(key);
				await this.vectorIndex?.remove([entry.id], entry.namespace);
				hardDeletedCount += 1;
				continue;
			}
			if (!entry.deletedAt) {
				this.entries.set(key, {
					...entry,
					deletedAt: nowIso,
					updatedAt: nowIso,
					version: entry.version + 1,
				});
				softDeletedCount += 1;
			}
		}

		return {
			removedCount: softDeletedCount + hardDeletedCount,
			softDeletedCount,
			hardDeletedCount,
		};
	}

	public async compact(request?: MemoryCompactionRequest): Promise<MemoryCompactionResult> {
		const now = request?.now ? new Date(request.now) : this.now();
		const nowIso = now.toISOString();
		let scannedCount = 0;
		let removedCount = 0;
		const namespace = request?.namespace;
		const maxAgeMs = request?.maxAgeMs;
		const maxEntries = request?.maxEntries;
		const byNamespace = new Map<string, MemoryEntry[]>();
		const removedByNamespace = new Map<string, string[]>();

		for (const [key, entry] of this.entries.entries()) {
			if (namespace && entry.namespace !== namespace) {
				continue;
			}
			scannedCount += 1;
			if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= now.getTime()) {
				this.entries.delete(key);
				pushRemovedEntry(removedByNamespace, entry.namespace, entry.id);
				removedCount += 1;
				continue;
			}
			if (maxAgeMs !== undefined) {
				const age = now.getTime() - new Date(entry.updatedAt).getTime();
				if (age > maxAgeMs) {
					this.entries.delete(key);
					pushRemovedEntry(removedByNamespace, entry.namespace, entry.id);
					removedCount += 1;
					continue;
				}
			}
			const list = byNamespace.get(entry.namespace) ?? [];
			list.push(entry);
			byNamespace.set(entry.namespace, list);
		}

		if (maxEntries !== undefined && maxEntries >= 0) {
			for (const [ns, entries] of byNamespace.entries()) {
				const active = entries
					.filter((entry) => !entry.deletedAt)
					.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
				const overflow = active.length - maxEntries;
				if (overflow <= 0) {
					continue;
				}
				for (const entry of active.slice(0, overflow)) {
					this.entries.delete(toStoreKey(ns, entry.id));
					pushRemovedEntry(removedByNamespace, ns, entry.id);
					removedCount += 1;
				}
			}
		}

		await this.removeVectorsForDeletedEntries(removedByNamespace);

		return {
			scannedCount,
			removedCount,
			compactedAt: nowIso,
		};
	}

	public async health(): Promise<MemoryStoreHealth> {
		return {
			backend: this.backend,
			ok: true,
		};
	}

	private resolveTargets(request: MemoryRemoveRequest): string[] {
		const keys = new Set<string>();
		if (request.id) {
			for (const entry of this.entries.values()) {
				if (entry.id === request.id) {
					keys.add(toStoreKey(entry.namespace, entry.id));
				}
			}
		}
		if (request.ids && request.ids.length > 0) {
			const idSet = new Set(request.ids);
			for (const entry of this.entries.values()) {
				if (idSet.has(entry.id)) {
					keys.add(toStoreKey(entry.namespace, entry.id));
				}
			}
		}
		if (request.filter) {
			const now = this.now();
			for (const entry of this.entries.values()) {
				if (isVisible(entry, { ...request.filter, includeDeleted: true }, now)) {
					keys.add(toStoreKey(entry.namespace, entry.id));
				}
			}
		}
		return Array.from(keys);
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
}

export function createInMemoryMemoryStore(options: InMemoryMemoryStoreOptions = {}): InMemoryMemoryStore {
	return new InMemoryMemoryStore(options);
}

function toStoreKey(namespace: string, id: string): string {
	return `${namespace}::${id}`;
}

function pushRemovedEntry(map: Map<string, string[]>, namespace: string, id: string): void {
	const list = map.get(namespace) ?? [];
	list.push(id);
	map.set(namespace, list);
}
