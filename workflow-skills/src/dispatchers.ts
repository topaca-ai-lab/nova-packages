import { WorkflowExecutionError, WorkflowPolicyDeniedError } from "./errors.js";
import { evaluateToolActionPolicy, type WorkflowSafetyPolicy } from "./safety.js";
import type {
	DecisionWorkflowStep,
	MemoryWorkflowStep,
	TransformWorkflowStep,
	WorkflowExecutionContext,
	WorkflowStep,
	WorkflowStepExecutionResult,
	WorkflowStepHandler,
	WorkflowStepHandlerParams,
} from "./types.js";

export interface WorkflowToolCallError {
	readonly code: string;
	readonly message: string;
	readonly retryable: boolean;
	readonly details?: Record<string, unknown>;
}

export interface WorkflowToolCallResponse {
	readonly ok: boolean;
	readonly result?: unknown;
	readonly error?: WorkflowToolCallError;
}

export interface WorkflowToolCallRequest {
	readonly skillId: string;
	readonly action: string;
	readonly params: Record<string, unknown>;
	readonly traceId?: string;
	readonly signal?: AbortSignal;
}

export type WorkflowToolInvoker = (request: WorkflowToolCallRequest) => Promise<WorkflowToolCallResponse>;

export interface WorkflowMemoryDispatcher {
	read(request: { namespace: string; payload?: Record<string, unknown> }): Promise<unknown>;
	write(request: { namespace: string; payload?: Record<string, unknown> }): Promise<unknown>;
	query(request: { namespace: string; payload?: Record<string, unknown> }): Promise<unknown>;
}

export interface WorkflowDispatcherOptions {
	readonly toolInvoker?: WorkflowToolInvoker;
	readonly memoryDispatcher?: WorkflowMemoryDispatcher;
	readonly safetyPolicy?: WorkflowSafetyPolicy;
}

export function createDefaultStepHandler<TInput = unknown>(
	options: WorkflowDispatcherOptions,
): WorkflowStepHandler<TInput> {
	return async ({ step, context }: WorkflowStepHandlerParams<TInput>): Promise<WorkflowStepExecutionResult> => {
		switch (step.kind) {
			case "tool":
				return await runToolStep(step, context, options);
			case "decision":
				return runDecisionStep(step, context);
			case "memory":
				return await runMemoryStep(step, options);
			case "transform":
				return runTransformStep(step, context);
			case "finish":
				return {
					output: step.result ?? null,
				};
		}
	};
}

async function runToolStep<TInput>(
	step: Extract<WorkflowStep, { kind: "tool" }>,
	context: WorkflowExecutionContext<TInput>,
	options: WorkflowDispatcherOptions,
): Promise<WorkflowStepExecutionResult> {
	const actionKey = `${step.skillId}.${step.action}`;
	const actionPolicy = evaluateToolActionPolicy(options.safetyPolicy, step.id, actionKey);
	if (!actionPolicy.allowed) {
		throw new WorkflowPolicyDeniedError(
			actionPolicy.reason ?? `Tool action "${actionKey}" denied by workflow safety policy.`,
		);
	}

	if (options.toolInvoker === undefined) {
		throw new WorkflowExecutionError(
			"DEPENDENCY_NOT_AVAILABLE",
			`Tool step "${step.id}" requires toolInvoker dependency.`,
			false,
		);
	}

	const response = await options.toolInvoker({
		skillId: step.skillId,
		action: step.action,
		params: step.params ?? {},
		traceId: context.runId,
		signal: context.signal,
	});

	if (!response.ok) {
		throw new WorkflowExecutionError(
			"TOOL_CALL_FAILED",
			response.error?.message ?? `Tool call failed for ${step.skillId}.${step.action}.`,
			response.error?.retryable ?? true,
		);
	}

	return {
		output: response.result ?? null,
	};
}

function runDecisionStep<TInput>(
	step: DecisionWorkflowStep,
	context: WorkflowExecutionContext<TInput>,
): WorkflowStepExecutionResult {
	for (const branch of step.branches) {
		if (evaluateCondition(branch.condition, context)) {
			return {
				nextStepId: branch.targetStepId,
				output: {
					matchedBranchId: branch.id,
				},
			};
		}
	}

	if (step.defaultTargetStepId !== undefined) {
		return {
			nextStepId: step.defaultTargetStepId,
			output: {
				matchedBranchId: null,
			},
		};
	}

	return {
		output: {
			matchedBranchId: null,
		},
	};
}

