import type { WorkflowDispatcherOptions } from "./dispatchers.js";
import { executeWorkflowRuntime, type ExecuteWorkflowRuntimeResult } from "./runtime.js";
import type { WorkflowDefinition, WorkflowExecutionOptions } from "./types.js";
import type { WorkflowStore } from "./store.js";
import type { WorkflowEventSink } from "./events.js";

export type OrchestrationTrigger =
	| {
			readonly kind: "cron";
			readonly expression: string;
	  }
	| {
			readonly kind: "heartbeat";
			readonly intervalMs: number;
	  };

export interface OrchestrationRetryPolicy {
	readonly maxRetries: number;
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
}

export interface OrchestrationJobDefinition {
	readonly id: string;
	readonly name: string;
	readonly trigger: OrchestrationTrigger;
	readonly retry: OrchestrationRetryPolicy;
}

export interface OrchestrationJobRunContext {
	readonly job: OrchestrationJobDefinition;
	readonly runId: string;
	readonly attempt: number;
	readonly signal: AbortSignal;
}

export type OrchestrationJobHandler = (context: OrchestrationJobRunContext) => Promise<void>;

export interface OrchestrationJobRegistrar {
	registerJob(definition: OrchestrationJobDefinition, handler: OrchestrationJobHandler): Promise<void> | void;
}

export interface WorkflowRunIntent<TInput = unknown> {
	readonly workflowId: string;
	readonly workflowVersion: string;
	readonly input: TInput;
	readonly source: "orchestration";
	readonly jobId: string;
	readonly jobRunId: string;
	readonly attempt: number;
}

export interface WorkflowScheduleBinding {
	readonly trigger: OrchestrationTrigger;
	readonly retry?: Partial<OrchestrationRetryPolicy>;
	readonly jobId?: string;
	readonly jobName?: string;
}

export interface ScheduledWorkflowRegistration<TInput = unknown> {
	readonly workflow: WorkflowDefinition;
	readonly binding: WorkflowScheduleBinding;
	readonly dispatchers: WorkflowDispatcherOptions;
	readonly inputResolver: (context: OrchestrationJobRunContext) => TInput;
	readonly store?: WorkflowStore;
	readonly eventSink?: WorkflowEventSink;
	readonly eventSinks?: readonly WorkflowEventSink[];
	readonly execution?: WorkflowExecutionOptions;
	readonly onRunCompleted?: (result: ExecuteWorkflowRuntimeResult, intent: WorkflowRunIntent<TInput>) => void | Promise<void>;
}

export function createWorkflowJobId(workflowId: string): string {
	return `workflow:${workflowId}`;
}

export function parseWorkflowJobId(jobId: string): { workflowId: string } | undefined {
	if (!jobId.startsWith("workflow:")) {
		return undefined;
	}
	const workflowId = jobId.slice("workflow:".length);
	if (workflowId.length === 0) {
		return undefined;
	}
	return { workflowId };
}

export function createWorkflowScheduleJobDefinition(
	workflow: WorkflowDefinition,
	binding: WorkflowScheduleBinding,
): OrchestrationJobDefinition {
	const retry: OrchestrationRetryPolicy = {
		maxRetries: binding.retry?.maxRetries ?? 2,
		baseDelayMs: binding.retry?.baseDelayMs ?? 250,
		maxDelayMs: binding.retry?.maxDelayMs ?? 2_000,
	};

	const id = binding.jobId ?? createWorkflowJobId(workflow.id);
	const name = binding.jobName ?? `Workflow ${workflow.name}`;

	return {
		id,
		name,
		trigger: binding.trigger,
		retry,
	};
}

export function createWorkflowRunIntent<TInput>(
	workflow: WorkflowDefinition,
	context: OrchestrationJobRunContext,
	input: TInput,
): WorkflowRunIntent<TInput> {
	return {
		workflowId: workflow.id,
		workflowVersion: workflow.version,
		input,
		source: "orchestration",
		jobId: context.job.id,
		jobRunId: context.runId,
		attempt: context.attempt,
	};
}

export function createScheduledWorkflowJobHandler<TInput>(
	registration: ScheduledWorkflowRegistration<TInput>,
): OrchestrationJobHandler {
	return async (context: OrchestrationJobRunContext): Promise<void> => {
		const input = registration.inputResolver(context);
		const intent = createWorkflowRunIntent(registration.workflow, context, input);

		const result = await executeWorkflowRuntime(registration.workflow, input, {
			dispatchers: registration.dispatchers,
			store: registration.store,
			eventSink: registration.eventSink,
			eventSinks: registration.eventSinks,
			execution: {
				...registration.execution,
				signal: context.signal,
				runIdFactory: () => context.runId,
			},
		});

		if (registration.onRunCompleted !== undefined) {
			await registration.onRunCompleted(result, intent);
		}
	};
}

export async function registerScheduledWorkflow<TInput>(
	registrar: OrchestrationJobRegistrar,
	registration: ScheduledWorkflowRegistration<TInput>,
): Promise<OrchestrationJobDefinition> {
	const jobDefinition = createWorkflowScheduleJobDefinition(registration.workflow, registration.binding);
	const handler = createScheduledWorkflowJobHandler(registration);
	await registrar.registerJob(jobDefinition, handler);
	return jobDefinition;
}
