import {
	GlobalConcurrencyLimitExceededError,
	JobAlreadyRunningError,
	JobHandlerNotRegisteredError,
	JobNotFoundError,
} from "./errors.js";
import type {
	EventSinkDeadLetterEntry,
	OrchestrationDeadLetterSink,
	OrchestrationEventSink,
	ReplayableDeadLetterSink,
} from "./events.js";
import { getNextRunAt, validateTrigger } from "./scheduler.js";
import { JobRunCanceledError, runJob, type JobHandler, type RunJobOptions, type RunJobResult } from "./runner.js";
import { createInMemoryOrchestrationStore, type OrchestrationStore, type RunRetentionPolicy } from "./store.js";
import type { StoreStats } from "./store.js";
import type { JobDefinition, OrchestrationEvent, RunRecord } from "./types.js";

export interface OrchestratorOptions {
	store?: OrchestrationStore;
	now?: () => Date;
	sleep?: (ms: number) => Promise<void>;
	timeoutMs?: number;
	runIdFactory?: () => string;
	runRetention?: Omit<RunRetentionPolicy, "now">;
	maxConcurrentRuns?: number;
	eventSink?: OrchestrationEventSink;
	eventSinks?: OrchestrationEventSink[];
	eventSinkPolicy?: EventSinkPolicyOptions;
}

export interface RunNowOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
}

export interface StopOptions {
	cancelRunning?: boolean;
}

export interface OrchestratorMetrics {
	jobsRegistered: number;
	runQueued: number;
	runStarted: number;
	runSucceeded: number;
	runFailed: number;
	runCanceled: number;
	scheduledRunPreflightFailures: number;
	retentionCompactions: number;
	retentionRunsPruned: number;
	eventSinkPublished: number;
	eventSinkPublishFailures: number;
	eventSinkRetries: number;
	eventSinkDeadLettered: number;
	eventSinkDeadLetterFailures: number;
	deadLetterReplayAttempted: number;
	deadLetterReplaySucceeded: number;
	deadLetterReplayFailed: number;
	deadLetterReplayAcked: number;
}

export interface EventSinkPolicyOptions {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	deadLetterSink?: OrchestrationDeadLetterSink;
}

interface NormalizedEventSinkPolicy {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	deadLetterSink?: OrchestrationDeadLetterSink;
}

export interface DeadLetterReplayOptions {
	limit?: number;
	maxReplayPerRun?: number;
	jobId?: string;
	sinkIndex?: number;
}

export interface DeadLetterReplaySummary {
	scanned: number;
	attempted: number;
	succeeded: number;
	failed: number;
	acked: number;
	remaining: number;
}

export interface OrchestratorHealth {
	generatedAt: string;
	started: boolean;
	registeredJobs: number;
	scheduledJobs: number;
	runningJobs: number;
	metrics: OrchestratorMetrics;
	store: StoreStats;
}

export type OrchestrationEventListener = (event: OrchestrationEvent) => void;

export class Orchestrator {
	private readonly store: OrchestrationStore;
	private readonly handlers = new Map<string, JobHandler>();
	private readonly listeners = new Set<OrchestrationEventListener>();
	private readonly running = new Map<string, AbortController>();
	private readonly now: () => Date;
	private readonly sleep: (ms: number) => Promise<void>;
	private readonly timeoutMs?: number;
	private readonly runIdFactory?: () => string;
	private readonly runRetention?: Omit<RunRetentionPolicy, "now">;
	private readonly maxConcurrentRuns: number;
	private readonly eventSinks: OrchestrationEventSink[];
	private readonly eventSinkPolicy: NormalizedEventSinkPolicy;
	private readonly timers = new Map<string, NodeJS.Timeout>();
	private readonly metrics: OrchestratorMetrics = createEmptyMetrics();
	private started = false;

