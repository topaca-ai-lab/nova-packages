import type { WorkflowSafetyPolicy } from "./safety.js";

export type WorkflowStepKind = "tool" | "decision" | "memory" | "transform" | "finish";

export type WorkflowConditionOperator =
	| "eq"
	| "neq"
	| "gt"
	| "gte"
	| "lt"
	| "lte"
	| "exists"
	| "not_exists"
	| "contains";

export interface WorkflowCondition {
	readonly path: string;
	readonly operator: WorkflowConditionOperator;
	readonly value?: string | number | boolean | null;
}

export interface WorkflowStepBase {
	readonly id: string;
	readonly kind: WorkflowStepKind;
	readonly name?: string;
	readonly timeoutMs?: number;
	readonly maxRetries?: number;
}

export interface ToolWorkflowStep extends WorkflowStepBase {
	readonly kind: "tool";
	readonly skillId: string;
	readonly action: string;
	readonly params?: Record<string, unknown>;
}

export interface DecisionWorkflowBranch {
	readonly id: string;
	readonly targetStepId: string;
	readonly condition: WorkflowCondition;
}

export interface DecisionWorkflowStep extends WorkflowStepBase {
	readonly kind: "decision";
	readonly branches: readonly DecisionWorkflowBranch[];
	readonly defaultTargetStepId?: string;
}

export type MemoryWorkflowOperation = "read" | "write" | "query";

export interface MemoryWorkflowStep extends WorkflowStepBase {
	readonly kind: "memory";
	readonly operation: MemoryWorkflowOperation;
	readonly namespace: string;
	readonly payload?: Record<string, unknown>;
}

export interface TransformWorkflowStep extends WorkflowStepBase {
	readonly kind: "transform";
	readonly output: Record<string, unknown>;
}

export interface FinishWorkflowStep extends WorkflowStepBase {
	readonly kind: "finish";
	readonly result?: Record<string, unknown>;
}

export type WorkflowStep =
	| ToolWorkflowStep
	| DecisionWorkflowStep
	| MemoryWorkflowStep
	| TransformWorkflowStep
	| FinishWorkflowStep;

export interface WorkflowEdge {
	readonly fromStepId: string;
	readonly toStepId: string;
}

export interface WorkflowDefinition {
	readonly schemaVersion: number;
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly entryStepId: string;
	readonly steps: readonly WorkflowStep[];
	readonly edges: readonly WorkflowEdge[];
}

export type WorkflowRunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type WorkflowStepStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface WorkflowRunRecord {
	readonly runId: string;
	readonly workflowId: string;
	readonly workflowVersion: string;
	readonly status: WorkflowRunStatus;
	readonly queuedAt: string;
	readonly startedAt?: string;
	readonly finishedAt?: string;
	readonly currentStepId?: string;
	readonly lastError?: string;
}

export interface WorkflowStepTrace {
	readonly stepId: string;
	readonly status: WorkflowStepStatus;
	readonly attempt: number;
	readonly queuedAt: string;
	readonly startedAt?: string;
	readonly finishedAt?: string;
	readonly durationMs?: number;
	readonly errorMessage?: string;
}

export interface WorkflowExecutionContext<TInput = unknown> {
	readonly workflow: WorkflowDefinition;
	readonly runId: string;
	readonly input: TInput;
	readonly signal: AbortSignal;
	readonly vars: Record<string, unknown>;
	readonly stepOutputs: Record<string, unknown>;
}

export interface WorkflowStepHandlerParams<TInput = unknown> {
	readonly step: WorkflowStep;
	readonly attempt: number;
	readonly context: WorkflowExecutionContext<TInput>;
}

export interface WorkflowStepExecutionResult {
	readonly output?: unknown;
	readonly nextStepId?: string;
}

export type WorkflowStepHandler<TInput = unknown> = (
	params: WorkflowStepHandlerParams<TInput>,
) => Promise<WorkflowStepExecutionResult>;

export interface WorkflowExecutionOptions {
	readonly now?: () => Date;
	readonly sleep?: (ms: number) => Promise<void>;
	readonly signal?: AbortSignal;
	readonly runIdFactory?: () => string;
	readonly retryBaseDelayMs?: number;
	readonly retryMaxDelayMs?: number;
	readonly maxTotalSteps?: number;
	readonly safetyPolicy?: WorkflowSafetyPolicy;
}

export interface WorkflowExecutionResult {
	readonly record: WorkflowRunRecord;
	readonly steps: readonly WorkflowStepTrace[];
	readonly finalOutput?: unknown;
}
