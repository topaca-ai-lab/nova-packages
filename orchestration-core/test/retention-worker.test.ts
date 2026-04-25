import { describe, expect, it, vi } from "vitest";
import { RetentionCompactionWorker, createInMemoryOrchestrationStore, runRetentionCompactionOnce } from "../src/index.js";
import type { JobDefinition, RunRecord } from "../src/types.js";

function createJob(id = "job-1"): JobDefinition {
	return {
		id,
		name: `job-${id}`,
		trigger: { kind: "heartbeat", intervalMs: 1000 },
		retry: {
			maxRetries: 0,
			baseDelayMs: 10,
			maxDelayMs: 100,
		},
	};
}

function createRun(jobId: string, runId: string, queuedAt: string): RunRecord {
	return {
		jobId,
		runId,
		status: "queued",
		attempt: 0,
		queuedAt,
	};
}

describe("RetentionCompactionWorker", () => {
	it("runs one compaction cycle across all jobs", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertJob(createJob("job-a"));
		await store.upsertJob(createJob("job-b"));
		await store.upsertRun(createRun("job-a", "a-1", "2026-04-25T10:00:00.000Z"));
		await store.upsertRun(createRun("job-a", "a-2", "2026-04-25T10:01:00.000Z"));
		await store.upsertRun(createRun("job-b", "b-1", "2026-04-25T10:02:00.000Z"));
		await store.upsertRun(createRun("job-b", "b-2", "2026-04-25T10:03:00.000Z"));

		const summary = await runRetentionCompactionOnce(store, { maxRunsPerJob: 1 });
		expect(summary.jobsScanned).toBe(2);
		expect(summary.jobsPruned).toBe(2);
		expect(summary.runsPruned).toBe(2);
		expect((await store.listRuns("job-a")).map((run) => run.runId)).toEqual(["a-2"]);
		expect((await store.listRuns("job-b")).map((run) => run.runId)).toEqual(["b-2"]);
	});

	it("schedules periodic compaction when started", async () => {
		vi.useFakeTimers();
		try {
			const store = createInMemoryOrchestrationStore();
			await store.upsertJob(createJob("job-a"));
			await store.upsertRun(createRun("job-a", "a-1", "2026-04-25T10:00:00.000Z"));
			await store.upsertRun(createRun("job-a", "a-2", "2026-04-25T10:01:00.000Z"));
			let cycles = 0;

			const worker = new RetentionCompactionWorker(store, { maxRunsPerJob: 1 }, {
				intervalMs: 1000,
				onCycle: () => {
					cycles += 1;
				},
			});

			worker.start();
			await vi.advanceTimersByTimeAsync(1000);
			worker.stop();
			await vi.advanceTimersByTimeAsync(5000);

			expect(cycles).toBe(1);
			expect((await store.listRuns("job-a")).map((run) => run.runId)).toEqual(["a-2"]);
		} finally {
			vi.useRealTimers();
		}
	});
});