	constructor(options: OrchestratorOptions = {}) {
		this.store = options.store ?? createInMemoryOrchestrationStore();
		this.now = options.now ?? (() => new Date());
		this.sleep = options.sleep ?? defaultSleep;
		this.timeoutMs = options.timeoutMs;
		this.runIdFactory = options.runIdFactory;
		this.runRetention = options.runRetention;
		this.maxConcurrentRuns = validateMaxConcurrentRuns(options.maxConcurrentRuns);
		this.eventSinks = normalizeEventSinks(options);
		this.eventSinkPolicy = normalizeEventSinkPolicy(options.eventSinkPolicy);
	}

	onEvent(listener: OrchestrationEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async registerJob(job: JobDefinition, handler: JobHandler): Promise<void> {
		validateTrigger(job.trigger);
		await this.store.upsertJob(job);
		this.handlers.set(job.id, handler);
		this.emit({
			type: "job_registered",
			jobId: job.id,
			at: this.now().toISOString(),
			message: `Registered job: ${job.name}`,
		});
		this.metrics.jobsRegistered += 1;

		if (this.started) {
			this.scheduleJob(job, this.now());
		}
	}

	async start(): Promise<void> {
		if (this.started) {
			return;
		}
		this.started = true;
		const jobs = await this.store.listJobs();
		for (const job of jobs) {
			this.scheduleJob(job, this.now());
		}
	}

	stop(options: StopOptions = {}): void {
		this.started = false;
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		if (options.cancelRunning) {
			for (const [jobId, controller] of this.running.entries()) {
				controller.abort(new JobRunCanceledError(`Orchestrator stopped. Canceled job: ${jobId}`));
			}
		}
	}

	async runNow(jobId: string, options: RunNowOptions = {}): Promise<RunRecord> {
		const job = await this.store.getJob(jobId);
		if (!job) {
			throw new JobNotFoundError(jobId);
		}

		const handler = this.handlers.get(jobId);
		if (!handler) {
			throw new JobHandlerNotRegisteredError(jobId);
		}

		if (this.running.has(jobId)) {
			throw new JobAlreadyRunningError(jobId);
		}
		if (this.running.size >= this.maxConcurrentRuns) {
			throw new GlobalConcurrencyLimitExceededError(this.maxConcurrentRuns);
		}

		const controller = new AbortController();
		const removeOuterSignalForwarder = this.forwardSignal(options.signal, controller);
		this.running.set(jobId, controller);

		try {
			const runResult = await runJob(job, handler, this.buildRunJobOptions(controller.signal, options));
			for (const event of runResult.events) {
				this.emit(event);
			}
			await this.persistRunResult(runResult);
			return runResult.record;
		} finally {
			removeOuterSignalForwarder();
			this.running.delete(jobId);
		}
	}

	cancel(jobId: string): boolean {
		const controller = this.running.get(jobId);
		if (!controller) {
			return false;
		}
		controller.abort(new JobRunCanceledError());
		return true;
	}

	async getJob(jobId: string): Promise<JobDefinition | undefined> {
		return this.store.getJob(jobId);
	}

	async listJobs(): Promise<JobDefinition[]> {
		return this.store.listJobs();
	}

	async listRuns(jobId: string): Promise<RunRecord[]> {
		return this.store.listRuns(jobId);
	}

	getMetrics(): OrchestratorMetrics {
		return { ...this.metrics };
	}

	resetMetrics(): void {
		assignEmptyMetrics(this.metrics);
	}

	async getHealth(): Promise<OrchestratorHealth> {
		const now = this.now();
		const store = await this.store.getStats({ now });
		return {
			generatedAt: now.toISOString(),
			started: this.started,
			registeredJobs: this.handlers.size,
			scheduledJobs: this.timers.size,
			runningJobs: this.running.size,
			metrics: this.getMetrics(),
			store,
		};
	}

	async replayDeadLetters(options: DeadLetterReplayOptions = {}): Promise<DeadLetterReplaySummary> {
		const deadLetterSink = this.asReplayableDeadLetterSink(this.eventSinkPolicy.deadLetterSink);
		if (!deadLetterSink) {
			throw new Error("Configured deadLetterSink does not support replay.");
		}

		if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
			throw new Error("replayDeadLetters limit must be a non-negative integer.");
		}
		if (
			options.maxReplayPerRun !== undefined &&
			(!Number.isInteger(options.maxReplayPerRun) || options.maxReplayPerRun < 0)
		) {
			throw new Error("replayDeadLetters maxReplayPerRun must be a non-negative integer.");
		}
		if (options.sinkIndex !== undefined && (!Number.isInteger(options.sinkIndex) || options.sinkIndex < 0)) {
			throw new Error("replayDeadLetters sinkIndex must be a non-negative integer.");
		}

		const entries = deadLetterSink
			.snapshot()
			.filter((entry) => (options.jobId ? entry.event.jobId === options.jobId : true))
			.filter((entry) => (options.sinkIndex !== undefined ? entry.sinkIndex === options.sinkIndex : true));
		const limitedEntries = applyReplayLimit(entries, options);
		let attempted = 0;
		let succeeded = 0;
		let failed = 0;
		const ackIds: string[] = [];

		for (const entry of limitedEntries) {
			attempted += 1;
			const sink = this.eventSinks[entry.sinkIndex];
			if (!sink) {
				failed += 1;
				continue;
			}
			const ok = await this.publishToEventSink(sink, entry.sinkIndex, entry.event, false);
			if (ok) {
				succeeded += 1;
				ackIds.push(entry.deadLetterId);
			} else {
				failed += 1;
			}
		}

		const acked = deadLetterSink.ack(ackIds);
		const remaining = deadLetterSink.size();

		this.metrics.deadLetterReplayAttempted += attempted;
		this.metrics.deadLetterReplaySucceeded += succeeded;
		this.metrics.deadLetterReplayFailed += failed;
		this.metrics.deadLetterReplayAcked += acked;

		return {
			scanned: limitedEntries.length,
			attempted,
			succeeded,
			failed,
			acked,
			remaining,
		};
	}

