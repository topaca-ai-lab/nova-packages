import assert from "node:assert/strict";
import test from "node:test";

import { executeWorkflowWithDispatchers, type WorkflowDefinition } from "../src/index.js";

function createNow(startIso = "2026-01-01T00:00:00.000Z"): () => Date {
	let current = Date.parse(startIso);
	return (): Date => {
		const value = new Date(current);
		current += 1;
		return value;
	};
}

test("executeWorkflowWithDispatchers runs tool->decision->memory->finish", async () => {
	const workflow: WorkflowDefinition = {
		schemaVersion: 1,
		id: "wf.dispatchers",
		name: "Dispatcher Workflow",
		version: "1.0.0",
		entryStepId: "step.tool.fetch",
		steps: [
			{ id: "step.tool.fetch", kind: "tool", skillId: "search", action: "webSearch", params: { q: "nova" } },
			{
				id: "step.decision.priority",
				kind: "decision",
				branches: [
					{
						id: "branch.high",
						targetStepId: "step.memory.write",
						condition: {
							path: "input.ticket.priority",
							operator: "eq",
							value: "high",
						},
					},
				],
				defaultTargetStepId: "step.finish.low",
			},
			{ id: "step.memory.write", kind: "memory", operation: "write", namespace: "tickets" },
			{ id: "step.finish.low", kind: "finish", result: { lane: "low" } },
			{ id: "step.finish.high", kind: "finish", result: { lane: "high" } },
		],
		edges: [
			{ fromStepId: "step.tool.fetch", toStepId: "step.decision.priority" },
			{ fromStepId: "step.memory.write", toStepId: "step.finish.high" },
		],
	};

	const toolCalls: string[] = [];
	const memoryCalls: string[] = [];

	const result = await executeWorkflowWithDispatchers(
		workflow,
		{
			ticket: {
				priority: "high",
			},
		},
		{
			toolInvoker: async ({ skillId, action }) => {
				toolCalls.push(`${skillId}.${action}`);
				return { ok: true, result: { fetched: true } };
			},
			memoryDispatcher: {
				read: async () => {
					memoryCalls.push("read");
					return {};
				},
				write: async () => {
					memoryCalls.push("write");
					return { persisted: true };
				},
				query: async () => {
					memoryCalls.push("query");
					return {};
				},
			},
		},
		{
			now: createNow(),
		},
	);

	assert.equal(result.record.status, "succeeded");
	assert.deepEqual(toolCalls, ["search.webSearch"]);
	assert.deepEqual(memoryCalls, ["write"]);
	assert.deepEqual(result.steps.map((step) => step.stepId), [
		"step.tool.fetch",
		"step.decision.priority",
		"step.memory.write",
		"step.finish.high",
	]);
	assert.deepEqual(result.finalOutput, { lane: "high" });
});
