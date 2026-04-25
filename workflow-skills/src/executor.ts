import { createDefaultStepHandler, type WorkflowDispatcherOptions } from "./dispatchers.js";
import {
	WorkflowCanceledError,
	WorkflowDecisionNextStepRequiredError,
	WorkflowInvalidNextStepError,
	WorkflowMaxRuntimeExceededError,
	WorkflowMaxTotalStepsExceededError,
	WorkflowPayloadBudgetExceededError,
	WorkflowStepNotFoundError,
	WorkflowStepTimeoutError,
} from "./errors.js";
import { estimatePayloadBytes, type WorkflowSafetyPolicy } from "./safety.js";
import { transitionRunRecordStatus, transitionStepTraceStatus } from "./state-machine.js";
import type {
	DecisionWorkflowStep,
	WorkflowDefinition,
	WorkflowExecutionContext,
	WorkflowExecutionOptions,
	WorkflowExecutionResult,
	WorkflowRunRecord,
	WorkflowStep,
	WorkflowStepExecutionResult,
	WorkflowStepHandler,
	WorkflowStepTrace,
} from "./types.js";
import { validateWorkflowDefinition } from "./validator.js";

const DEFAULT_RETRY_BASE_DELAY_MS = 50;
const DEFAULT_RETRY_MAX_DELAY_MS = 2_000;
const DEFAULT_MAX_TOTAL_STEPS = 1_000;

