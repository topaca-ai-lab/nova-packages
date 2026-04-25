import type {
	MemoryCompactionRequest,
	MemoryCompactionResult,
	MemoryEntry,
	MemoryEntryId,
	MemoryQuery,
	MemoryQueryResult,
	MemoryRemoveRequest,
	MemoryRemoveResult,
	MemoryStoreHealth,
	MemoryUpsertEntry,
} from "../types.js";

export interface MemoryStore {
	readonly backend: string;

	upsert(entry: MemoryUpsertEntry): Promise<MemoryEntry>;
	upsertMany(entries: readonly MemoryUpsertEntry[]): Promise<readonly MemoryEntry[]>;

	getById(id: MemoryEntryId, namespace?: string): Promise<MemoryEntry | undefined>;
	query(request: MemoryQuery): Promise<MemoryQueryResult>;

	remove(request: MemoryRemoveRequest): Promise<MemoryRemoveResult>;
	compact(request?: MemoryCompactionRequest): Promise<MemoryCompactionResult>;

	health(): Promise<MemoryStoreHealth>;
}
