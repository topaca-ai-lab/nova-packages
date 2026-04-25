import type { WorkflowRunRecord, WorkflowRunStatus, WorkflowStepStatus, WorkflowStepTrace } from "./types.js";

const TERMINAL_RUN_STATUSES: readonly WorkflowRunStatus[] = ["succeeded", "failed", "canceled"];

const ALLOWED_RUN_TRANSITIONS: Record<WorkflowRunStatus, readonly WorkflowRunStatus[]> = {
	queued: ["running", "canceled"],
	running: ["succeeded", "failed", "canceled"],
	succeeded: [],
	failed: [],
	canceled: [],
};

const ALLOWED_STEP_TRANSITIONS: Record<WorkflowStepStatus, readonly WorkflowStepStatus[]> = {
	queued: ["running", "canceled"],
	running: ["succeeded", "failed", "canceled"],
	succeeded: [],
	failed: ["queued"],
	canceled: [],
};

export class InvalidWorkflowRunTransitionError extends Error {
	public readonly name = "InvalidWorkflowRunTransitionError";
	public readonly from: WorkflowRunStatus;
	public readonly to: WorkflowRunStatus;

	public constructor(from: WorkflowRunStatus, to: WorkflowRunStatus) {
		super(`Invalid workflow run status transition: ${from} -> ${to}`);
		this.from = from;
		this.to = to;
	}
}

export class InvalidWorkflowStepTransitionError extends Error {
	public readonly name = "InvalidWorkflowStepTransitionError";
	public readonly from: WorkflowStepStatus;
	public readonly to: WorkflowStepStatus;

	public constructor(from: WorkflowStepStatus, to: WorkflowStepStatus) {
		super(`Invalid workflow step status transition: ${from} -> ${to}`);
		this.from = from;
		this.to = to;
	}
}

export function isTerminalRunStatus(status: WorkflowRunStatus): boolean {
	return TERMINAL_RUN_STATUSES.includes(status);
}

export function canTransitionRunStatus(from: WorkflowRunStatus, to: WorkflowRunStatus): boolean {
	return ALLOWED_RUN_TRANSITIONS[from].includes(to);
}

export function canTransitionStepStatus(from: WorkflowStepStatus, to: WorkflowStepStatus): boolean {
	return ALLOWED_STEP_TRANSITIONS[from].includes(to);
}

export function transitionRunRecordStatus(
	current: WorkflowRunRecord,
	next: WorkflowRunStatus,
	options: { at?: string; currentStepId?: string; lastError?: string } = {},
): WorkflowRunRecord {
	if (!canTransitionRunStatus(current.status, next)) {
		throw new InvalidWorkflowRunTransitionError(current.status, next);
	}

	const at = options.at ?? new Date().toISOString();
	const baseRecord: WorkflowRunRecord = {
		...current,
		status: next,
		currentStepId: options.currentStepId ?? current.currentStepId,
	};

	if (next === "running") {
		return {
			...baseRecord,
			startedAt: current.startedAt ?? at,
			lastError: undefined,
		};
	}

	if (next === "succeeded") {
		return {
			...baseRecord,
			finishedAt: at,
			lastError: undefined,
		};
	}

	if (next === "failed") {
		return {
			...baseRecord,
			finishedAt: at,
			lastError: options.lastError ?? current.lastError,
		};
	}

	if (next === "canceled") {
		return {
			...baseRecord,
			finishedAt: at,
			lastError: options.lastError ?? current.lastError,
		};
	}

	return baseRecord;
}

export function transitionStepTraceStatus(
	current: WorkflowStepTrace,
	next: WorkflowStepStatus,
	options: { at?: string; errorMessage?: string } = {},
): WorkflowStepTrace {
	if (!canTransitionStepStatus(current.status, next)) {
		throw new InvalidWorkflowStepTransitionError(current.status, next);
	}

	const at = options.at ?? new Date().toISOString();
	const baseTrace: WorkflowStepTrace = {
		...current,
		status: next,
	};

	if (next === "running") {
		return {
			...baseTrace,
			startedAt: current.startedAt ?? at,
			errorMessage: undefined,
		};
	}

	if (next === "succeeded" || next === "failed" || next === "canceled") {
		const errorMessage = options.errorMessage ?? baseTrace.errorMessage;
		const durationMs =
			baseTrace.startedAt !== undefined ? Math.max(0, Date.parse(at) - Date.parse(baseTrace.startedAt)) : undefined;
		return {
			...baseTrace,
			finishedAt: at,
			errorMessage,
			durationMs,
		};
	}

	if (current.status === "failed" && next === "queued") {
		return {
			...baseTrace,
			startedAt: undefined,
			finishedAt: undefined,
			durationMs: undefined,
			errorMessage: undefined,
		};
	}

	return baseTrace;
}
