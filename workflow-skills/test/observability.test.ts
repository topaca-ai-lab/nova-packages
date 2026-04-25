import assert from "node:assert/strict";
import test from "node:test";

import {
	computeWorkflowMetricsFromSnapshots,
	getWorkflowFailureContext,
	getWorkflowHealthSnapshot,
	InMemoryWorkflowEventSink,
	InMemoryWorkflowStore,
	type WorkflowExecutionResult,
} from "../src/index.js";

function createResult(
	runId: string,
	workflowId: string,
	status: WorkflowExecutionResult["record"]["status"],
): WorkflowExecutionResult {
	return {
		record: {
			runId,
			workflowId,
			workflowVersion: "1.0.0",
			status,
			queuedAt: "2026-01-01T00:00:00.000Z",
			startedAt: "2026-01-01T00:00:00.100Z",
			finishedAt: "2026-01-01T00:00:00.300Z",
			lastError: status === "failed" ? "tool_failed" : undefined,
		},
		steps: [
			{
				stepId: "step.tool.fetch",
				status: status === "failed" ? "failed" : "succeeded",
				attempt: status === "failed" ? 1 : 0,
				queuedAt: "2026-01-01T00:00:00.100Z",
				startedAt: "2026-01-01T00:00:00.120Z",
				finishedAt: "2026-01-01T00:00:00.220Z",
				durationMs: 100,
				errorMessage: status === "failed" ? "tool_failed" : undefined,
			},
		],
		finalOutput: status === "succeeded" ? { ok: true } : undefined,
	};
}

test("computeWorkflowMetricsFromSnapshots returns deterministic aggregate metrics", () => {
	const metrics = computeWorkflowMetricsFromSnapshots(
		[
			{
				runId: "run-1",
				workflowId: "wf.alpha",
				workflowVersion: "1.0.0",
				result: createResult("run-1", "wf.alpha", "succeeded"),
				persistedAt: "2026-01-01T00:00:01.000Z",
			},
			{
				runId: "run-2",
				workflowId: "wf.alpha",
				workflowVersion: "1.0.0",
				result: createResult("run-2", "wf.alpha", "failed"),
				persistedAt: "2026-01-01T00:00:02.000Z",
			},
		],
		() => new Date("2026-01-01T00:00:03.000Z"),
	);

	assert.equal(metrics.runCount, 2);
	assert.equal(metrics.successCount, 1);
	assert.equal(metrics.failedCount, 1);
	assert.equal(metrics.canceledCount, 0);
	assert.equal(metrics.successRate, 0.5);
	assert.equal(metrics.failureRate, 0.5);
	assert.equal(metrics.averageRunLatencyMs, 200);
	assert.equal(metrics.averageStepLatencyMs, 100);
	assert.equal(metrics.averageStepCount, 1);
	assert.equal(metrics.runsWithRetries, 1);
	assert.equal(metrics.byWorkflow.length, 1);
	assert.equal(metrics.byWorkflow[0]?.workflowId, "wf.alpha");
});

test("getWorkflowFailureContext returns structured failed-step context", () => {
	const failed = createResult("run-failed", "wf.beta", "failed");
	const context = getWorkflowFailureContext(failed);
	assert.ok(context !== undefined);
	assert.equal(context?.status, "failed");
	assert.equal(context?.failedStep?.stepId, "step.tool.fetch");
	assert.equal(context?.failedStep?.attempt, 1);
	assert.equal(context?.timeline.length, 1);

	const succeeded = createResult("run-ok", "wf.beta", "succeeded");
	assert.equal(getWorkflowFailureContext(succeeded), undefined);
});

test("getWorkflowHealthSnapshot combines store, sink, and metrics", async () => {
	const store = new InMemoryWorkflowStore();
	const sink = new InMemoryWorkflowEventSink();

	await store.upsertRunSnapshot({
		runId: "run-1",
		workflowId: "wf.health",
		workflowVersion: "1.0.0",
		result: createResult("run-1", "wf.health", "succeeded"),
		persistedAt: "2026-01-01T00:00:01.000Z",
	});

	sink.publish({
		type: "run_started",
		runId: "run-1",
		workflowId: "wf.health",
		at: "2026-01-01T00:00:00.100Z",
	});

	const snapshot = await getWorkflowHealthSnapshot({
		store,
		eventSink: sink,
		now: () => new Date("2026-01-01T00:00:04.000Z"),
	});

	assert.equal(snapshot.ok, true);
	assert.equal(snapshot.store?.backend, "in_memory");
	assert.equal(snapshot.eventSink?.backend, "in_memory");
	assert.equal(snapshot.eventSink?.queuedEvents, 1);
	assert.equal(snapshot.metrics.runCount, 1);
	assert.deepEqual(snapshot.warnings, []);
});
