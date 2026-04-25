export type WorkflowValidationIssueCode =
	| "invalid_schema_version"
	| "missing_steps"
	| "duplicate_step_id"
	| "unknown_entry_step"
	| "missing_finish_step"
	| "invalid_edge_reference"
	| "duplicate_edge"
	| "finish_step_has_outgoing_transition"
	| "decision_has_graph_edge"
	| "decision_missing_branches"
	| "duplicate_branch_id"
	| "invalid_branch_target"
	| "invalid_default_branch_target"
	| "invalid_condition_path"
	| "invalid_condition_operator"
	| "invalid_timeout"
	| "invalid_max_retries"
	| "step_missing_outgoing_transition"
	| "step_has_multiple_outgoing_transitions"
	| "workflow_cycle_detected"
	| "no_reachable_finish_step"
	| "unreachable_step";

export interface WorkflowValidationIssue {
	readonly code: WorkflowValidationIssueCode;
	readonly message: string;
	readonly fieldPath?: string;
}

export class WorkflowValidationError extends Error {
	public readonly name = "WorkflowValidationError";
	public readonly issues: readonly WorkflowValidationIssue[];

	public constructor(issues: readonly WorkflowValidationIssue[]) {
		super(`Workflow validation failed with ${issues.length} issue(s).`);
		this.issues = issues;
	}
}

export type WorkflowExecutionErrorCode =
	| "CANCELED"
	| "STEP_TIMEOUT"
	| "STEP_NOT_FOUND"
	| "INVALID_NEXT_STEP"
	| "DECISION_NEXT_STEP_REQUIRED"
	| "DEPENDENCY_NOT_AVAILABLE"
	| "TOOL_CALL_FAILED"
	| "MEMORY_OPERATION_FAILED"
	| "POLICY_DENIED"
	| "MAX_RUNTIME_EXCEEDED"
	| "PAYLOAD_BUDGET_EXCEEDED"
	| "MAX_TOTAL_STEPS_EXCEEDED";

export class WorkflowExecutionError extends Error {
	public readonly code: WorkflowExecutionErrorCode;
	public readonly retryable: boolean;

	public constructor(code: WorkflowExecutionErrorCode, message: string, retryable: boolean) {
		super(message);
		this.code = code;
		this.retryable = retryable;
	}
}

export class WorkflowCanceledError extends WorkflowExecutionError {
	public constructor(message = "Workflow execution canceled.") {
		super("CANCELED", message, true);
		this.name = "WorkflowCanceledError";
	}
}

export class WorkflowStepTimeoutError extends WorkflowExecutionError {
	public readonly stepId: string;
	public readonly timeoutMs: number;

	public constructor(stepId: string, timeoutMs: number) {
		super("STEP_TIMEOUT", `Step "${stepId}" timed out after ${timeoutMs}ms.`, true);
		this.name = "WorkflowStepTimeoutError";
		this.stepId = stepId;
		this.timeoutMs = timeoutMs;
	}
}

export class WorkflowStepNotFoundError extends WorkflowExecutionError {
	public readonly stepId: string;

	public constructor(stepId: string) {
		super("STEP_NOT_FOUND", `Step "${stepId}" not found in workflow definition.`, false);
		this.name = "WorkflowStepNotFoundError";
		this.stepId = stepId;
	}
}

export class WorkflowInvalidNextStepError extends WorkflowExecutionError {
	public readonly stepId: string;
	public readonly nextStepId: string;

	public constructor(stepId: string, nextStepId: string) {
		super(
			"INVALID_NEXT_STEP",
			`Step "${stepId}" returned invalid nextStepId "${nextStepId}" for current workflow topology.`,
			false,
		);
		this.name = "WorkflowInvalidNextStepError";
		this.stepId = stepId;
		this.nextStepId = nextStepId;
	}
}

export class WorkflowDecisionNextStepRequiredError extends WorkflowExecutionError {
	public readonly stepId: string;

	public constructor(stepId: string) {
		super(
			"DECISION_NEXT_STEP_REQUIRED",
			`Decision step "${stepId}" requires nextStepId from step handler or a defaultTargetStepId.`,
			false,
		);
		this.name = "WorkflowDecisionNextStepRequiredError";
		this.stepId = stepId;
	}
}

export class WorkflowMaxTotalStepsExceededError extends WorkflowExecutionError {
	public readonly maxTotalSteps: number;

	public constructor(maxTotalSteps: number) {
		super(
			"MAX_TOTAL_STEPS_EXCEEDED",
			`Workflow exceeded maxTotalSteps=${maxTotalSteps}. This indicates a misconfigured workflow path.`,
			false,
		);
		this.name = "WorkflowMaxTotalStepsExceededError";
		this.maxTotalSteps = maxTotalSteps;
	}
}

export class WorkflowPolicyDeniedError extends WorkflowExecutionError {
	public constructor(message: string) {
		super("POLICY_DENIED", message, false);
		this.name = "WorkflowPolicyDeniedError";
	}
}

export class WorkflowMaxRuntimeExceededError extends WorkflowExecutionError {
	public readonly maxRuntimeMs: number;

	public constructor(maxRuntimeMs: number) {
		super("MAX_RUNTIME_EXCEEDED", `Workflow exceeded maxRuntimeMs=${maxRuntimeMs}.`, false);
		this.name = "WorkflowMaxRuntimeExceededError";
		this.maxRuntimeMs = maxRuntimeMs;
	}
}

export class WorkflowPayloadBudgetExceededError extends WorkflowExecutionError {
	public readonly budgetName: string;
	public readonly actualBytes: number;
	public readonly limitBytes: number;

	public constructor(budgetName: string, actualBytes: number, limitBytes: number) {
		super(
			"PAYLOAD_BUDGET_EXCEEDED",
			`Payload budget exceeded for ${budgetName}: actual=${actualBytes} limit=${limitBytes}.`,
			false,
		);
		this.name = "WorkflowPayloadBudgetExceededError";
		this.budgetName = budgetName;
		this.actualBytes = actualBytes;
		this.limitBytes = limitBytes;
	}
}
