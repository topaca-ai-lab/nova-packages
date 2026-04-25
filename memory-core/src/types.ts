export type MemoryEntryId = string;
export type MemoryNamespace = string;
export type MemoryTag = string;
export type MemoryCursor = string;
export type IsoTimestamp = string;

export type MemoryKind = "working" | "episodic" | "semantic" | "fact";
export type RetrievalProfile = "lexical" | "vector" | "hybrid";

export interface MemoryProvenance {
	source?: string;
	sourceRef?: string;
	author?: string;
	traceId?: string;
	sessionId?: string;
}

export interface MemoryContent {
	text: string;
	structured?: Record<string, unknown>;
}

export interface MemoryEntry {
	id: MemoryEntryId;
	namespace: MemoryNamespace;
	kind: MemoryKind;
	content: MemoryContent;
	tags: readonly MemoryTag[];
	provenance?: MemoryProvenance;
	createdAt: IsoTimestamp;
	updatedAt: IsoTimestamp;
	expiresAt?: IsoTimestamp;
	deletedAt?: IsoTimestamp;
	version: number;
}

export interface MemoryUpsertEntry {
	id?: MemoryEntryId;
	namespace: MemoryNamespace;
	kind: MemoryKind;
	content: MemoryContent;
	tags?: readonly MemoryTag[];
	provenance?: MemoryProvenance;
	expiresAt?: IsoTimestamp;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
	version?: number;
}

export interface MemoryPatch {
	content?: Partial<MemoryContent>;
	tags?: readonly MemoryTag[];
	provenance?: MemoryProvenance;
	expiresAt?: IsoTimestamp | null;
	deletedAt?: IsoTimestamp | null;
}

export interface MemoryFilter {
	namespaces?: readonly MemoryNamespace[];
	kinds?: readonly MemoryKind[];
	tagsAll?: readonly MemoryTag[];
	tagsAny?: readonly MemoryTag[];
	createdAfter?: IsoTimestamp;
	createdBefore?: IsoTimestamp;
	updatedAfter?: IsoTimestamp;
	updatedBefore?: IsoTimestamp;
	includeDeleted?: boolean;
}

export interface MemoryQueryWeights {
	lexical?: number;
	vector?: number;
	recency?: number;
}

export interface MemoryQuery {
	text?: string;
	limit?: number;
	cursor?: MemoryCursor;
	filter?: MemoryFilter;
	profile?: RetrievalProfile;
	includeDiagnostics?: boolean;
	weights?: MemoryQueryWeights;
	queryVector?: readonly number[];
}

export interface MemoryScoreBreakdown {
	lexical?: number;
	vector?: number;
	recency?: number;
	final: number;
}

export interface MemoryQueryHit {
	entry: MemoryEntry;
	score: number;
	breakdown?: MemoryScoreBreakdown;
}

export interface MemoryQueryDiagnostics {
	storeBackend: string;
	retrievalProfile: RetrievalProfile;
	vectorUsed: boolean;
	vectorBackend?: string;
	embeddingProvider?: string;
	fallbackReason?: string;
}

export interface MemoryQueryResult {
	hits: readonly MemoryQueryHit[];
	nextCursor?: MemoryCursor;
	diagnostics?: MemoryQueryDiagnostics;
}

export interface MemoryRemoveRequest {
	id?: MemoryEntryId;
	ids?: readonly MemoryEntryId[];
	filter?: MemoryFilter;
	hardDelete?: boolean;
}

export interface MemoryRemoveResult {
	removedCount: number;
	softDeletedCount: number;
	hardDeletedCount: number;
}

export interface MemoryCompactionRequest {
	namespace?: MemoryNamespace;
	maxAgeMs?: number;
	maxEntries?: number;
	now?: IsoTimestamp;
}

export interface MemoryCompactionResult {
	scannedCount: number;
	removedCount: number;
	compactedAt: IsoTimestamp;
}

export interface MemoryStoreHealth {
	backend: string;
	ok: boolean;
	message?: string;
}

export interface MemoryIndexWrite {
	entryId: MemoryEntryId;
	namespace: MemoryNamespace;
	vector: readonly number[];
	updatedAt: IsoTimestamp;
}

export interface MemoryIndexQuery {
	namespace?: MemoryNamespace;
	limit: number;
	vector: readonly number[];
	filter?: MemoryFilter;
}

export interface MemoryIndexHit {
	entryId: MemoryEntryId;
	score: number;
}

export interface EmbeddingRequest {
	texts: readonly string[];
	model?: string;
	signal?: AbortSignal;
}

export interface EmbeddingResponse {
	vectors: readonly (readonly number[])[];
	model?: string;
	dimensions: number;
}

export type MemoryPolicyOperation = "upsert" | "query" | "remove" | "compact";
export type MemoryPolicyAction = "allow" | "deny" | "redact" | "compact";

export interface MemoryPolicyDecision {
	at: IsoTimestamp;
	operation: MemoryPolicyOperation;
	action: MemoryPolicyAction;
	reason: string;
	namespace?: string;
}

export type MemoryRuntimeOperation = "upsert" | "upsert_many" | "query" | "remove" | "compact" | "health";

export interface MemoryRuntimeEvent {
	id: string;
	at: IsoTimestamp;
	backend: string;
	operation: MemoryRuntimeOperation;
	namespace?: string;
	success: boolean;
	durationMs: number;
	error?: string;
	metadata?: Record<string, unknown>;
}

export interface MemoryRuntimeMetrics {
	backend: string;
	generatedAt: IsoTimestamp;
	totalOperations: number;
	errorCount: number;
	perOperationCount: Record<MemoryRuntimeOperation, number>;
	averageLatencyMsByOperation: Record<MemoryRuntimeOperation, number>;
	queryCount: number;
	queryZeroHitCount: number;
	queryHitCountTotal: number;
}

export interface MemoryRuntimeHealth {
	backend: string;
	generatedAt: IsoTimestamp;
	store: MemoryStoreHealth;
	metrics: MemoryRuntimeMetrics;
	recentEventCount: number;
}
