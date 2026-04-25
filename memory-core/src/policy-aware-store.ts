import type { MemoryPolicy } from "./interfaces/memory-policy.js";
import type { MemoryStore } from "./interfaces/memory-store.js";
import type {
	MemoryCompactionRequest,
	MemoryCompactionResult,
	MemoryEntry,
	MemoryEntryId,
	MemoryPolicyDecision,
	MemoryQuery,
	MemoryQueryResult,
	MemoryRemoveRequest,
	MemoryRemoveResult,
	MemoryStoreHealth,
	MemoryUpsertEntry,
} from "./types.js";

export interface PolicyAwareMemoryStoreOptions {
	store: MemoryStore;
	policy: MemoryPolicy;
	retention?: {
		maxEntriesPerNamespace?: number;
		maxAgeMs?: number;
	};
	onDecision?: (decision: MemoryPolicyDecision) => void;
}

export class PolicyAwareMemoryStore implements MemoryStore {
	private readonly store: MemoryStore;
	private readonly policy: MemoryPolicy;
	private readonly retention?: {
		maxEntriesPerNamespace?: number;
		maxAgeMs?: number;
	};
	private readonly onDecision?: (decision: MemoryPolicyDecision) => void;

	public constructor(options: PolicyAwareMemoryStoreOptions) {
		this.store = options.store;
		this.policy = options.policy;
		this.retention = options.retention;
		this.onDecision = options.onDecision;
	}

	public get backend(): string {
		return this.store.backend;
	}

	public async upsert(entry: MemoryUpsertEntry): Promise<MemoryEntry> {
		const beforeText = entry.content.text;
		const transformed = await this.policy.beforeUpsert(entry);
		this.emitDecision({
			operation: "upsert",
			action: "allow",
			reason: "policy_before_upsert_passed",
			namespace: transformed.namespace,
		});
		if (transformed.content.text !== beforeText) {
			this.emitDecision({
				operation: "upsert",
				action: "redact",
				reason: "policy_redaction_applied",
				namespace: transformed.namespace,
			});
		}

		const result = await this.store.upsert(transformed);
		await this.applyRetention(result.namespace);
		return result;
	}

	public async upsertMany(entries: readonly MemoryUpsertEntry[]): Promise<readonly MemoryEntry[]> {
		const outputs: MemoryEntry[] = [];
		for (const entry of entries) {
			outputs.push(await this.upsert(entry));
		}
		return outputs;
	}

	public async getById(id: MemoryEntryId, namespace?: string): Promise<MemoryEntry | undefined> {
		return this.store.getById(id, namespace);
	}

	public async query(request: MemoryQuery): Promise<MemoryQueryResult> {
		const transformed = await this.policy.beforeQuery(request);
		this.emitDecision({
			operation: "query",
			action: "allow",
			reason: "policy_before_query_passed",
			namespace: transformed.filter?.namespaces?.[0],
		});
		return this.store.query(transformed);
	}

	public async remove(request: MemoryRemoveRequest): Promise<MemoryRemoveResult> {
		const transformed = await this.policy.beforeRemove(request);
		this.emitDecision({
			operation: "remove",
			action: "allow",
			reason: "policy_before_remove_passed",
			namespace: transformed.filter?.namespaces?.[0],
		});
		return this.store.remove(transformed);
	}

	public async compact(request?: MemoryCompactionRequest): Promise<MemoryCompactionResult> {
		const transformed = await this.policy.beforeCompact(request);
		this.emitDecision({
			operation: "compact",
			action: "compact",
			reason: "policy_before_compact_passed",
			namespace: transformed?.namespace,
		});
		return this.store.compact(transformed);
	}

	public async health(): Promise<MemoryStoreHealth> {
		return this.store.health();
	}

	private async applyRetention(namespace: string): Promise<void> {
		if (!this.retention || (!this.retention.maxAgeMs && this.retention.maxEntriesPerNamespace === undefined)) {
			return;
		}
		await this.store.compact({
			namespace,
			maxAgeMs: this.retention.maxAgeMs,
			maxEntries: this.retention.maxEntriesPerNamespace,
		});
		this.emitDecision({
			operation: "compact",
			action: "compact",
			reason: "retention_policy_compaction",
			namespace,
		});
	}

	private emitDecision(decision: Omit<MemoryPolicyDecision, "at">): void {
		this.onDecision?.({
			at: new Date().toISOString(),
			...decision,
		});
	}
}

export function createPolicyAwareMemoryStore(options: PolicyAwareMemoryStoreOptions): PolicyAwareMemoryStore {
	return new PolicyAwareMemoryStore(options);
}
