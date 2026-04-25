import { transitionRunRecordStatus } from "./state-machine.js";
import type { JobDefinition, OrchestrationEvent, RunRecord } from "./types.js";

export interface JobRunContext {
	job: JobDefinition;
	runId: string;
	attempt: number;
	signal: AbortSignal;
}

export type JobHandler = (context: JobRunContext) => Promise<void>;

export interface RunJobOptions {
	now?: () => Date;
	sleep?: (ms: number) => Promise<void>;
	timeoutMs?: number;
	signal?: AbortSignal;
	runIdFactory?: () => string;
}

export interface RunJobResult {
	record: RunRecord;
	events: OrchestrationEvent[];
}

export class JobRunTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Job run timed out after ${timeoutMs}ms.`);
		this.name = "JobRunTimeoutError";
	}
}

export class JobRunCanceledError extends Error {
	constructor(message = "Job run canceled.") {
		super(message);
		this.name = "JobRunCanceledError";
	}
}

const defaultRunIdFactory = (): string => {
	return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const defaultSleep = async (ms: number): Promise<void> => {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
};

function toIso(now: () => Date): string {
	return now().toISOString();
}

function emit(events: OrchestrationEvent[], event: OrchestrationEvent): void {
	events.push(event);
}

function isCancellationError(error: unknown): boolean {
	return error instanceof JobRunCanceledError;
}

function getRetryDelayMs(job: JobDefinition, attempt: number): number {
	const base = job.retry.baseDelayMs;
	const max = job.retry.maxDelayMs;
	const delay = base * 2 ** attempt;
	return Math.min(delay, max);
}

async function runWithTimeout(
	handler: JobHandler,
	context: JobRunContext,
	timeoutMs: number | undefined,
): Promise<void> {
	if (!timeoutMs || timeoutMs <= 0) {
		await handler(context);
		return;
	}

	let timeoutHandle: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			handler(context),
			new Promise<never>((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new JobRunTimeoutError(timeoutMs));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

export async function runJob(job: JobDefinition, handler: JobHandler, options: RunJobOptions = {}): Promise<RunJobResult> {
	const now = options.now ?? (() => new Date());
	const sleep = options.sleep ?? defaultSleep;
	const runId = options.runIdFactory ? options.runIdFactory() : defaultRunIdFactory();
	const events: OrchestrationEvent[] = [];

	let record: RunRecord = {
		jobId: job.id,
		runId,
		status: "queued",
		attempt: 0,
		queuedAt: toIso(now),
	};

	emit(events, {
		type: "run_queued",
		jobId: job.id,
		runId,
		at: record.queuedAt,
	});

	while (true) {
		if (options.signal?.aborted) {
			record = transitionRunRecordStatus(record, "canceled", {
				at: toIso(now),
				lastError: new JobRunCanceledError().message,
			});
			emit(events, {
				type: "run_canceled",
				jobId: job.id,
				runId,
				at: record.finishedAt ?? toIso(now),
				message: "Canceled before execution.",
			});
			return { record, events };
		}

		record = transitionRunRecordStatus(record, "running", { at: toIso(now) });
		emit(events, {
			type: "run_started",
			jobId: job.id,
			runId,
			at: record.startedAt ?? toIso(now),
		});

		const attemptController = new AbortController();
		const cleanupAbort: (() => void)[] = [];

		if (options.signal) {
			const abortForwarder = (): void => {
				attemptController.abort(options.signal?.reason);
			};
			options.signal.addEventListener("abort", abortForwarder, { once: true });
			cleanupAbort.push(() => options.signal?.removeEventListener("abort", abortForwarder));
		}

		try {
			await runWithTimeout(
				handler,
				{
					job,
					runId,
					attempt: record.attempt,
					signal: attemptController.signal,
				},
				options.timeoutMs,
			);

			if (options.signal?.aborted || attemptController.signal.aborted) {
				record = transitionRunRecordStatus(record, "canceled", {
					at: toIso(now),
					lastError: new JobRunCanceledError().message,
				});
				emit(events, {
					type: "run_canceled",
					jobId: job.id,
					runId,
					at: record.finishedAt ?? toIso(now),
					message: "Canceled during execution.",
				});
				return { record, events };
			}

			record = transitionRunRecordStatus(record, "succeeded", { at: toIso(now) });
			emit(events, {
				type: "run_succeeded",
				jobId: job.id,
				runId,
				at: record.finishedAt ?? toIso(now),
			});
			return { record, events };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			if (options.signal?.aborted || attemptController.signal.aborted || isCancellationError(error)) {
				record = transitionRunRecordStatus(record, "canceled", {
					at: toIso(now),
					lastError: message || new JobRunCanceledError().message,
				});
				emit(events, {
					type: "run_canceled",
					jobId: job.id,
					runId,
					at: record.finishedAt ?? toIso(now),
					message: "Canceled during execution.",
				});
				return { record, events };
			}

			record = transitionRunRecordStatus(record, "failed", { at: toIso(now), lastError: message });
			emit(events, {
				type: "run_failed",
				jobId: job.id,
				runId,
				at: record.finishedAt ?? toIso(now),
				message,
			});

			if (record.attempt >= job.retry.maxRetries) {
				return { record, events };
			}

			const delayMs = getRetryDelayMs(job, record.attempt);
			record = transitionRunRecordStatus(record, "queued", { at: toIso(now) });
			emit(events, {
				type: "run_queued",
				jobId: job.id,
				runId,
				at: toIso(now),
				message: `Retry in ${delayMs}ms.`,
			});
			await sleep(delayMs);
		} finally {
			for (const cleanup of cleanupAbort) {
				cleanup();
			}
		}
	}
}