const defaultRunIdFactory = (): string => {
	return `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const defaultSleep = async (ms: number): Promise<void> => {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
};

function toIso(now: () => Date): string {
	return now().toISOString();
}

function isAbortError(error: unknown): boolean {
	return error instanceof WorkflowCanceledError;
}

function getRetryDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
	const delay = baseDelayMs * 2 ** Math.max(0, attempt - 1);
	return Math.min(delay, maxDelayMs);
}

async function runStepWithTimeout<TInput>(
	step: WorkflowStep,
	stepHandler: WorkflowStepHandler<TInput>,
	params: { step: WorkflowStep; attempt: number; context: WorkflowExecutionContext<TInput> },
): Promise<WorkflowStepExecutionResult> {
	if (step.timeoutMs === undefined) {
		return await stepHandler(params);
	}

	let timeoutHandle: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			stepHandler(params),
			new Promise<WorkflowStepExecutionResult>((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new WorkflowStepTimeoutError(step.id, step.timeoutMs ?? 0));
				}, step.timeoutMs);
			}),
		]);
	} finally {
		if (timeoutHandle !== undefined) {
			clearTimeout(timeoutHandle);
		}
	}
}

function getStaticNextMap(definition: WorkflowDefinition): Map<string, readonly string[]> {
	const map = new Map<string, string[]>();
	for (const step of definition.steps) {
		map.set(step.id, []);
	}
	for (const edge of definition.edges) {
		const next = map.get(edge.fromStepId);
		if (next !== undefined) {
			next.push(edge.toStepId);
		}
	}
	return map;
}

function getDecisionAllowedTargets(step: DecisionWorkflowStep): Set<string> {
	const allowed = new Set<string>();
	for (const branch of step.branches) {
		allowed.add(branch.targetStepId);
	}
	if (step.defaultTargetStepId !== undefined) {
		allowed.add(step.defaultTargetStepId);
	}
	return allowed;
}

function resolveNextStep(
	step: WorkflowStep,
	stepResult: WorkflowStepExecutionResult,
	staticNextMap: Map<string, readonly string[]>,
): string | undefined {
	if (step.kind === "finish") {
		return undefined;
	}

	if (step.kind === "decision") {
		const allowedTargets = getDecisionAllowedTargets(step);
		if (stepResult.nextStepId !== undefined) {
			if (!allowedTargets.has(stepResult.nextStepId)) {
				throw new WorkflowInvalidNextStepError(step.id, stepResult.nextStepId);
			}
			return stepResult.nextStepId;
		}

		if (step.defaultTargetStepId !== undefined) {
			return step.defaultTargetStepId;
		}

		throw new WorkflowDecisionNextStepRequiredError(step.id);
	}

	const staticTargets = staticNextMap.get(step.id) ?? [];
	if (stepResult.nextStepId !== undefined) {
		if (!staticTargets.includes(stepResult.nextStepId)) {
			throw new WorkflowInvalidNextStepError(step.id, stepResult.nextStepId);
		}
		return stepResult.nextStepId;
	}

	return staticTargets[0];
}

export async function executeWorkflow<TInput = unknown>(
	definition: WorkflowDefinition,
	stepHandler: WorkflowStepHandler<TInput>,
	input: TInput,
	options: WorkflowExecutionOptions = {},
): Promise<WorkflowExecutionResult> {
	validateWorkflowDefinition(definition);

	const now = options.now ?? (() => new Date());
	const sleep = options.sleep ?? defaultSleep;
	const runId = options.runIdFactory ? options.runIdFactory() : defaultRunIdFactory();
	const retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
	const retryMaxDelayMs = options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
	const maxTotalSteps = options.maxTotalSteps ?? DEFAULT_MAX_TOTAL_STEPS;
	const safetyPolicy = options.safetyPolicy;

	const runSignal = options.signal ?? new AbortController().signal;
	const startedAtMs = now().getTime();

	enforcePayloadBudget("maxInitialInputBytes", input, safetyPolicy);

	const stepById = new Map<string, WorkflowStep>();
	for (const step of definition.steps) {
		stepById.set(step.id, step);
	}
	const staticNextMap = getStaticNextMap(definition);

	let record: WorkflowRunRecord = {
		runId,
		workflowId: definition.id,
		workflowVersion: definition.version,
		status: "queued",
		queuedAt: toIso(now),
		currentStepId: definition.entryStepId,
	};

	const traces: WorkflowStepTrace[] = [];
	const context: WorkflowExecutionContext<TInput> = {
		workflow: definition,
		runId,
		input,
		signal: runSignal,
		vars: {},
		stepOutputs: {},
	};

	if (runSignal.aborted) {
		record = transitionRunRecordStatus(record, "canceled", {
			at: toIso(now),
			currentStepId: definition.entryStepId,
			lastError: new WorkflowCanceledError("Canceled before workflow start.").message,
		});
		return { record, steps: traces };
	}

	record = transitionRunRecordStatus(record, "running", {
		at: toIso(now),
		currentStepId: definition.entryStepId,
	});

	let currentStepId = definition.entryStepId;
	let finalOutput: unknown;
	let executedSteps = 0;

	while (true) {
		if (runSignal.aborted) {
			record = transitionRunRecordStatus(record, "canceled", {
				at: toIso(now),
				currentStepId,
				lastError: new WorkflowCanceledError("Canceled during workflow execution.").message,
			});
			return { record, steps: traces, finalOutput };
		}

		enforceRuntimeBudget(startedAtMs, now, safetyPolicy);

		executedSteps += 1;
		if (executedSteps > maxTotalSteps) {
			const error = new WorkflowMaxTotalStepsExceededError(maxTotalSteps);
			record = transitionRunRecordStatus(record, "failed", {
				at: toIso(now),
				currentStepId,
				lastError: error.message,
			});
			return { record, steps: traces, finalOutput };
		}

		const step = stepById.get(currentStepId);
		if (step === undefined) {
			const error = new WorkflowStepNotFoundError(currentStepId);
			record = transitionRunRecordStatus(record, "failed", {
				at: toIso(now),
				currentStepId,
				lastError: error.message,
			});
			return { record, steps: traces, finalOutput };
		}

		enforcePayloadBudget("maxStepInputBytes", getStepInputPayload(step), safetyPolicy);

		let attempt = 0;
		const maxRetries = step.maxRetries ?? 0;

		while (true) {
			let trace: WorkflowStepTrace = {
				stepId: step.id,
				status: "queued",
				attempt,
				queuedAt: toIso(now),
			};
			trace = transitionStepTraceStatus(trace, "running", { at: toIso(now) });

			try {
				const stepResult = await runStepWithTimeout(step, stepHandler, { step, attempt, context });

				if (runSignal.aborted) {
					const canceled = new WorkflowCanceledError("Canceled during step execution.");
					trace = transitionStepTraceStatus(trace, "canceled", {
						at: toIso(now),
						errorMessage: canceled.message,
					});
					traces.push(trace);
					record = transitionRunRecordStatus(record, "canceled", {
						at: toIso(now),
						currentStepId: step.id,
						lastError: canceled.message,
					});
					return { record, steps: traces, finalOutput };
				}

				enforcePayloadBudget("maxStepOutputBytes", stepResult.output, safetyPolicy);

				if (step.kind === "finish") {
					trace = transitionStepTraceStatus(trace, "succeeded", { at: toIso(now) });
					traces.push(trace);
					context.stepOutputs[step.id] = stepResult.output ?? null;
					enforcePayloadBudget("maxStoredStepOutputsBytes", context.stepOutputs, safetyPolicy);
					finalOutput = stepResult.output ?? step.result;
					enforcePayloadBudget("maxFinalOutputBytes", finalOutput, safetyPolicy);
					record = transitionRunRecordStatus(record, "succeeded", {
						at: toIso(now),
						currentStepId: step.id,
					});
					return { record, steps: traces, finalOutput };
				}

				const nextStepId = resolveNextStep(step, stepResult, staticNextMap);
				trace = transitionStepTraceStatus(trace, "succeeded", { at: toIso(now) });
				traces.push(trace);
				context.stepOutputs[step.id] = stepResult.output ?? null;
				enforcePayloadBudget("maxStoredStepOutputsBytes", context.stepOutputs, safetyPolicy);
				if (nextStepId === undefined) {
					record = transitionRunRecordStatus(record, "succeeded", {
						at: toIso(now),
						currentStepId: step.id,
					});
					return { record, steps: traces, finalOutput };
				}

				currentStepId = nextStepId;
				record = {
					...record,
					currentStepId,
				};
				break;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				if (runSignal.aborted || isAbortError(error)) {
					trace = transitionStepTraceStatus(trace, "canceled", {
						at: toIso(now),
						errorMessage: message,
					});
					traces.push(trace);
					record = transitionRunRecordStatus(record, "canceled", {
						at: toIso(now),
						currentStepId: step.id,
						lastError: message,
					});
					return { record, steps: traces, finalOutput };
				}

				trace = transitionStepTraceStatus(trace, "failed", {
					at: toIso(now),
					errorMessage: message,
				});
				traces.push(trace);

				if (attempt >= maxRetries) {
					record = transitionRunRecordStatus(record, "failed", {
						at: toIso(now),
						currentStepId: step.id,
						lastError: message,
					});
					return { record, steps: traces, finalOutput };
				}

				attempt += 1;
				const retryDelayMs = getRetryDelayMs(attempt, retryBaseDelayMs, retryMaxDelayMs);
				await sleep(retryDelayMs);
			}
		}
	}
}

export async function executeWorkflowWithDispatchers<TInput = unknown>(
	definition: WorkflowDefinition,
	input: TInput,
	dispatcherOptions: WorkflowDispatcherOptions,
	options: WorkflowExecutionOptions = {},
): Promise<WorkflowExecutionResult> {
	const stepHandler = createDefaultStepHandler<TInput>(dispatcherOptions);
	return await executeWorkflow(definition, stepHandler, input, options);
}

function enforceRuntimeBudget(
	startedAtMs: number,
	now: () => Date,
	safetyPolicy: WorkflowSafetyPolicy | undefined,
): void {
	const maxRuntimeMs = safetyPolicy?.maxRuntimeMs;
	if (maxRuntimeMs === undefined) {
		return;
	}
	if (!Number.isInteger(maxRuntimeMs) || maxRuntimeMs <= 0) {
		return;
	}
	const elapsed = now().getTime() - startedAtMs;
	if (elapsed > maxRuntimeMs) {
		throw new WorkflowMaxRuntimeExceededError(maxRuntimeMs);
	}
}

function enforcePayloadBudget(
	budgetName: keyof NonNullable<WorkflowSafetyPolicy["budgets"]>,
	payload: unknown,
	safetyPolicy: WorkflowSafetyPolicy | undefined,
): void {
	const limit = safetyPolicy?.budgets?.[budgetName];
	if (limit === undefined) {
		return;
	}
	if (!Number.isInteger(limit) || limit < 0) {
		return;
	}
	const actual = estimatePayloadBytes(payload);
	if (actual > limit) {
		throw new WorkflowPayloadBudgetExceededError(String(budgetName), actual, limit);
	}
}

function getStepInputPayload(step: WorkflowStep): unknown {
	if (step.kind === "tool") {
		return step.params ?? {};
	}
	if (step.kind === "memory") {
		return step.payload ?? {};
	}
	if (step.kind === "transform") {
		return step.output;
	}
	if (step.kind === "decision") {
		return {
			branches: step.branches,
			defaultTargetStepId: step.defaultTargetStepId,
		};
	}
	return step.result ?? {};
}
