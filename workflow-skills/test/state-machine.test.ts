import assert from "node:assert/strict";
import test from "node:test";

import {
	canTransitionRunStatus,
	canTransitionStepStatus,
	InvalidWorkflowRunTransitionError,
	InvalidWorkflowStepTransitionError,
	isTerminalRunStatus,
	transitionRunRecordStatus,
	transitionStepTraceStatus,
	type WorkflowRunRecord,
	type WorkflowStepTrace,
} from "../src/index.js";

test("run status transitions allow queued -> running -> succeeded", () => {
	const queued: WorkflowRunRecord = {
		runId: "run-1",
		workflowId: "wf-1",
		workflowVersion: "1.0.0",
		status: "queued",
		queuedAt: "2026-01-01T00:00:00.000Z",
	};

	assert.equal(canTransitionRunStatus("queued", "running"), true);
	assert.equal(canTransitionRunStatus("running", "succeeded"), true);
	assert.equal(canTransitionRunStatus("succeeded", "queued"), false);
	assert.equal(isTerminalRunStatus("succeeded"), true);
	assert.equal(isTerminalRunStatus("running"), false);

	const running = transitionRunRecordStatus(queued, "running", {
		at: "2026-01-01T00:00:01.000Z",
		currentStepId: "step.tool",
	});
	const succeeded = transitionRunRecordStatus(running, "succeeded", {
		at: "2026-01-01T00:00:02.000Z",
	});

	assert.equal(running.status, "running");
	assert.equal(running.startedAt, "2026-01-01T00:00:01.000Z");
	assert.equal(succeeded.status, "succeeded");
	assert.equal(succeeded.finishedAt, "2026-01-01T00:00:02.000Z");
});

test("run status transitions reject invalid transition", () => {
	const running: WorkflowRunRecord = {
		runId: "run-2",
		workflowId: "wf-1",
		workflowVersion: "1.0.0",
		status: "running",
		queuedAt: "2026-01-01T00:00:00.000Z",
		startedAt: "2026-01-01T00:00:01.000Z",
	};

	assert.throws(
		() => transitionRunRecordStatus(running, "queued"),
		(error: unknown) => error instanceof InvalidWorkflowRunTransitionError,
	);
});

test("step status transitions support retry path failed -> queued", () => {
	let trace: WorkflowStepTrace = {
		stepId: "step.tool",
		status: "queued",
		attempt: 0,
		queuedAt: "2026-01-01T00:00:00.000Z",
	};

	assert.equal(canTransitionStepStatus("failed", "queued"), true);
	assert.equal(canTransitionStepStatus("succeeded", "queued"), false);

	trace = transitionStepTraceStatus(trace, "running", { at: "2026-01-01T00:00:01.000Z" });
	trace = transitionStepTraceStatus(trace, "failed", {
		at: "2026-01-01T00:00:02.000Z",
		errorMessage: "boom",
	});
	trace = transitionStepTraceStatus(trace, "queued", { at: "2026-01-01T00:00:03.000Z" });

	assert.equal(trace.status, "queued");
	assert.equal(trace.startedAt, undefined);
	assert.equal(trace.finishedAt, undefined);
	assert.equal(trace.errorMessage, undefined);
	assert.equal(trace.durationMs, undefined);
});

test("step status transitions reject invalid transition", () => {
	const trace: WorkflowStepTrace = {
		stepId: "step.finish",
		status: "succeeded",
		attempt: 0,
		queuedAt: "2026-01-01T00:00:00.000Z",
		startedAt: "2026-01-01T00:00:01.000Z",
		finishedAt: "2026-01-01T00:00:01.100Z",
	};

	assert.throws(
		() => transitionStepTraceStatus(trace, "running"),
		(error: unknown) => error instanceof InvalidWorkflowStepTransitionError,
	);
});
