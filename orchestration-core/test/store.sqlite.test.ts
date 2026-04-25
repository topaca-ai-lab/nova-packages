import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteOrchestrationStore } from "../src/index.js";
import type { JobDefinition, RunRecord } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

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

function createRun(jobId = "job-1", runId = "run-1", queuedAt = "2026-04-25T10:00:00.000Z"): RunRecord {
	return {
		jobId,
		runId,
		status: "queued",
		attempt: 0,
		queuedAt,
	};
}

function createStore() {
	const dir = mkdtempSync(join(tmpdir(), "nova-orchestration-sqlite-"));
	tempDirs.push(dir);
	const dbPath = join(dir, "orchestration.sqlite");
	return createSqliteOrchestrationStore({ path: dbPath });
}

describe("SqliteOrchestrationStore", () => {
	it("applies migrations and exposes schema version", async () => {
		const store = createStore();
		try {
			expect(store.getSchemaVersion()).toBe(2);
		} finally {
			store.close();
		}
	});

	it("upserts and loads jobs and runs", async () => {
		const store = createStore();
		try {
			await store.upsertJob(createJob("job-a"));
			await store.upsertRun(createRun("job-a", "run-a"));

			const job = await store.getJob("job-a");
			const run = await store.getRun("run-a");

			expect(job?.id).toBe("job-a");
			expect(run?.runId).toBe("run-a");
			expect(run?.jobId).toBe("job-a");
		} finally {
			store.close();
		}
	});

	it("deletes runs when job is deleted (FK cascade)", async () => {
		const store = createStore();
		try {
			await store.upsertJob(createJob("job-a"));
			await store.upsertRun(createRun("job-a", "run-a"));
			await store.upsertRun(createRun("job-a", "run-b"));

			const deleted = await store.deleteJob("job-a");
			expect(deleted).toBe(true);
			expect(await store.listRuns("job-a")).toEqual([]);
		} finally {
			store.close();
		}
	});

	it("prunes runs by maxRunsPerJob and maxAgeMs", async () => {
		const store = createStore();
		try {
			await store.upsertJob(createJob("job-a"));
			await store.upsertRun(createRun("job-a", "run-1", "2026-04-25T09:00:00.000Z"));
			await store.upsertRun(createRun("job-a", "run-2", "2026-04-25T10:00:00.000Z"));
			await store.upsertRun(createRun("job-a", "run-3", "2026-04-25T10:10:00.000Z"));

			const deletedByAge = await store.pruneRuns("job-a", {
				maxAgeMs: 30 * 60 * 1000,
				now: new Date("2026-04-25T10:10:00.000Z"),
			});
			expect(deletedByAge).toBe(1);

			const deletedByCount = await store.pruneRuns("job-a", { maxRunsPerJob: 1 });
			expect(deletedByCount).toBe(1);

			const runs = await store.listRuns("job-a");
			expect(runs).toHaveLength(1);
			expect(runs[0]?.runId).toBe("run-3");

			const compactions = store.listCompactionHistory("job-a");
			expect(compactions).toHaveLength(2);
			expect(compactions[0]?.deletedRuns).toBe(1);
			expect(compactions[1]?.deletedRuns).toBe(1);

			const stats = await store.getStats({ now: new Date("2026-04-25T10:15:00.000Z") });
			expect(stats.backend).toBe("sqlite");
			expect(stats.generatedAt).toBe("2026-04-25T10:15:00.000Z");
			expect(stats.jobCount).toBe(1);
			expect(stats.runCount).toBe(1);
			expect(stats.runsByStatus.queued).toBe(1);
			expect(stats.lastCompactionAtByJob["job-a"]).toBe("2026-04-25T10:10:00.000Z");
			expect(stats.metadata.schemaVersion).toBe(2);
		} finally {
			store.close();
		}
	});
});
