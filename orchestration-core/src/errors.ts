export class JobNotFoundError extends Error {
	readonly jobId: string;

	constructor(jobId: string) {
		super(`Job not found: ${jobId}`);
		this.name = "JobNotFoundError";
		this.jobId = jobId;
	}
}

export class JobHandlerNotRegisteredError extends Error {
	readonly jobId: string;

	constructor(jobId: string) {
		super(`No handler registered for job: ${jobId}`);
		this.name = "JobHandlerNotRegisteredError";
		this.jobId = jobId;
	}
}

export class JobAlreadyRunningError extends Error {
	readonly jobId: string;

	constructor(jobId: string) {
		super(`Job is already running: ${jobId}`);
		this.name = "JobAlreadyRunningError";
		this.jobId = jobId;
	}
}

export class GlobalConcurrencyLimitExceededError extends Error {
	readonly limit: number;

	constructor(limit: number) {
		super(`Global concurrency limit exceeded: max ${limit} concurrent runs.`);
		this.name = "GlobalConcurrencyLimitExceededError";
		this.limit = limit;
	}
}
