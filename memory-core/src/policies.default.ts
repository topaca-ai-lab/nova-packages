import { MemoryPolicyViolationError } from "./errors.js";
import type { MemoryPolicy, MemoryPolicyContext } from "./interfaces/memory-policy.js";
import type {
	MemoryCompactionRequest,
	MemoryPolicyDecision,
	MemoryQuery,
	MemoryRemoveRequest,
	MemoryUpsertEntry,
} from "./types.js";

export interface DefaultMemoryPolicyOptions {
	allowedNamespaces?: readonly string[];
	blockedNamespaces?: readonly string[];
	redactText?: (text: string) => string;
	maxEntryTextLength?: number;
}

export class DefaultMemoryPolicy implements MemoryPolicy {
	private readonly allowedNamespaces?: ReadonlySet<string>;
	private readonly blockedNamespaces: ReadonlySet<string>;
	private readonly redactText?: (text: string) => string;
	private readonly maxEntryTextLength?: number;

	public constructor(options: DefaultMemoryPolicyOptions = {}) {
		this.allowedNamespaces = options.allowedNamespaces ? new Set(options.allowedNamespaces) : undefined;
		this.blockedNamespaces = new Set(options.blockedNamespaces ?? []);
		this.redactText = options.redactText;
		this.maxEntryTextLength = options.maxEntryTextLength;
	}

	public async beforeUpsert(entry: MemoryUpsertEntry, _context?: MemoryPolicyContext): Promise<MemoryUpsertEntry> {
		this.assertNamespaceAllowed(entry.namespace, "upsert");
		let text = entry.content.text;
		if (this.redactText) {
			text = this.redactText(text);
		}
		if (this.maxEntryTextLength && text.length > this.maxEntryTextLength) {
			text = `${text.slice(0, this.maxEntryTextLength)}`;
		}
		return {
			...entry,
			content: {
				...entry.content,
				text,
			},
		};
	}

	public async beforeQuery(query: MemoryQuery, _context?: MemoryPolicyContext): Promise<MemoryQuery> {
		for (const namespace of query.filter?.namespaces ?? []) {
			this.assertNamespaceAllowed(namespace, "query");
		}
		return query;
	}

	public async beforeRemove(request: MemoryRemoveRequest, _context?: MemoryPolicyContext): Promise<MemoryRemoveRequest> {
		for (const namespace of request.filter?.namespaces ?? []) {
			this.assertNamespaceAllowed(namespace, "query");
		}
		return request;
	}

	public async beforeCompact(
		request: MemoryCompactionRequest | undefined,
		_context?: MemoryPolicyContext,
	): Promise<MemoryCompactionRequest | undefined> {
		if (request?.namespace) {
			this.assertNamespaceAllowed(request.namespace, "compact");
		}
		return request;
	}

	public createRedactionDecision(namespace: string, operation: "upsert"): MemoryPolicyDecision {
		return {
			at: new Date().toISOString(),
			operation,
			action: "redact",
			reason: "text_redaction_applied",
			namespace,
		};
	}

	private assertNamespaceAllowed(namespace: string, operation: "upsert" | "query" | "compact"): void {
		if (this.blockedNamespaces.has(namespace)) {
			throw new MemoryPolicyViolationError(
				`Namespace "${namespace}" is blocked by memory policy.`,
				operation === "upsert"
					? "namespace_blocked"
					: operation === "query"
						? "query_namespace_blocked"
						: "compact_namespace_blocked",
				namespace,
			);
		}
		if (this.allowedNamespaces && !this.allowedNamespaces.has(namespace)) {
			throw new MemoryPolicyViolationError(
				`Namespace "${namespace}" is not part of the allowed namespace policy.`,
				operation === "upsert"
					? "namespace_not_allowed"
					: operation === "query"
						? "query_namespace_not_allowed"
						: "compact_namespace_not_allowed",
				namespace,
			);
		}
	}
}

export class AllowAllMemoryPolicy implements MemoryPolicy {
	public async beforeUpsert(entry: MemoryUpsertEntry): Promise<MemoryUpsertEntry> {
		return entry;
	}

	public async beforeQuery(query: MemoryQuery): Promise<MemoryQuery> {
		return query;
	}

	public async beforeRemove(request: MemoryRemoveRequest): Promise<MemoryRemoveRequest> {
		return request;
	}

	public async beforeCompact(
		request: MemoryCompactionRequest | undefined,
	): Promise<MemoryCompactionRequest | undefined> {
		return request;
	}
}
