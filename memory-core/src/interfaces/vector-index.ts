import type {
	MemoryIndexHit,
	MemoryIndexQuery,
	MemoryIndexWrite,
	MemoryNamespace,
	MemoryStoreHealth,
} from "../types.js";

export interface VectorIndex {
	readonly backend: string;

	upsert(vectors: readonly MemoryIndexWrite[]): Promise<void>;
	remove(entryIds: readonly string[], namespace?: MemoryNamespace): Promise<number>;
	search(query: MemoryIndexQuery): Promise<readonly MemoryIndexHit[]>;
	health(): Promise<MemoryStoreHealth>;
}
