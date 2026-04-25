import type { MemoryStore } from "./interfaces/memory-store.js";
import type {
	MemoryCompactionRequest,
	MemoryCompactionResult,
	MemoryEntry,
	MemoryEntryId,
	MemoryQuery,
	MemoryQueryResult,
	MemoryRemoveRequest,
	MemoryRemoveResult,
	MemoryRuntimeEvent,
	MemoryRuntimeHealth,
	MemoryRuntimeMetrics,
	MemoryRuntimeOperation,
	MemoryStoreHealth,
	MemoryUpsertEntry,
} from "./types.js";

export interface MemoryEventSink {
	push(event: MemoryRuntimeEvent): void | Promise<void>;
}

export interface ObservableMemoryStoreOptions {
	store: MemoryStore;
	maxEvents?: number;
	sinks?: readonly MemoryEventSink[];
	onEvent?: (event: MemoryRuntimeEvent) => void | Promise<void>;
	now?: () => Date;
	eventIdFactory?: () => string;
}

export interface ObservableEventSnapshotOptions {
	limit?: number;
	operation?: MemoryRuntimeOperation;
	success?: boolean;
}

const DEFAULT_MAX_EVENTS = 500;
const OPERATIONS: readonly MemoryRuntimeOperation[] = ["upsert", "upsert_many", "query", "remove", "compact", "health"];

export class ObservableMemoryStore implements MemoryStore {
	private readonly store: MemoryStore;
	private readonly now: () => Date;
	private readonly eventIdFactory: () => string;
	private readonly maxEvents: number;
	private readonly sinks: readonly MemoryEventSink[];
	private readonly onEvent?: (event: MemoryRuntimeEvent) => void | Promise<void>;
	private readonly events: MemoryRuntimeEvent[] = [];
	private readonly operationCount: Record<MemoryRuntimeOperation, number> = createOperationCounter();
	private readonly operationTotalLatencyMs: Record<MemoryRuntimeOperation, number> = createOperationCounter();
	private errorCount = 0;
	private queryCount = 0;
	private queryZeroHitCount = 0;
	private queryHitCountTotal = 0;

	public constructor(options: ObservableMemoryStoreOptions) {
		this.store = options.store;
		this.now = options.now ?? (() => new Date());
		this.eventIdFactory = options.eventIdFactory ?? (() => crypto.randomUUID());
		this.maxEvents = normalizeMaxEvents(options.maxEvents);
		this.sinks = options.sinks ?? [];
		this.onEvent = options.onEvent;
	}

	public get backend(): string {
		return this.store.backend;
	}

	public async upsert(entry: MemoryUpsertEntry): Promise<MemoryEntry> {
		return this.runOperation(
			"upsert",
			() => this.store.upsert(entry),
			() => ({ namespace: entry.namespace }),
		);
	}

	public async upsertMany(entries: readonly MemoryUpsertEntry[]): Promise<readonly MemoryEntry[]> {
		return this.runOperation(
			"upsert_many",
			() => this.store.upsertMany(entries),
			() => ({
				namespace: entries[0]?.namespace,
				metadata: { count: entries.length },
			}),
		);
	}

	public async getById(id: MemoryEntryId, namespace?: string): Promise<MemoryEntry | undefined> {
		return this.store.getById(id, namespace);
	}

	public async query(request: MemoryQuery): Promise<MemoryQueryResult> {
		return this.runOperation(
			"query",
			async () => {
				const result = await this.store.query(request);
				this.queryCount += 1;
				this.queryHitCountTotal += result.hits.length;
				if (result.hits.length === 0) {
					this.queryZeroHitCount += 1;
				}
				return result;
			},
			(result) => ({
				namespace: request.filter?.namespaces?.[0],
				metadata: {
					hitCount: result?.hits.length ?? 0,
					profile: request.profile ?? "lexical",
				},
			}),
		);
	}

	public async remove(request: MemoryRemoveRequest): Promise<MemoryRemoveResult> {
		return this.runOperation(
			"remove",
			() => this.store.remove(request),
			(result) => ({
				namespace: request.filter?.namespaces?.[0],
				metadata: {
					removedCount: result?.removedCount ?? 0,
					hardDelete: request.hardDelete ?? false,
				},
			}),
		);
	}

	public async compact(request?: MemoryCompactionRequest): Promise<MemoryCompactionResult> {
		return this.runOperation(
			"compact",
			() => this.store.compact(request),
			(result) => ({
				namespace: request?.namespace,
				metadata: {
					removedCount: result?.removedCount ?? 0,
					scannedCount: result?.scannedCount ?? 0,
				},
			}),
		);
	}

