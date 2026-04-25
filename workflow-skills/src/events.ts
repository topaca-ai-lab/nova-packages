import type { WorkflowExecutionResult } from "./types.js";

export type WorkflowEventType = "run_started" | "step_recorded" | "run_finished";

export interface WorkflowRunStartedEvent {
	readonly type: "run_started";
	readonly runId: string;
	readonly workflowId: string;
	readonly at: string;
}

export interface WorkflowStepRecordedEvent {
	readonly type: "step_recorded";
	readonly runId: string;
	readonly workflowId: string;
	readonly at: string;
	readonly index: number;
	readonly step: WorkflowExecutionResult["steps"][number];
}

export interface WorkflowRunFinishedEvent {
	readonly type: "run_finished";
	readonly runId: string;
	readonly workflowId: string;
	readonly at: string;
	readonly status: WorkflowExecutionResult["record"]["status"];
}

export type WorkflowEvent = WorkflowRunStartedEvent | WorkflowStepRecordedEvent | WorkflowRunFinishedEvent;

export interface WorkflowEventSink {
	publish(event: WorkflowEvent): void | Promise<void>;
}

export type WorkflowEventSubscriber = (event: WorkflowEvent) => void;

export interface InMemoryWorkflowEventSinkOptions {
	maxEvents?: number;
}

export interface InMemoryWorkflowEventSinkHealth {
	readonly ok: boolean;
	readonly backend: "in_memory";
	readonly maxEvents: number;
	readonly queuedEvents: number;
	readonly subscriberCount: number;
	readonly message: string;
}

export interface InMemoryWorkflowEventSnapshotOptions {
	readonly runId?: string;
	readonly workflowId?: string;
	readonly types?: readonly WorkflowEventType[];
	readonly limit?: number;
}

export class InMemoryWorkflowEventSink implements WorkflowEventSink {
	private readonly maxEvents: number;
	private readonly events: WorkflowEvent[] = [];
	private readonly subscribers = new Set<WorkflowEventSubscriber>();

	public constructor(options: InMemoryWorkflowEventSinkOptions = {}) {
		this.maxEvents = validateMaxEvents(options.maxEvents);
	}

	public publish(event: WorkflowEvent): void {
		this.events.push(event);
		if (this.events.length > this.maxEvents) {
			this.events.splice(0, this.events.length - this.maxEvents);
		}
		for (const subscriber of this.subscribers) {
			subscriber(event);
		}
	}

	public subscribe(subscriber: WorkflowEventSubscriber): () => void {
		this.subscribers.add(subscriber);
		return () => {
			this.subscribers.delete(subscriber);
		};
	}

	public snapshot(options: InMemoryWorkflowEventSnapshotOptions = {}): readonly WorkflowEvent[] {
		const types = options.types ? new Set(options.types) : undefined;
		const filtered = this.events.filter((event) => {
			if (options.runId !== undefined && event.runId !== options.runId) {
				return false;
			}
			if (options.workflowId !== undefined && event.workflowId !== options.workflowId) {
				return false;
			}
			if (types !== undefined && !types.has(event.type)) {
				return false;
			}
			return true;
		});

		if (options.limit !== undefined) {
			if (!Number.isInteger(options.limit) || options.limit < 0) {
				throw new Error("snapshot limit must be a non-negative integer.");
			}
			return filtered.slice(Math.max(0, filtered.length - options.limit));
		}

		return [...filtered];
	}

	public clear(): void {
		this.events.length = 0;
	}

	public health(): InMemoryWorkflowEventSinkHealth {
		return {
			ok: true,
			backend: "in_memory",
			maxEvents: this.maxEvents,
			queuedEvents: this.events.length,
			subscriberCount: this.subscribers.size,
			message: "In-memory workflow event sink is available.",
		};
	}
}

function validateMaxEvents(maxEvents: number | undefined): number {
	if (maxEvents === undefined) {
		return 500;
	}
	if (!Number.isInteger(maxEvents) || maxEvents < 1) {
		throw new Error("maxEvents must be a positive integer.");
	}
	return maxEvents;
}
