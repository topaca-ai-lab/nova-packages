import { describe, expect, it } from "vitest";
import { createInMemoryOrchestrationStore } from "../src/index.js";
import type { JobDefinition, RunRecord } from "../src/types.js";

function createJob(id = "job-1"): JobDefinition {
	return {
		id,
		name: `job-${id}`,
		trigger: { kind: "heartbeat", intervalMs: 1000 },
		retry: {
			maxRetries: 2,
			baseDelayMs: 100,
			maxDelayMs: 2000,
		},
	};
}

function createRun(jobId = "job-1", runId = "run-1"): RunRecord {
	return {
		jobId,
		runId,
		status: "queued",
		attempt: 0,
		queuedAt: "2026-04-25T10:00:00.000Z",
	};
}

describe("InMemoryOrchestrationStore - jobs", () => {
	it("upserts and lists jobs", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertJob(createJob("job-1"));
		await store.upsertJob(createJob("job-2"));

		const jobs = await store.listJobs();
		expect(jobs).toHaveLength(2);
		expect(jobs.map((job) => job.id).sort()).toEqual(["job-1", "job-2"]);
	});

	it("returns undefined for unknown job", async () => {
		const store = createInMemoryOrchestrationStore();
		const job = await store.getJob("missing");
		expect(job).toBeUndefined();
	});

	it("deletes job and related runs", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertJob(createJob("job-1"));
		await store.upsertRun(createRun("job-1", "run-1"));
		await store.upsertRun(createRun("job-1", "run-2"));

		const deleted = await store.deleteJob("job-1");
		expect(deleted).toBe(true);
		expect(await store.getJob("job-1")).toBeUndefined();
		expect(await store.listRuns("job-1")).toEqual([]);
	});
});

describe("InMemoryOrchestrationStore - runs", () => {
	it("upserts and retrieves run records", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertRun(createRun("job-1", "run-1"));

		const run = await store.getRun("run-1");
		expect(run?.runId).toBe("run-1");
		expect(run?.jobId).toBe("job-1");
	});

	it("updates existing run by runId", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertRun(createRun("job-1", "run-1"));
		await store.upsertRun({
			...createRun("job-1", "run-1"),
			status: "running",
			startedAt: "2026-04-25T10:00:10.000Z",
		});

		const run = await store.getRun("run-1");
		expect(run?.status).toBe("running");
		expect(run?.startedAt).toBe("2026-04-25T10:00:10.000Z");
	});

	it("lists runs by job id", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertRun(createRun("job-1", "run-a"));
		await store.upsertRun(createRun("job-1", "run-b"));
		await store.upsertRun(createRun("job-2", "run-c"));

		const job1Runs = await store.listRuns("job-1");
		expect(job1Runs.map((run) => run.runId).sort()).toEqual(["run-a", "run-b"]);
	});

	it("deletes runs for job id", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertRun(createRun("job-1", "run-a"));
		await store.upsertRun(createRun("job-1", "run-b"));
		await store.upsertRun(createRun("job-2", "run-c"));

		const deletedCount = await store.deleteRunsForJob("job-1");
		expect(deletedCount).toBe(2);
		expect(await store.listRuns("job-1")).toEqual([]);
		expect(await store.listRuns("job-2")).toHaveLength(1);
	});

	it("prunes runs by maxRunsPerJob", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertRun({ ...createRun("job-1", "run-a"), queuedAt: "2026-04-25T10:00:00.000Z" });
		await store.upsertRun({ ...createRun("job-1", "run-b"), queuedAt: "2026-04-25T10:01:00.000Z" });
		await store.upsertRun({ ...createRun("job-1", "run-c"), queuedAt: "2026-04-25T10:02:00.000Z" });

		const deleted = await store.pruneRuns("job-1", { maxRunsPerJob: 2 });
		const runs = await store.listRuns("job-1");
		expect(deleted).toBe(1);
		expect(runs.map((run) => run.runId).sort()).toEqual(["run-b", "run-c"]);
	});

	it("prunes runs by maxAgeMs", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertRun({ ...createRun("job-1", "old-run"), queuedAt: "2026-04-25T09:00:00.000Z" });
		await store.upsertRun({ ...createRun("job-1", "new-run"), queuedAt: "2026-04-25T10:00:00.000Z" });

		const deleted = await store.pruneRuns("job-1", {
			maxAgeMs: 30 * 60 * 1000,
			now: new Date("2026-04-25T10:00:00.000Z"),
		});
		const runs = await store.listRuns("job-1");

		expect(deleted).toBe(1);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.runId).toBe("new-run");
	});

	it("returns store stats snapshot", async () => {
		const store = createInMemoryOrchestrationStore();
		await store.upsertJob(createJob("job-1"));
		await store.upsertRun({ ...createRun("job-1", "run-queued"), status: "queued" });
		await store.upsertRun({ ...createRun("job-1", "run-succeeded"), status: "succeeded" });

		const stats = await store.getStats({ now: new Date("2026-04-25T12:00:00.000Z") });
		expect(stats.backend).toBe("in_memory");
		expect(stats.generatedAt).toBe("2026-04-25T12:00:00.000Z");
		expect(stats.jobCount).toBe(1);
		expect(stats.runCount).toBe(2);
		expect(stats.runsByStatus.queued).toBe(1);
		expect(stats.runsByStatus.succeeded).toBe(1);
		expect(stats.lastCompactionAtByJob).toEqual({});
	});
});
