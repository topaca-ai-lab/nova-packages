import { describe, expect, it } from "vitest";
import {
	canTransitionRunStatus,
	InvalidRunTransitionError,
	isTerminalStatus,
	transitionRunRecordStatus,
} from "../src/index.js";
import type { RunRecord } from "../src/types.js";

function createQueuedRunRecord(): RunRecord {
	return {
		jobId: "job-1",
		runId: "run-1",
		status: "queued",
		attempt: 0,
		queuedAt: "2026-04-25T06:00:00.000Z",
	};
}

describe("state machine", () => {
	it("accepts queued -> running -> succeeded", () => {
		const queued = createQueuedRunRecord();
		const running = transitionRunRecordStatus(queued, "running", { at: "2026-04-25T06:00:05.000Z" });
		const succeeded = transitionRunRecordStatus(running, "succeeded", { at: "2026-04-25T06:00:10.000Z" });

		expect(running.status).toBe("running");
		expect(running.startedAt).toBe("2026-04-25T06:00:05.000Z");
		expect(succeeded.status).toBe("succeeded");
		expect(succeeded.finishedAt).toBe("2026-04-25T06:00:10.000Z");
		expect(succeeded.lastError).toBeUndefined();
	});

	it("accepts queued -> canceled", () => {
		const queued = createQueuedRunRecord();
		const canceled = transitionRunRecordStatus(queued, "canceled", { at: "2026-04-25T06:00:06.000Z" });

		expect(canceled.status).toBe("canceled");
		expect(canceled.finishedAt).toBe("2026-04-25T06:00:06.000Z");
		expect(canceled.startedAt).toBeUndefined();
	});

	it("rejects invalid transition queued -> succeeded", () => {
		const queued = createQueuedRunRecord();
		expect(() => transitionRunRecordStatus(queued, "succeeded")).toThrow(InvalidRunTransitionError);
	});

	it("supports failed -> queued retry reset and attempt increment", () => {
		const failed: RunRecord = {
			...createQueuedRunRecord(),
			status: "failed",
			attempt: 2,
			startedAt: "2026-04-25T06:00:01.000Z",
			finishedAt: "2026-04-25T06:00:03.000Z",
			lastError: "timeout",
		};

		const retried = transitionRunRecordStatus(failed, "queued", { at: "2026-04-25T06:00:04.000Z" });
		expect(retried.status).toBe("queued");
		expect(retried.attempt).toBe(3);
		expect(retried.startedAt).toBeUndefined();
		expect(retried.finishedAt).toBeUndefined();
		expect(retried.lastError).toBeUndefined();
	});
});

describe("transition helpers", () => {
	it("reports transition validity", () => {
		expect(canTransitionRunStatus("queued", "running")).toBe(true);
		expect(canTransitionRunStatus("queued", "failed")).toBe(false);
	});

	it("detects terminal statuses", () => {
		expect(isTerminalStatus("succeeded")).toBe(true);
		expect(isTerminalStatus("failed")).toBe(true);
		expect(isTerminalStatus("canceled")).toBe(true);
		expect(isTerminalStatus("running")).toBe(false);
	});
});

