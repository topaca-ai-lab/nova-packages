export type JobId = string;

export type Trigger =
	| {
			kind: "cron";
			expression: string;
	  }
	| {
			kind: "heartbeat";
			intervalMs: number;
	  };

export interface RetryPolicy {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
}

export interface JobDefinition {
	id: JobId;
	name: string;
	trigger: Trigger;
	retry: RetryPolicy;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface RunRecord {
	jobId: JobId;
	runId: string;
	status: RunStatus;
	attempt: number;
	queuedAt: string;
	startedAt?: string;
	finishedAt?: string;
	lastError?: string;
}

export interface OrchestrationEvent {
	type:
		| "job_registered"
		| "run_queued"
		| "run_started"
		| "run_succeeded"
		| "run_failed"
		| "run_canceled";
	jobId: JobId;
	runId?: string;
	at: string;
	message?: string;
}
