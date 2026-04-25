import assert from "node:assert/strict";
import test from "node:test";

import {
	executeWorkflow,
	executeWorkflowWithDispatchers,
	WorkflowPolicyDeniedError,
	WorkflowMaxRuntimeExceededError,
	WorkflowPayloadBudgetExceededError,
	type WorkflowDefinition,
	type WorkflowStepHandler,
} from "../src/index.js";

function createNow(startIso = "2026-01-01T00:00:00.000Z", stepMs = 10): () => Date {
	let current = Date.parse(startIso);
	return (): Date => {
		const value = new Date(current);
		current += stepMs;
		return value;
	};
}

function createSimpleToolWorkflow(): WorkflowDefinition {
	return {
		schemaVersion: 1,
		id: "wf.safety.tool",
		name: "Safety Tool Workflow",
		version: "1.0.0",
		entryStepId: "step.tool.fetch",
		steps: [
			{ id: "step.tool.fetch", kind: "tool", skillId: "search", action: "webSearch", params: { q: "nova" } },
			{ id: "step.finish.done", kind: "finish", result: { ok: true } },
		],
		edges: [{ fromStepId: "step.tool.fetch", toStepId: "step.finish.done" }],
	};
}

test("tool action policy deny list blocks execution", async () => {
	const workflow = createSimpleToolWorkflow();
	const result = await executeWorkflowWithDispatchers(
		workflow,
		{},
		{
			safetyPolicy: {
				toolActions: {
					denyActions: ["search.webSearch"],
				},
			},
			toolInvoker: async () => ({ ok: true, result: { rows: 1 } }),
		},
		{ now: createNow() },
	);

	assert.equal(result.record.status, "failed");
	assert.match(result.record.lastError ?? "", /denied/);
});

test("tool action policy step allow list is enforced", async () => {
	const workflow = createSimpleToolWorkflow();
	const result = await executeWorkflowWithDispatchers(
		workflow,
		{},
		{
			safetyPolicy: {
				toolActions: {
					stepRules: {
						"step.tool.fetch": {
							allowActions: ["search.webFetch"],
						},
					},
				},
			},
			toolInvoker: async () => ({ ok: true, result: { rows: 1 } }),
		},
		{ now: createNow() },
	);

	assert.equal(result.record.status, "failed");
	assert.match(result.record.lastError ?? "", /allowActions/);
});

test("maxRuntimeMs safety budget fails long-running workflow", async () => {
	const workflow: WorkflowDefinition = {
		schemaVersion: 1,
		id: "wf.safety.runtime",
		name: "Runtime Guard Workflow",
		version: "1.0.0",
		entryStepId: "step.transform.one",
		steps: [
			{ id: "step.transform.one", kind: "transform", output: { a: 1 } },
			{ id: "step.transform.two", kind: "transform", output: { b: 2 } },
			{ id: "step.finish.done", kind: "finish", result: { done: true } },
		],
		edges: [
			{ fromStepId: "step.transform.one", toStepId: "step.transform.two" },
			{ fromStepId: "step.transform.two", toStepId: "step.finish.done" },
		],
	};

	const handler: WorkflowStepHandler = async ({ step }) => {
		if (step.kind === "transform") {
			return { output: step.output };
		}
		if (step.kind === "finish") {
			return { output: step.result };
		}
		return {};
	};

	await assert.rejects(
		() =>
			executeWorkflow(workflow, handler, {}, {
				now: createNow("2026-01-01T00:00:00.000Z", 15),
				safetyPolicy: {
					maxRuntimeMs: 20,
				},
			}),
		(error: unknown) => {
			assert.ok(error instanceof WorkflowMaxRuntimeExceededError);
			return true;
		},
	);
});

test("maxInitialInputBytes rejects oversized input", async () => {
	const workflow = createSimpleToolWorkflow();
	const handler: WorkflowStepHandler = async ({ step }) => {
		if (step.kind === "tool") {
			return { output: { ok: true } };
		}
		return { output: { done: true } };
	};

	const oversizedInput = {
		payload: "x".repeat(200),
	};

	await assert.rejects(
		() =>
			executeWorkflow(workflow, handler, oversizedInput, {
				now: createNow(),
				safetyPolicy: {
					budgets: {
						maxInitialInputBytes: 64,
					},
				},
			}),
		(error: unknown) => {
			assert.ok(error instanceof WorkflowPayloadBudgetExceededError);
			return true;
		},
	);
});

test("maxStepOutputBytes rejects oversized step outputs", async () => {
	const workflow = createSimpleToolWorkflow();
	const handler: WorkflowStepHandler = async ({ step }) => {
		if (step.id === "step.tool.fetch") {
			return {
				output: {
					blob: "x".repeat(300),
				},
			};
		}
		return { output: { done: true } };
	};

	const result = await executeWorkflow(workflow, handler, {}, {
		now: createNow(),
		safetyPolicy: {
			budgets: {
				maxStepOutputBytes: 128,
			},
		},
	});

	assert.equal(result.record.status, "failed");
	assert.match(result.record.lastError ?? "", /maxStepOutputBytes/);
});

test("typed safety errors are preserved as executor failures", async () => {
	const denied = new WorkflowPolicyDeniedError("Denied by policy.");
	assert.equal(denied.code, "POLICY_DENIED");

	const runtimeExceeded = new WorkflowMaxRuntimeExceededError(10);
	assert.equal(runtimeExceeded.code, "MAX_RUNTIME_EXCEEDED");

	const budgetExceeded = new WorkflowPayloadBudgetExceededError("maxStepOutputBytes", 256, 128);
	assert.equal(budgetExceeded.code, "PAYLOAD_BUDGET_EXCEEDED");
});