	private emit(event: OrchestrationEvent): void {
		switch (event.type) {
			case "run_queued":
				this.metrics.runQueued += 1;
				break;
			case "run_started":
				this.metrics.runStarted += 1;
				break;
			case "run_succeeded":
				this.metrics.runSucceeded += 1;
				break;
			case "run_failed":
				this.metrics.runFailed += 1;
				break;
			case "run_canceled":
				this.metrics.runCanceled += 1;
				break;
			default:
				break;
		}
		for (const listener of this.listeners) {
			listener(event);
		}
		for (const [sinkIndex, eventSink] of this.eventSinks.entries()) {
			void this.publishToEventSink(eventSink, sinkIndex, event, true);
		}
	}

	private buildRunJobOptions(signal: AbortSignal, options: RunNowOptions): RunJobOptions {
		return {
			now: this.now,
			sleep: this.sleep,
			timeoutMs: options.timeoutMs ?? this.timeoutMs,
			signal,
			runIdFactory: this.runIdFactory,
		};
	}

	private forwardSignal(signal: AbortSignal | undefined, controller: AbortController): () => void {
		if (!signal) {
			return noop;
		}

		if (signal.aborted) {
			controller.abort(signal.reason);
			return noop;
		}

		const forward = (): void => {
			controller.abort(signal.reason);
		};

		signal.addEventListener("abort", forward, { once: true });
		return () => {
			signal.removeEventListener("abort", forward);
		};
	}

	private async persistRunResult(runResult: RunJobResult): Promise<void> {
		await this.store.upsertRun(runResult.record);
		if (this.runRetention && hasRetentionRule(this.runRetention)) {
			this.metrics.retentionCompactions += 1;
			const deleted = await this.store.pruneRuns(runResult.record.jobId, {
				...this.runRetention,
				now: this.now(),
			});
			this.metrics.retentionRunsPruned += deleted;
		}
	}

	private scheduleJob(job: JobDefinition, from: Date): void {
		const nextRunAt = getNextRunAt(job.trigger, from);
		const delayMs = Math.max(0, nextRunAt.getTime() - this.now().getTime());
		this.clearTimer(job.id);

		const timer = setTimeout(() => {
			void this.handleScheduledRun(job.id);
		}, delayMs);
		this.timers.set(job.id, timer);
	}

