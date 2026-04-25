import assert from "node:assert/strict";
import test from "node:test";

import {
	executeWorkflowRuntime,
	InMemoryWorkflowEventSink,
	InMemoryWorkflowStore,
	type WorkflowDefinition,
} from "../src/index.js";

function createNow(startIso = "2026-01-01T00:00:00.000Z"): () => Date {
	let current = Date.parse(startIso);
	return (): Date => {
		const value = new Date(current);
		current += 1;
		return value;
	};
}

test("executeWorkflowRuntime persists snapshot and emits ordered events", async () => {
	const workflow: WorkflowDefinition = {
		schemaVersion: 1,
		id: "wf.runtime",
		name: "Runtime Workflow",
		version: "1.0.0",
		entryStepId: "step.tool.fetch",
		steps: [
			{ id: "step.tool.fetch", kind: "tool", skillId: "search", action: "webSearch", params: { q: "nova" } },
			{ id: "step.finish.done", kind: "finish", result: { done: true } },
		],
		edges: [{ fromStepId: "step.tool.fetch", toStepId: "step.finish.done" }],
	};

	const store = new InMemoryWorkflowStore();
	const sink = new InMemoryWorkflowEventSink();

	const runtimeResult = await executeWorkflowRuntime(
		workflow,
		{},
		{
			now: createNow(),
			dispatchers: {
				toolInvoker: async () => ({
					ok: true,
					result: { rows: 1 },
				}),
			},
			store,
			eventSink: sink,
		},
	);

	assert.equal(runtimeResult.result.record.status, "succeeded");
	assert.ok(runtimeResult.snapshot !== undefined);

	const storedDefinition = await store.getWorkflowDefinition("wf.runtime");
	assert.ok(storedDefinition !== undefined);

	const storedRun = await store.getRunSnapshot(runtimeResult.result.record.runId);
	assert.ok(storedRun !== undefined);
	assert.equal(storedRun?.result.record.status, "succeeded");

	const events = sink.snapshot({ runId: runtimeResult.result.record.runId });
	assert.ok(events.length >= 3);
	assert.equal(events[0]?.type, "run_started");
	assert.equal(events[events.length - 1]?.type, "run_finished");
	assert.ok(events.some((event) => event.type === "step_recorded"));
});
