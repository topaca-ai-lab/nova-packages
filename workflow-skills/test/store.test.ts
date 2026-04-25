import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryWorkflowStore, type WorkflowDefinition, type WorkflowExecutionResult } from "../src/index.js";

function createWorkflow(id: string): WorkflowDefinition {
	return {
		schemaVersion: 1,
		id,
		name: id,
		version: "1.0.0",
		entryStepId: "step.finish",
		steps: [{ id: "step.finish", kind: "finish" }],
		edges: [],
	};
}

function createResult(runId: string, workflowId: string): WorkflowExecutionResult {
	return {
		record: {
			runId,
			workflowId,
			workflowVersion: "1.0.0",
			status: "succeeded",
			queuedAt: "2026-01-01T00:00:00.000Z",
			startedAt: "2026-01-01T00:00:00.100Z",
			finishedAt: "2026-01-01T00:00:00.200Z",
		},
		steps: [],
		finalOutput: { ok: true },
	};
}

test("InMemoryWorkflowStore stores and lists workflow definitions", async () => {
	const store = new InMemoryWorkflowStore();
	await store.upsertWorkflowDefinition(createWorkflow("wf.a"));
	await store.upsertWorkflowDefinition(createWorkflow("wf.b"));

	const list = await store.listWorkflowDefinitions();
	assert.equal(list.length, 2);
	assert.ok(list.some((workflow) => workflow.id === "wf.a"));
	assert.ok(list.some((workflow) => workflow.id === "wf.b"));
});

test("InMemoryWorkflowStore stores and filters run snapshots", async () => {
	const store = new InMemoryWorkflowStore();
	await store.upsertRunSnapshot({
		runId: "run-1",
		workflowId: "wf.a",
		workflowVersion: "1.0.0",
		result: createResult("run-1", "wf.a"),
		persistedAt: "2026-01-01T00:00:01.000Z",
	});
	await store.upsertRunSnapshot({
		runId: "run-2",
		workflowId: "wf.b",
		workflowVersion: "1.0.0",
		result: createResult("run-2", "wf.b"),
		persistedAt: "2026-01-01T00:00:02.000Z",
	});

	const all = await store.listRunSnapshots();
	const wfA = await store.listRunSnapshots("wf.a");

	assert.equal(all.length, 2);
	assert.equal(wfA.length, 1);
	assert.equal(wfA[0]?.runId, "run-1");
});

test("InMemoryWorkflowStore health returns available", async () => {
	const store = new InMemoryWorkflowStore();
	const health = await store.health();
	assert.equal(health.ok, true);
	assert.equal(health.backend, "in_memory");
});