async function runMemoryStep(
	step: MemoryWorkflowStep,
	options: WorkflowDispatcherOptions,
): Promise<WorkflowStepExecutionResult> {
	if (options.memoryDispatcher === undefined) {
		throw new WorkflowExecutionError(
			"DEPENDENCY_NOT_AVAILABLE",
			`Memory step "${step.id}" requires memoryDispatcher dependency.`,
			false,
		);
	}

	try {
		const request = {
			namespace: step.namespace,
			payload: step.payload,
		};

		switch (step.operation) {
			case "read": {
				const output = await options.memoryDispatcher.read(request);
				return { output };
			}
			case "write": {
				const output = await options.memoryDispatcher.write(request);
				return { output };
			}
			case "query": {
				const output = await options.memoryDispatcher.query(request);
				return { output };
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new WorkflowExecutionError(
			"MEMORY_OPERATION_FAILED",
			`Memory step "${step.id}" failed: ${message}`,
			true,
		);
	}
}

function runTransformStep<TInput>(
	step: TransformWorkflowStep,
	context: WorkflowExecutionContext<TInput>,
): WorkflowStepExecutionResult {
	const root = {
		input: context.input,
		vars: context.vars,
		steps: context.stepOutputs,
	};
	return {
		output: mapTemplate(step.output, root),
	};
}

function evaluateCondition<TInput>(
	condition: DecisionWorkflowStep["branches"][number]["condition"],
	context: WorkflowExecutionContext<TInput>,
): boolean {
	const root = {
		input: context.input,
		vars: context.vars,
		steps: context.stepOutputs,
	};
	const left = resolvePath(root, condition.path);
	const right = condition.value;

	if (condition.operator === "exists") {
		return left !== undefined && left !== null;
	}
	if (condition.operator === "not_exists") {
		return left === undefined || left === null;
	}
	if (condition.operator === "eq") {
		return left === right;
	}
	if (condition.operator === "neq") {
		return left !== right;
	}
	if (condition.operator === "gt") {
		return toNumber(left) > toNumber(right);
	}
	if (condition.operator === "gte") {
		return toNumber(left) >= toNumber(right);
	}
	if (condition.operator === "lt") {
		return toNumber(left) < toNumber(right);
	}
	if (condition.operator === "lte") {
		return toNumber(left) <= toNumber(right);
	}
	if (condition.operator === "contains") {
		if (typeof left === "string" && typeof right === "string") {
			return left.includes(right);
		}
		if (Array.isArray(left)) {
			return left.includes(right);
		}
		return false;
	}

	return false;
}

function toNumber(value: unknown): number {
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? Number.NaN : parsed;
	}
	return Number.NaN;
}

function mapTemplate(value: unknown, root: Record<string, unknown>): unknown {
	if (typeof value === "string") {
		if (value.startsWith("$.")) {
			const resolved = resolvePath(root, value.slice(2));
			return resolved ?? null;
		}
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => mapTemplate(entry, root));
	}
	if (isRecord(value)) {
		const mapped: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			mapped[key] = mapTemplate(entry, root);
		}
		return mapped;
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolvePath(root: Record<string, unknown>, path: string): unknown {
	const normalized = path.trim();
	if (normalized.length === 0) {
		return undefined;
	}

	const parts = normalized.split(".");
	let current: unknown = root;
	let index = 0;

	while (index < parts.length) {
		if (!isRecord(current)) {
			return undefined;
		}

		const part = parts[index];
		if (Object.hasOwn(current, part)) {
			current = current[part];
			index += 1;
			continue;
		}

		let matched = false;
		for (let end = parts.length; end > index + 1; end--) {
			const compositeKey = parts.slice(index, end).join(".");
			if (Object.hasOwn(current, compositeKey)) {
				current = current[compositeKey];
				index = end;
				matched = true;
				break;
			}
		}

		if (!matched) {
			return undefined;
		}
	}

	return current;
}
