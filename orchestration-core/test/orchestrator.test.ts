import { describe, expect, it, vi } from "vitest";
import {
	GlobalConcurrencyLimitExceededError,
	InMemoryOrchestrationDeadLetterSink,
	InMemoryOrchestrationEventSink,
	JobAlreadyRunningError,
	JobHandlerNotRegisteredError,
	JobNotFoundError,
	JobRunCanceledError,
	Orchestrator,
	createInMemoryOrchestrationStore,
} from "../src/index.js";
import type { JobDefinition, OrchestrationEvent } from "../src/types.js";

function createJob(id = "job-1"): JobDefinition {
	return {
		id,
		name: `job-${id}`,
		trigger: { kind: "heartbeat", intervalMs: 1000 },
		retry: {
			maxRetries: 1,
			baseDelayMs: 10,
			maxDelayMs: 100,
		},
	};
}

describe("Orchestrator", () => {
	it("registers and runs a job while emitting lifecycle events", async () => {
		const orchestrator = new Orchestrator({
			store: createInMemoryOrchestrationStore(),
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		const events: OrchestrationEvent[] = [];
		orchestrator.onEvent((event) => {
			events.push(event);
		});

		await orchestrator.registerJob(createJob("job-1"), async () => {});
		const record = await orchestrator.runNow("job-1");
		const storedRuns = await orchestrator.listRuns("job-1");

		expect(record.status).toBe("succeeded");
		expect(storedRuns).toHaveLength(1);
		expect(storedRuns[0]?.status).toBe("succeeded");
		expect(events.map((event) => event.type)).toEqual([
			"job_registered",
			"run_queued",
			"run_started",
			"run_succeeded",
		]);
	});

	it("throws JobNotFoundError when running unknown job", async () => {
		const orchestrator = new Orchestrator();
		await expect(orchestrator.runNow("missing")).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("throws JobHandlerNotRegisteredError when job exists without handler", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertJob(createJob("job-raw"));
		const orchestrator = new Orchestrator({ store });
		await expect(orchestrator.runNow("job-raw")).rejects.toBeInstanceOf(JobHandlerNotRegisteredError);
	});

	it("throws JobAlreadyRunningError for concurrent runNow on same job", async () => {
		const orchestrator = new Orchestrator();
		let release: (() => void) | undefined;
		await orchestrator.registerJob(createJob("job-1"), async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		});

		const firstRunPromise = orchestrator.runNow("job-1");
		await Promise.resolve();
		await expect(orchestrator.runNow("job-1")).rejects.toBeInstanceOf(JobAlreadyRunningError);
		release?.();
		await firstRunPromise;
	});

	it("enforces global maxConcurrentRuns limit", async () => {
		const orchestrator = new Orchestrator({ maxConcurrentRuns: 1 });
		let releaseJobA: (() => void) | undefined;
		await orchestrator.registerJob(createJob("job-a"), async () => {
			await new Promise<void>((resolve) => {
				releaseJobA = resolve;
			});
		});
		await orchestrator.registerJob(createJob("job-b"), async () => {});

		const firstRunPromise = orchestrator.runNow("job-a");
		await Promise.resolve();
		await expect(orchestrator.runNow("job-b")).rejects.toBeInstanceOf(GlobalConcurrencyLimitExceededError);
		releaseJobA?.();
		await firstRunPromise;
	});

	it("cancels a running job and stores canceled status", async () => {
		const orchestrator = new Orchestrator();
		await orchestrator.registerJob(createJob("job-cancel"), async ({ signal }) => {
			await new Promise<void>((resolve, reject) => {
				const onAbort = (): void => {
					reject(new JobRunCanceledError("Canceled by test."));
				};
				signal.addEventListener("abort", onAbort, { once: true });
			});
		});

		const runPromise = orchestrator.runNow("job-cancel");
		await Promise.resolve();
		expect(orchestrator.cancel("job-cancel")).toBe(true);
		const result = await runPromise;

		expect(result.status).toBe("canceled");
		const runs = await orchestrator.listRuns("job-cancel");
		expect(runs).toHaveLength(1);
		expect(runs[0]?.status).toBe("canceled");
	});

	it("start schedules heartbeat jobs", async () => {
		vi.useFakeTimers();
		try {
			const orchestrator = new Orchestrator();
			let calls = 0;
			await orchestrator.registerJob(
				{
					id: "job-heartbeat",
					name: "heartbeat",
					trigger: { kind: "heartbeat", intervalMs: 1000 },
					retry: {
						maxRetries: 0,
						baseDelayMs: 10,
						maxDelayMs: 10,
					},
				},
				async () => {
					calls += 1;
				},
			);

			await orchestrator.start();
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);
			orchestrator.stop();

			expect(calls).toBeGreaterThanOrEqual(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("stop prevents future scheduled runs", async () => {
		vi.useFakeTimers();
		try {
			const orchestrator = new Orchestrator();
			let calls = 0;
			await orchestrator.registerJob(
				{
					id: "job-stop",
					name: "stop",
					trigger: { kind: "heartbeat", intervalMs: 1000 },
					retry: {
						maxRetries: 0,
						baseDelayMs: 10,
						maxDelayMs: 10,
					},
				},
				async () => {
					calls += 1;
				},
			);

			await orchestrator.start();
			await vi.advanceTimersByTimeAsync(1000);
			const afterFirst = calls;
			orchestrator.stop();
			await vi.advanceTimersByTimeAsync(5000);

			expect(afterFirst).toBeGreaterThanOrEqual(1);
			expect(calls).toBe(afterFirst);
		} finally {
			vi.useRealTimers();
		}
	});

	it("applies run retention after completed runs", async () => {
		const orchestrator = new Orchestrator({
			runRetention: { maxRunsPerJob: 2 },
			runIdFactory: (() => {
				const ids = ["run-1", "run-2", "run-3"];
				let index = 0;
				return () => {
					const id = ids[index];
					index += 1;
					if (!id) {
						return `run-${index}`;
					}
					return id;
				};
			})(),
			now: (() => {
				const timestamps = [
					"2026-04-25T12:00:00.000Z",
					"2026-04-25T12:00:01.000Z",
					"2026-04-25T12:00:02.000Z",
					"2026-04-25T12:00:03.000Z",
					"2026-04-25T12:00:04.000Z",
					"2026-04-25T12:00:05.000Z",
					"2026-04-25T12:00:06.000Z",
					"2026-04-25T12:00:07.000Z",
					"2026-04-25T12:00:08.000Z",
				];
				let index = 0;
				return () => {
					const value = timestamps[index];
					index += 1;
					return new Date(value ?? "2026-04-25T12:00:09.000Z");
				};
			})(),
		});
		await orchestrator.registerJob(createJob("job-retain"), async () => {});

		await orchestrator.runNow("job-retain");
		await orchestrator.runNow("job-retain");
		await orchestrator.runNow("job-retain");

		const runs = await orchestrator.listRuns("job-retain");
		expect(runs).toHaveLength(2);
		expect(runs.map((run) => run.runId).sort()).toEqual(["run-2", "run-3"]);
		const metrics = orchestrator.getMetrics();
		expect(metrics.retentionCompactions).toBe(3);
		expect(metrics.retentionRunsPruned).toBe(1);
	});

	it("tracks and resets orchestration metrics", async () => {
		const orchestrator = new Orchestrator();
		await orchestrator.registerJob(createJob("job-metrics"), async () => {});
		await orchestrator.runNow("job-metrics");

		const metrics = orchestrator.getMetrics();
		expect(metrics.jobsRegistered).toBe(1);
		expect(metrics.runQueued).toBe(1);
		expect(metrics.runStarted).toBe(1);
		expect(metrics.runSucceeded).toBe(1);

		orchestrator.resetMetrics();
		const reset = orchestrator.getMetrics();
		expect(reset.jobsRegistered).toBe(0);
		expect(reset.runQueued).toBe(0);
		expect(reset.runStarted).toBe(0);
		expect(reset.runSucceeded).toBe(0);
	});

	it("returns orchestrator health including store stats", async () => {
		const orchestrator = new Orchestrator({
			now: () => new Date("2026-04-25T13:00:00.000Z"),
		});
		await orchestrator.registerJob(createJob("job-health"), async () => {});
		await orchestrator.runNow("job-health");

		const health = await orchestrator.getHealth();
		expect(health.generatedAt).toBe("2026-04-25T13:00:00.000Z");
		expect(health.started).toBe(false);
		expect(health.registeredJobs).toBe(1);
		expect(health.scheduledJobs).toBe(0);
		expect(health.runningJobs).toBe(0);
		expect(health.metrics.runSucceeded).toBe(1);
		expect(health.store.backend).toBe("in_memory");
		expect(health.store.jobCount).toBe(1);
		expect(health.store.runCount).toBe(1);
	});

	it("publishes events to event sinks and tolerates sink failures", async () => {
		const sink = new InMemoryOrchestrationEventSink();
		const failingSink = {
			publish: async (): Promise<void> => {
				throw new Error("sink failed");
			},
		};

		const orchestrator = new Orchestrator({
			eventSinks: [sink, failingSink],
		});
		await orchestrator.registerJob(createJob("job-sink"), async () => {});
		await orchestrator.runNow("job-sink");
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});

		const sinkEvents = sink.snapshot({ jobId: "job-sink" });
		expect(sinkEvents.map((event) => event.type)).toEqual([
			"job_registered",
			"run_queued",
			"run_started",
			"run_succeeded",
		]);

		const metrics = orchestrator.getMetrics();
		expect(metrics.eventSinkPublished).toBe(4);
		expect(metrics.eventSinkPublishFailures).toBe(4);
		expect(metrics.eventSinkRetries).toBe(0);
		expect(metrics.eventSinkDeadLettered).toBe(0);
		expect(metrics.eventSinkDeadLetterFailures).toBe(0);
	});

	it("retries failed sink publishes and writes dead letters", async () => {
		const deadLetters = new InMemoryOrchestrationDeadLetterSink();
		let attempts = 0;
		const failingSink = {
			publish: async (): Promise<void> => {
				attempts += 1;
				throw new Error("always failing sink");
			},
		};
		const delays: number[] = [];

		const orchestrator = new Orchestrator({
			eventSinks: [failingSink],
			eventSinkPolicy: {
				maxAttempts: 3,
				baseDelayMs: 10,
				maxDelayMs: 20,
				deadLetterSink: deadLetters,
			},
			sleep: async (ms: number): Promise<void> => {
				delays.push(ms);
			},
		});

		await orchestrator.registerJob(createJob("job-dead"), async () => {});
		await orchestrator.runNow("job-dead");
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(attempts).toBe(12);
		expect(delays).toHaveLength(8);
		expect(delays.filter((value) => value === 10)).toHaveLength(4);
		expect(delays.filter((value) => value === 20)).toHaveLength(4);
		const entries = deadLetters.snapshot();
		expect(entries).toHaveLength(4);
		expect(entries.map((entry) => entry.attempts)).toEqual([3, 3, 3, 3]);
		expect(entries.map((entry) => entry.event.type)).toEqual([
			"job_registered",
			"run_queued",
			"run_started",
			"run_succeeded",
		]);

		const metrics = orchestrator.getMetrics();
		expect(metrics.eventSinkPublished).toBe(0);
		expect(metrics.eventSinkPublishFailures).toBe(12);
		expect(metrics.eventSinkRetries).toBe(8);
		expect(metrics.eventSinkDeadLettered).toBe(4);
		expect(metrics.eventSinkDeadLetterFailures).toBe(0);
	});

	it("replays dead-letter events and acknowledges successful entries", async () => {
		const deadLetters = new InMemoryOrchestrationDeadLetterSink();
		const replayedSink = new InMemoryOrchestrationEventSink();
		let shouldFail = true;
		const flakySink = {
			publish: async (event: OrchestrationEvent): Promise<void> => {
				if (shouldFail) {
					throw new Error(`temporary failure for ${event.type}`);
				}
				replayedSink.publish(event);
			},
		};

		const orchestrator = new Orchestrator({
			eventSinks: [flakySink],
			eventSinkPolicy: {
				maxAttempts: 1,
				deadLetterSink: deadLetters,
			},
		});

		await orchestrator.registerJob(createJob("job-replay"), async () => {});
		await orchestrator.runNow("job-replay");
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(deadLetters.size()).toBe(4);
		shouldFail = false;

		const summary = await orchestrator.replayDeadLetters();
		expect(summary).toEqual({
			scanned: 4,
			attempted: 4,
			succeeded: 4,
			failed: 0,
			acked: 4,
			remaining: 0,
		});
		expect(replayedSink.snapshot({ jobId: "job-replay" }).map((event) => event.type)).toEqual([
			"job_registered",
			"run_queued",
			"run_started",
			"run_succeeded",
		]);

		const metrics = orchestrator.getMetrics();
		expect(metrics.deadLetterReplayAttempted).toBe(4);
		expect(metrics.deadLetterReplaySucceeded).toBe(4);
		expect(metrics.deadLetterReplayFailed).toBe(0);
		expect(metrics.deadLetterReplayAcked).toBe(4);
	});

	it("replays dead letters with job and sink filters and maxReplayPerRun", async () => {
		const deadLetters = new InMemoryOrchestrationDeadLetterSink();
		const sinkAEvents = new InMemoryOrchestrationEventSink();
		const sinkBEvents = new InMemoryOrchestrationEventSink();
		let shouldFail = true;
		const sinkA = {
			publish: async (event: OrchestrationEvent): Promise<void> => {
				if (shouldFail) throw new Error("sink-a fail");
				sinkAEvents.publish(event);
			},
		};
		const sinkB = {
			publish: async (event: OrchestrationEvent): Promise<void> => {
				if (shouldFail) throw new Error("sink-b fail");
				sinkBEvents.publish(event);
			},
		};

		const orchestrator = new Orchestrator({
			eventSinks: [sinkA, sinkB],
			eventSinkPolicy: {
				maxAttempts: 1,
				deadLetterSink: deadLetters,
			},
		});

		await orchestrator.registerJob(createJob("job-filter"), async () => {});
		await orchestrator.registerJob(createJob("job-other"), async () => {});
		await orchestrator.runNow("job-filter");
		await orchestrator.runNow("job-other");
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(deadLetters.size()).toBe(16);
		shouldFail = false;

		const summary = await orchestrator.replayDeadLetters({
			jobId: "job-filter",
			sinkIndex: 0,
			maxReplayPerRun: 2,
		});

		expect(summary).toEqual({
			scanned: 2,
			attempted: 2,
			succeeded: 2,
			failed: 0,
			acked: 2,
			remaining: 14,
		});
		expect(sinkAEvents.snapshot({ jobId: "job-filter" })).toHaveLength(2);
		expect(sinkBEvents.snapshot()).toHaveLength(0);
	});
});
