import assert from "node:assert/strict";
import test from "node:test";

import { executeWorkflow, type WorkflowDefinition, type WorkflowStepHandler } from "../src/index.js";

function createNow(startIso = "2026-01-01T00:00:00.000Z"): () => Date {
	let current = Date.parse(startIso);
	return (): Date => {
		const value = new Date(current);
		current += 1;
		return value;
	};
}

function createLinearWorkflow(): WorkflowDefinition {
	return {
		schemaVersion: 1,
		id: "wf.linear",
		name: "Linear Workflow",
		version: "1.0.0",
		entryStepId: "step.tool.fetch",
		steps: [
			{ id: "step.tool.fetch", kind: "tool", skillId: "search", action: "webSearch", maxRetries: 1 },
			{ id: "step.transform.map", kind: "transform", output: { map: true } },
			{ id: "step.finish.done", kind: "finish", result: { ok: true } },
		],
		edges: [
			{ fromStepId: "step.tool.fetch", toStepId: "step.transform.map" },
			{ fromStepId: "step.transform.map", toStepId: "step.finish.done" },
		],
	};
}

function createDecisionWorkflowWithoutDefault(): WorkflowDefinition {
	return {
		schemaVersion: 1,
		id: "wf.decision",
		name: "Decision Workflow",
		version: "1.0.0",
		entryStepId: "step.decision.route",
		steps: [
			{
				id: "step.decision.route",
				kind: "decision",
				branches: [
					{
						id: "branch.a",
						targetStepId: "step.finish.a",
						condition: { path: "input.route", operator: "eq", value: "a" },
					},
				],
			},
			{ id: "step.finish.a", kind: "finish", result: { path: "a" } },
		],
		edges: [],
	};
}

test("executeWorkflow runs deterministic linear path", async () => {
	const workflow = createLinearWorkflow();
	const handler: WorkflowStepHandler = async ({ step }) => {
		if (step.id === "step.tool.fetch") {
			return { output: { rows: 3 } };
		}
		if (step.id === "step.transform.map") {
			return { output: { mapped: true } };
		}
		if (step.id === "step.finish.done") {
			return { output: { finished: true } };
		}
		return {};
	};

	const result = await executeWorkflow(workflow, handler, { query: "hello" }, { now: createNow() });

	assert.equal(result.record.status, "succeeded");
	assert.deepEqual(result.steps.map((step) => step.stepId), [
		"step.tool.fetch",
		"step.transform.map",
		"step.finish.done",
	]);
	assert.deepEqual(result.steps.map((step) => step.attempt), [0, 0, 0]);
	assert.deepEqual(result.finalOutput, { finished: true });
});

test("executeWorkflow retries step and then succeeds", async () => {
	const workflow = createLinearWorkflow();
	const delays: number[] = [];
	let toolAttempts = 0;

	const handler: WorkflowStepHandler = async ({ step }) => {
		if (step.id === "step.tool.fetch") {
			toolAttempts += 1;
			if (toolAttempts === 1) {
				throw new Error("temporary_failure");
			}
			return { output: { recovered: true } };
		}
		if (step.id === "step.transform.map") {
			return { output: { mapped: true } };
		}
		if (step.id === "step.finish.done") {
			return { output: { finished: true } };
		}
		return {};
	};

	const result = await executeWorkflow(workflow, handler, {}, {
		now: createNow(),
		sleep: async (ms: number) => {
			delays.push(ms);
		},
	});

	assert.equal(result.record.status, "succeeded");
	assert.equal(toolAttempts, 2);
	assert.deepEqual(
		result.steps.filter((step) => step.stepId === "step.tool.fetch").map((step) => step.status),
		["failed", "succeeded"],
	);
	assert.deepEqual(delays, [50]);
});

test("executeWorkflow supports cancellation before start", async () => {
	const workflow = createLinearWorkflow();
	const controller = new AbortController();
	controller.abort();

	const result = await executeWorkflow(
		workflow,
		async () => {
			throw new Error("must_not_run");
		},
		{},
		{ now: createNow(), signal: controller.signal },
	);

	assert.equal(result.record.status, "canceled");
	assert.equal(result.steps.length, 0);
});

test("executeWorkflow fails when step exceeds timeout", async () => {
	const workflow: WorkflowDefinition = {
		schemaVersion: 1,
		id: "wf.timeout",
		name: "Timeout Workflow",
		version: "1.0.0",
		entryStepId: "step.tool.long",
		steps: [
			{
				id: "step.tool.long",
				kind: "tool",
				skillId: "search",
				action: "webFetch",
				timeoutMs: 5,
			},
			{ id: "step.finish.done", kind: "finish" },
		],
		edges: [{ fromStepId: "step.tool.long", toStepId: "step.finish.done" }],
	};

	const result = await executeWorkflow(
		workflow,
		async () => {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 30);
			});
			return { output: "late" };
		},
		{},
		{ now: createNow() },
	);

	assert.equal(result.record.status, "failed");
	assert.match(result.record.lastError ?? "", /timed out/);
	assert.equal(result.steps[0]?.status, "failed");
});

test("executeWorkflow fails when decision step does not resolve nextStep", async () => {
	const workflow = createDecisionWorkflowWithoutDefault();
	const handler: WorkflowStepHandler = async () => {
		return {};
	};

	const result = await executeWorkflow(workflow, handler, {}, { now: createNow() });

	assert.equal(result.record.status, "failed");
	assert.match(result.record.lastError ?? "", /requires nextStepId/);
});
