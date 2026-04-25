import { createDefaultStepHandler, type WorkflowDispatcherOptions } from "./dispatchers.js";
import type { WorkflowEventSink } from "./events.js";
import { executeWorkflow } from "./executor.js";
import type { WorkflowDefinition, WorkflowExecutionOptions, WorkflowExecutionResult } from "./types.js";
import type { WorkflowRunSnapshot, WorkflowStore } from "./store.js";

export interface ExecuteWorkflowRuntimeOptions {
	readonly dispatchers: WorkflowDispatcherOptions;
	readonly store?: WorkflowStore;
	readonly eventSink?: WorkflowEventSink;
	readonly eventSinks?: readonly WorkflowEventSink[];
	readonly execution?: WorkflowExecutionOptions;
	readonly persistDefinition?: boolean;
	readonly now?: () => Date;
}

export interface ExecuteWorkflowRuntimeResult {
	readonly result: WorkflowExecutionResult;
	readonly snapshot?: WorkflowRunSnapshot;
}

export async function executeWorkflowRuntime<TInput = unknown>(
	definition: WorkflowDefinition,
	input: TInput,
	options: ExecuteWorkflowRuntimeOptions,
): Promise<ExecuteWorkflowRuntimeResult> {
	const now = options.now ?? (() => new Date());
	const eventSinks = normalizeEventSinks(options.eventSink, options.eventSinks);

	if (options.store !== undefined && (options.persistDefinition ?? true)) {
		await options.store.upsertWorkflowDefinition(definition);
	}

	const runId = options.execution?.runIdFactory ? options.execution.runIdFactory() : undefined;
	const executionOptions: WorkflowExecutionOptions = {
		...options.execution,
		runIdFactory: runId ? () => runId : options.execution?.runIdFactory,
	};

	const startedAt = now().toISOString();
	const stepHandler = createDefaultStepHandler<TInput>(options.dispatchers);
	const result = await executeWorkflow(definition, stepHandler, input, executionOptions);

	await publishAll(eventSinks, {
		type: "run_started",
		runId: result.record.runId,
		workflowId: definition.id,
		at: startedAt,
	});

	for (const [index, step] of result.steps.entries()) {
		await publishAll(eventSinks, {
			type: "step_recorded",
			runId: result.record.runId,
			workflowId: definition.id,
			index,
			step,
			at: step.finishedAt ?? step.startedAt ?? step.queuedAt,
		});
	}

	await publishAll(eventSinks, {
		type: "run_finished",
		runId: result.record.runId,
		workflowId: definition.id,
		status: result.record.status,
		at: result.record.finishedAt ?? now().toISOString(),
	});

	if (options.store === undefined) {
		return { result };
	}

	const snapshot: WorkflowRunSnapshot = {
		runId: result.record.runId,
		workflowId: definition.id,
		workflowVersion: definition.version,
		result,
		persistedAt: now().toISOString(),
	};
	await options.store.upsertRunSnapshot(snapshot);

	return {
		result,
		snapshot,
	};
}

function normalizeEventSinks(
	eventSink: WorkflowEventSink | undefined,
	eventSinks: readonly WorkflowEventSink[] | undefined,
): WorkflowEventSink[] {
	if (eventSink !== undefined && eventSinks !== undefined) {
		return [eventSink, ...eventSinks];
	}
	if (eventSink !== undefined) {
		return [eventSink];
	}
	if (eventSinks !== undefined) {
		return [...eventSinks];
	}
	return [];
}

async function publishAll(eventSinks: readonly WorkflowEventSink[], event: Parameters<WorkflowEventSink["publish"]>[0]): Promise<void> {
	for (const sink of eventSinks) {
		await sink.publish(event);
	}
}
