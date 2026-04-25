import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryWorkflowEventSink, type WorkflowEvent } from "../src/index.js";

test("InMemoryWorkflowEventSink publishes and snapshots events", () => {
	const sink = new InMemoryWorkflowEventSink({ maxEvents: 10 });
	const received: WorkflowEvent[] = [];
	const unsubscribe = sink.subscribe((event) => {
		received.push(event);
	});

	sink.publish({
		type: "run_started",
		runId: "run-1",
		workflowId: "wf.a",
		at: "2026-01-01T00:00:00.000Z",
	});
	sink.publish({
		type: "run_finished",
		runId: "run-1",
		workflowId: "wf.a",
		status: "succeeded",
		at: "2026-01-01T00:00:01.000Z",
	});

	unsubscribe();

	const snapshot = sink.snapshot();
	assert.equal(snapshot.length, 2);
	assert.equal(received.length, 2);
});

test("InMemoryWorkflowEventSink supports filtering and limit", () => {
	const sink = new InMemoryWorkflowEventSink({ maxEvents: 10 });

	sink.publish({
		type: "run_started",
		runId: "run-a",
		workflowId: "wf.a",
		at: "2026-01-01T00:00:00.000Z",
	});
	sink.publish({
		type: "step_recorded",
		runId: "run-a",
		workflowId: "wf.a",
		index: 0,
		step: {
			stepId: "step.1",
			status: "succeeded",
			attempt: 0,
			queuedAt: "2026-01-01T00:00:00.000Z",
		},
		at: "2026-01-01T00:00:00.500Z",
	});
	sink.publish({
		type: "run_finished",
		runId: "run-a",
		workflowId: "wf.a",
		status: "failed",
		at: "2026-01-01T00:00:01.000Z",
	});

	const filtered = sink.snapshot({ runId: "run-a", types: ["step_recorded", "run_finished"], limit: 1 });
	assert.equal(filtered.length, 1);
	assert.equal(filtered[0]?.type, "run_finished");
});
