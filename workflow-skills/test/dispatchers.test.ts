import assert from "node:assert/strict";
import test from "node:test";

import {
	createDefaultStepHandler,
	WorkflowExecutionError,
	type WorkflowExecutionContext,
	type WorkflowStep,
} from "../src/index.js";

function createContext(overrides: Partial<WorkflowExecutionContext> = {}): WorkflowExecutionContext {
	return {
		workflow: {
			schemaVersion: 1,
			id: "wf.ctx",
			name: "Context Workflow",
			version: "1.0.0",
			entryStepId: "step.entry",
			steps: [],
			edges: [],
		},
		runId: "run-test",
		input: {
			ticket: {
				priority: "high",
				title: "Printer is offline",
			},
		},
		signal: new AbortController().signal,
		vars: {
			region: "eu",
		},
		stepOutputs: {
			"step.prev": {
				count: 3,
			},
		},
		...overrides,
	};
}

test("tool dispatcher calls toolInvoker and returns result", async () => {
	const calls: Array<{ skillId: string; action: string }> = [];
	const handler = createDefaultStepHandler({
		toolInvoker: async (request) => {
			calls.push({ skillId: request.skillId, action: request.action });
			return {
				ok: true,
				result: { rows: 2 },
			};
		},
	});

	const step: WorkflowStep = {
		id: "step.tool.search",
		kind: "tool",
		skillId: "search",
		action: "webSearch",
		params: { q: "nova" },
	};

	const result = await handler({ step, attempt: 0, context: createContext() });
	assert.deepEqual(result, { output: { rows: 2 } });
	assert.deepEqual(calls, [{ skillId: "search", action: "webSearch" }]);
});

test("tool dispatcher maps tool errors to WorkflowExecutionError", async () => {
	const handler = createDefaultStepHandler({
		toolInvoker: async () => ({
			ok: false,
			error: {
				code: "TIMEOUT",
				message: "timeout",
				retryable: true,
			},
		}),
	});

	const step: WorkflowStep = {
		id: "step.tool.search",
		kind: "tool",
		skillId: "search",
		action: "webSearch",
	};

	await assert.rejects(
		() => handler({ step, attempt: 0, context: createContext() }),
		(error: unknown) => {
			assert.ok(error instanceof WorkflowExecutionError);
			assert.equal(error.code, "TOOL_CALL_FAILED");
			return true;
		},
	);
});

test("decision dispatcher selects matching branch", async () => {
	const handler = createDefaultStepHandler({});
	const step: WorkflowStep = {
		id: "step.decision.priority",
		kind: "decision",
		branches: [
			{
				id: "branch.high",
				targetStepId: "step.finish.high",
				condition: {
					path: "input.ticket.priority",
					operator: "eq",
					value: "high",
				},
			},
		],
		defaultTargetStepId: "step.finish.default",
	};

	const result = await handler({ step, attempt: 0, context: createContext() });
	assert.equal(result.nextStepId, "step.finish.high");
	assert.deepEqual(result.output, { matchedBranchId: "branch.high" });
});

test("memory dispatcher routes operations to memoryDispatcher", async () => {
	const calls: string[] = [];
	const handler = createDefaultStepHandler({
		memoryDispatcher: {
			read: async () => {
				calls.push("read");
				return { value: 1 };
			},
			write: async () => {
				calls.push("write");
				return { value: 2 };
			},
			query: async () => {
				calls.push("query");
				return { value: 3 };
			},
		},
	});

	const readResult = await handler({
		step: { id: "step.memory.read", kind: "memory", operation: "read", namespace: "tickets" },
		attempt: 0,
		context: createContext(),
	});
	const writeResult = await handler({
		step: { id: "step.memory.write", kind: "memory", operation: "write", namespace: "tickets" },
		attempt: 0,
		context: createContext(),
	});
	const queryResult = await handler({
		step: { id: "step.memory.query", kind: "memory", operation: "query", namespace: "tickets" },
		attempt: 0,
		context: createContext(),
	});

	assert.deepEqual(calls, ["read", "write", "query"]);
	assert.deepEqual(readResult.output, { value: 1 });
	assert.deepEqual(writeResult.output, { value: 2 });
	assert.deepEqual(queryResult.output, { value: 3 });
});

test("transform dispatcher maps $. paths from context", async () => {
	const handler = createDefaultStepHandler({});
	const step: WorkflowStep = {
		id: "step.transform.payload",
		kind: "transform",
		output: {
			title: "$.input.ticket.title",
			region: "$.vars.region",
			count: "$.steps.step.prev.count",
			constant: "ok",
			nested: {
				priority: "$.input.ticket.priority",
			},
		},
	};

	const result = await handler({ step, attempt: 0, context: createContext() });
	assert.deepEqual(result.output, {
		title: "Printer is offline",
		region: "eu",
		count: 3,
		constant: "ok",
		nested: {
			priority: "high",
		},
	});
});