	public async health(): Promise<MemoryStoreHealth> {
		return this.runOperation("health", () => this.store.health(), () => undefined);
	}

	public getMetricsSnapshot(): MemoryRuntimeMetrics {
		const generatedAt = this.now().toISOString();
		const averageLatencyMsByOperation = createOperationCounter();
		let totalOperations = 0;
		for (const operation of OPERATIONS) {
			const count = this.operationCount[operation];
			totalOperations += count;
			averageLatencyMsByOperation[operation] = count === 0 ? 0 : this.operationTotalLatencyMs[operation] / count;
		}
		return {
			backend: this.backend,
			generatedAt,
			totalOperations,
			errorCount: this.errorCount,
			perOperationCount: { ...this.operationCount },
			averageLatencyMsByOperation,
			queryCount: this.queryCount,
			queryZeroHitCount: this.queryZeroHitCount,
			queryHitCountTotal: this.queryHitCountTotal,
		};
	}

	public getEventSnapshot(options: ObservableEventSnapshotOptions = {}): readonly MemoryRuntimeEvent[] {
		const limit = options.limit ?? this.maxEvents;
		const filtered = this.events.filter((event) => {
			if (options.operation && event.operation !== options.operation) {
				return false;
			}
			if (options.success !== undefined && event.success !== options.success) {
				return false;
			}
			return true;
		});
		return filtered.slice(Math.max(0, filtered.length - limit));
	}

	public async getHealthSnapshot(): Promise<MemoryRuntimeHealth> {
		const generatedAt = this.now().toISOString();
		const storeHealth = await this.store.health();
		return {
			backend: this.backend,
			generatedAt,
			store: storeHealth,
			metrics: this.getMetricsSnapshot(),
			recentEventCount: this.events.length,
		};
	}

	private async runOperation<T>(
		operation: MemoryRuntimeOperation,
		fn: () => Promise<T>,
		meta: (result?: T) => { namespace?: string; metadata?: Record<string, unknown> } | undefined,
	): Promise<T> {
		const startedAtMs = this.now().getTime();
		try {
			const result = await fn();
			const durationMs = this.now().getTime() - startedAtMs;
			this.operationCount[operation] += 1;
			this.operationTotalLatencyMs[operation] += durationMs;
			await this.recordEvent({
				operation,
				success: true,
				durationMs,
				...meta(result),
			});
			return result;
		} catch (error) {
			const durationMs = this.now().getTime() - startedAtMs;
			this.operationCount[operation] += 1;
			this.operationTotalLatencyMs[operation] += durationMs;
			this.errorCount += 1;
			await this.recordEvent({
				operation,
				success: false,
				durationMs,
				error: error instanceof Error ? error.message : String(error),
				...meta(undefined),
			});
			throw error;
		}
	}

	private async recordEvent(
		event: Omit<MemoryRuntimeEvent, "id" | "at" | "backend">,
	): Promise<void> {
		const fullEvent: MemoryRuntimeEvent = {
			id: this.eventIdFactory(),
			at: this.now().toISOString(),
			backend: this.backend,
			...event,
		};
		this.events.push(fullEvent);
		if (this.events.length > this.maxEvents) {
			this.events.splice(0, this.events.length - this.maxEvents);
		}
		for (const sink of this.sinks) {
			await sink.push(fullEvent);
		}
		if (this.onEvent) {
			await this.onEvent(fullEvent);
		}
	}
}

export function createObservableMemoryStore(options: ObservableMemoryStoreOptions): ObservableMemoryStore {
	return new ObservableMemoryStore(options);
}

export class InMemoryMemoryEventSink implements MemoryEventSink {
	private readonly maxEvents: number;
	private readonly events: MemoryRuntimeEvent[] = [];

	public constructor(maxEvents = 500) {
		this.maxEvents = normalizeMaxEvents(maxEvents);
	}

	public push(event: MemoryRuntimeEvent): void {
		this.events.push(event);
		if (this.events.length > this.maxEvents) {
			this.events.splice(0, this.events.length - this.maxEvents);
		}
	}

	public list(): readonly MemoryRuntimeEvent[] {
		return [...this.events];
	}
}

function normalizeMaxEvents(maxEvents: number | undefined): number {
	if (!maxEvents || !Number.isFinite(maxEvents)) {
		return DEFAULT_MAX_EVENTS;
	}
	return Math.max(10, Math.floor(maxEvents));
}

function createOperationCounter(): Record<MemoryRuntimeOperation, number> {
	return {
		upsert: 0,
		upsert_many: 0,
		query: 0,
		remove: 0,
		compact: 0,
		health: 0,
	};
}
