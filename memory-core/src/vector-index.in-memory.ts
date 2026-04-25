import type { VectorIndex } from "./interfaces/vector-index.js";
import type {
	MemoryIndexHit,
	MemoryIndexQuery,
	MemoryIndexWrite,
	MemoryNamespace,
	MemoryStoreHealth,
} from "./types.js";

interface StoredVector {
	namespace: string;
	entryId: string;
	vector: readonly number[];
}

export class InMemoryVectorIndex implements VectorIndex {
	public readonly backend = "in_memory_vector";
	private readonly vectors = new Map<string, StoredVector>();

	public async upsert(vectors: readonly MemoryIndexWrite[]): Promise<void> {
		for (const item of vectors) {
			this.vectors.set(toKey(item.namespace, item.entryId), {
				namespace: item.namespace,
				entryId: item.entryId,
				vector: item.vector,
			});
		}
	}

	public async remove(entryIds: readonly string[], namespace?: MemoryNamespace): Promise<number> {
		let removed = 0;
		for (const entryId of entryIds) {
			if (namespace) {
				const deleted = this.vectors.delete(toKey(namespace, entryId));
				if (deleted) {
					removed += 1;
				}
				continue;
			}
			for (const key of this.vectors.keys()) {
				const vector = this.vectors.get(key);
				if (!vector || vector.entryId !== entryId) {
					continue;
				}
				this.vectors.delete(key);
				removed += 1;
			}
		}
		return removed;
	}

	public async search(query: MemoryIndexQuery): Promise<readonly MemoryIndexHit[]> {
		const scored: MemoryIndexHit[] = [];
		for (const vector of this.vectors.values()) {
			if (query.namespace && vector.namespace !== query.namespace) {
				continue;
			}
			const score = cosineSimilarity(query.vector, vector.vector);
			scored.push({
				entryId: vector.entryId,
				score,
			});
		}
		scored.sort((a, b) => b.score - a.score || a.entryId.localeCompare(b.entryId));
		return scored.slice(0, query.limit);
	}

	public async health(): Promise<MemoryStoreHealth> {
		return {
			backend: this.backend,
			ok: true,
		};
	}
}

export function createInMemoryVectorIndex(): InMemoryVectorIndex {
	return new InMemoryVectorIndex();
}

function toKey(namespace: string, entryId: string): string {
	return `${namespace}::${entryId}`;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
	const size = Math.min(a.length, b.length);
	if (size === 0) {
		return 0;
	}
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < size; i += 1) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		dot += av * bv;
		normA += av * av;
		normB += bv * bv;
	}
	if (normA === 0 || normB === 0) {
		return 0;
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
