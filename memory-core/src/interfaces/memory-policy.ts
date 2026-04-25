import type {
	MemoryCompactionRequest,
	MemoryQuery,
	MemoryRemoveRequest,
	MemoryUpsertEntry,
} from "../types.js";

export interface MemoryPolicyContext {
	namespace?: string;
}

export interface MemoryPolicy {
	beforeUpsert(entry: MemoryUpsertEntry, context?: MemoryPolicyContext): Promise<MemoryUpsertEntry>;
	beforeQuery(query: MemoryQuery, context?: MemoryPolicyContext): Promise<MemoryQuery>;
	beforeRemove(request: MemoryRemoveRequest, context?: MemoryPolicyContext): Promise<MemoryRemoveRequest>;
	beforeCompact(
		request: MemoryCompactionRequest | undefined,
		context?: MemoryPolicyContext,
	): Promise<MemoryCompactionRequest | undefined>;
}
