export type MemoryPolicyViolationCode =
	| "namespace_not_allowed"
	| "namespace_blocked"
	| "query_namespace_not_allowed"
	| "query_namespace_blocked"
	| "compact_namespace_not_allowed"
	| "compact_namespace_blocked";

export class MemoryPolicyViolationError extends Error {
	public readonly name = "MemoryPolicyViolationError";
	public readonly code: MemoryPolicyViolationCode;
	public readonly namespace?: string;

	public constructor(message: string, code: MemoryPolicyViolationCode, namespace?: string) {
		super(message);
		this.code = code;
		this.namespace = namespace;
	}
}
