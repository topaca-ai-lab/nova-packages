export type {
	EmbeddingRequest,
	EmbeddingResponse,
	IsoTimestamp,
	MemoryCompactionRequest,
	MemoryCompactionResult,
	MemoryContent,
	MemoryCursor,
	MemoryEntry,
	MemoryEntryId,
	MemoryFilter,
	MemoryIndexHit,
	MemoryIndexQuery,
	MemoryIndexWrite,
	MemoryKind,
	MemoryNamespace,
	MemoryPatch,
	MemoryPolicyAction,
	MemoryPolicyDecision,
	MemoryPolicyOperation,
	MemoryProvenance,
	MemoryQuery,
	MemoryQueryDiagnostics,
	MemoryQueryHit,
	MemoryQueryResult,
	MemoryQueryWeights,
	MemoryRemoveRequest,
	MemoryRemoveResult,
	MemoryRuntimeEvent,
	MemoryRuntimeHealth,
	MemoryRuntimeMetrics,
	MemoryRuntimeOperation,
	MemoryScoreBreakdown,
	MemoryStoreHealth,
	MemoryTag,
	MemoryUpsertEntry,
	RetrievalProfile,
} from "./types.js";
export type { EmbeddingProvider, MemoryPolicy, MemoryPolicyContext, MemoryStore, VectorIndex } from "./interfaces/index.js";
export { createInMemoryMemoryStore, InMemoryMemoryStore } from "./store.in-memory.js";
export type { InMemoryMemoryStoreOptions } from "./store.in-memory.js";
export { createSqliteMemoryStore, SqliteMemoryStore } from "./store.sqlite.js";
export type { SqliteMemoryStoreOptions } from "./store.sqlite.js";
export { createInMemoryVectorIndex, InMemoryVectorIndex } from "./vector-index.in-memory.js";
export { chunkMarkdown, ingestMarkdownDocument } from "./markdown-ingestion.js";
export type { MarkdownIngestionChunk, MarkdownIngestionOptions, MarkdownIngestionResult } from "./markdown-ingestion.js";
export { getWikiPage, listWikiPages, upsertWikiPage, wikiPageId } from "./wiki-memory.js";
export type { WikiPage, WikiPageInput } from "./wiki-memory.js";
export {
	AllowAllMemoryPolicy,
	DefaultMemoryPolicy,
} from "./policies.default.js";
export type { DefaultMemoryPolicyOptions } from "./policies.default.js";
export {
	createPolicyAwareMemoryStore,
	PolicyAwareMemoryStore,
} from "./policy-aware-store.js";
export type { PolicyAwareMemoryStoreOptions } from "./policy-aware-store.js";
export {
	createObservableMemoryStore,
	InMemoryMemoryEventSink,
	ObservableMemoryStore,
} from "./observability.js";
export type {
	MemoryEventSink,
	ObservableEventSnapshotOptions,
	ObservableMemoryStoreOptions,
} from "./observability.js";
export { MemoryPolicyViolationError } from "./errors.js";
export type { MemoryPolicyViolationCode } from "./errors.js";

export const MEMORY_CORE_PHASE = "phase-7" as const;

export function createMemoryCoreSkeleton(): { phase: typeof MEMORY_CORE_PHASE } {
	return {
		phase: MEMORY_CORE_PHASE,
	};
}