	private async handleScheduledRun(jobId: string): Promise<void> {
		this.clearTimer(jobId);
		if (!this.started) {
			return;
		}

		try {
			await this.runNow(jobId);
		} catch (error) {
			if (error instanceof JobAlreadyRunningError || error instanceof GlobalConcurrencyLimitExceededError) {
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			this.emit({
				type: "run_failed",
				jobId,
				at: this.now().toISOString(),
				message: `Scheduled run failed before execution: ${message}`,
			});
			this.metrics.scheduledRunPreflightFailures += 1;
		} finally {
			if (!this.started) {
				return;
			}
			const latest = await this.store.getJob(jobId);
			if (!latest) {
				return;
			}
			this.scheduleJob(latest, this.now());
		}
	}

	private clearTimer(jobId: string): void {
		const timer = this.timers.get(jobId);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(jobId);
		}
	}

	private async publishToEventSink(
		eventSink: OrchestrationEventSink,
		sinkIndex: number,
		event: OrchestrationEvent,
		publishDeadLetterOnFailure: boolean,
	): Promise<boolean> {
		let attempts = 0;
		let delayMs = this.eventSinkPolicy.baseDelayMs;

		while (attempts < this.eventSinkPolicy.maxAttempts) {
			attempts += 1;
			try {
				await eventSink.publish(event);
				this.metrics.eventSinkPublished += 1;
				return true;
			} catch (error) {
				this.metrics.eventSinkPublishFailures += 1;
				if (attempts >= this.eventSinkPolicy.maxAttempts) {
					if (publishDeadLetterOnFailure) {
						await this.publishDeadLetter(sinkIndex, attempts, event, error);
					}
					return false;
				}
				this.metrics.eventSinkRetries += 1;
				if (delayMs > 0) {
					await this.sleep(delayMs);
				}
				delayMs = Math.min(delayMs * 2 || 1, this.eventSinkPolicy.maxDelayMs);
			}
		}
		return false;
	}

	private async publishDeadLetter(
		sinkIndex: number,
		attempts: number,
		event: OrchestrationEvent,
		error: unknown,
	): Promise<void> {
		if (!this.eventSinkPolicy.deadLetterSink) {
			return;
		}
		try {
			await this.eventSinkPolicy.deadLetterSink.publish({
				deadLetterId: buildDeadLetterId(),
				event,
				sinkIndex,
				attempts,
				failedAt: this.now().toISOString(),
				errorMessage: error instanceof Error ? error.message : String(error),
			});
			this.metrics.eventSinkDeadLettered += 1;
		} catch {
			this.metrics.eventSinkDeadLetterFailures += 1;
		}
	}

	private asReplayableDeadLetterSink(
		deadLetterSink: OrchestrationDeadLetterSink | undefined,
	): ReplayableDeadLetterSink | undefined {
		if (!deadLetterSink) {
			return undefined;
		}
		if (
			typeof (deadLetterSink as ReplayableDeadLetterSink).snapshot === "function" &&
			typeof (deadLetterSink as ReplayableDeadLetterSink).ack === "function" &&
			typeof (deadLetterSink as ReplayableDeadLetterSink).size === "function"
		) {
			return deadLetterSink as ReplayableDeadLetterSink;
		}
		return undefined;
	}
}

function noop(): void {}

async function defaultSleep(ms: number): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

function hasRetentionRule(policy: Omit<RunRetentionPolicy, "now">): boolean {
	return (
		(typeof policy.maxRunsPerJob === "number" && policy.maxRunsPerJob >= 0) ||
		(typeof policy.maxAgeMs === "number" && policy.maxAgeMs > 0)
	);
}

function createEmptyMetrics(): OrchestratorMetrics {
	return {
		jobsRegistered: 0,
		runQueued: 0,
		runStarted: 0,
		runSucceeded: 0,
		runFailed: 0,
		runCanceled: 0,
		scheduledRunPreflightFailures: 0,
		retentionCompactions: 0,
		retentionRunsPruned: 0,
		eventSinkPublished: 0,
		eventSinkPublishFailures: 0,
		eventSinkRetries: 0,
		eventSinkDeadLettered: 0,
		eventSinkDeadLetterFailures: 0,
		deadLetterReplayAttempted: 0,
		deadLetterReplaySucceeded: 0,
		deadLetterReplayFailed: 0,
		deadLetterReplayAcked: 0,
	};
}

function assignEmptyMetrics(target: OrchestratorMetrics): void {
	const empty = createEmptyMetrics();
	target.jobsRegistered = empty.jobsRegistered;
	target.runQueued = empty.runQueued;
	target.runStarted = empty.runStarted;
	target.runSucceeded = empty.runSucceeded;
	target.runFailed = empty.runFailed;
	target.runCanceled = empty.runCanceled;
	target.scheduledRunPreflightFailures = empty.scheduledRunPreflightFailures;
	target.retentionCompactions = empty.retentionCompactions;
	target.retentionRunsPruned = empty.retentionRunsPruned;
	target.eventSinkPublished = empty.eventSinkPublished;
	target.eventSinkPublishFailures = empty.eventSinkPublishFailures;
	target.eventSinkRetries = empty.eventSinkRetries;
	target.eventSinkDeadLettered = empty.eventSinkDeadLettered;
	target.eventSinkDeadLetterFailures = empty.eventSinkDeadLetterFailures;
	target.deadLetterReplayAttempted = empty.deadLetterReplayAttempted;
	target.deadLetterReplaySucceeded = empty.deadLetterReplaySucceeded;
	target.deadLetterReplayFailed = empty.deadLetterReplayFailed;
	target.deadLetterReplayAcked = empty.deadLetterReplayAcked;
}

function validateMaxConcurrentRuns(value: number | undefined): number {
	if (value === undefined) {
		return Number.POSITIVE_INFINITY;
	}
	if (!Number.isInteger(value) || value < 1) {
		throw new Error("maxConcurrentRuns must be a positive integer.");
	}
	return value;
}

function normalizeEventSinks(options: OrchestratorOptions): OrchestrationEventSink[] {
	const sinks: OrchestrationEventSink[] = [];
	if (options.eventSink) {
		sinks.push(options.eventSink);
	}
	if (options.eventSinks) {
		sinks.push(...options.eventSinks);
	}
	return sinks;
}

function normalizeEventSinkPolicy(policy: EventSinkPolicyOptions | undefined): NormalizedEventSinkPolicy {
	const maxAttempts = policy?.maxAttempts ?? 1;
	const baseDelayMs = policy?.baseDelayMs ?? 25;
	const maxDelayMs = policy?.maxDelayMs ?? 500;
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
		throw new Error("eventSinkPolicy.maxAttempts must be a positive integer.");
	}
	if (!Number.isInteger(baseDelayMs) || baseDelayMs < 0) {
		throw new Error("eventSinkPolicy.baseDelayMs must be a non-negative integer.");
	}
	if (!Number.isInteger(maxDelayMs) || maxDelayMs < 0) {
		throw new Error("eventSinkPolicy.maxDelayMs must be a non-negative integer.");
	}
	if (maxDelayMs < baseDelayMs) {
		throw new Error("eventSinkPolicy.maxDelayMs must be >= baseDelayMs.");
	}
	return {
		maxAttempts,
		baseDelayMs,
		maxDelayMs,
		deadLetterSink: policy?.deadLetterSink,
	};
}

function buildDeadLetterId(): string {
	return `dlq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveReplaySnapshotLimit(options: DeadLetterReplayOptions): number | undefined {
	const limit = options.limit;
	const maxReplayPerRun = options.maxReplayPerRun;
	if (limit === undefined) {
		return maxReplayPerRun;
	}
	if (maxReplayPerRun === undefined) {
		return limit;
	}
	return Math.min(limit, maxReplayPerRun);
}

function applyReplayLimit(
	entries: EventSinkDeadLetterEntry[],
	options: DeadLetterReplayOptions,
): EventSinkDeadLetterEntry[] {
	const replayLimit = resolveReplaySnapshotLimit(options);
	if (replayLimit === undefined) {
		return entries;
	}
	if (replayLimit === 0) {
		return [];
	}
	return entries.slice(Math.max(0, entries.length - replayLimit));
}
