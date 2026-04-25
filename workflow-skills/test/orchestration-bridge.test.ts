import assert from "node:assert/strict";
import test from "node:test";

import {
	createWorkflowJobId,
	createWorkflowScheduleJobDefinition,
	parseWorkflowJobId,
	registerScheduledWorkflow,
	type OrchestrationJobDefinition,
	type OrchestrationJobHandler,
	type WorkflowDefinition,
} from "../src/index.js";

function createWorkflow(): WorkflowDefinition {
	return {
		schemaVersion: 1,
		id: "wf.bridge",
		name: "Bridge Workflow",
		version: "1.0.0",
		entryStepId: "step.tool.fetch",
		steps: [
			{ id: "step.tool.fetch", kind: "tool", skillId: "search", action: "webSearch" },
			{ id: "step.finish.done", kind: "finish", result: { ok: true } },
		],
		edges: [{ fromStepId: "step.tool.fetch", toStepId: "step.finish.done" }],
	};
}

class FakeRegistrar {
	public definition?: OrchestrationJobDefinition;
	public handler?: OrchestrationJobHandler;

	public registerJob(definition: OrchestrationJobDefinition, handler: OrchestrationJobHandler): void {
		this.definition = definition;
		this.handler = handler;
	}
}

test("createWorkflowScheduleJobDefinition maps heartbeat trigger", () => {
	const workflow = createWorkflow();
	const definition = createWorkflowScheduleJobDefinition(workflow, {
		trigger: { kind: "heartbeat", intervalMs: 60_000 },
	});

	assert.equal(definition.id, "workflow:wf.bridge");
	assert.equal(definition.name, "Workflow Bridge Workflow");
	assert.equal(definition.trigger.kind, "heartbeat");
	assert.equal(definition.retry.maxRetries, 2);
});

test("createWorkflowScheduleJobDefinition maps cron trigger and custom retry", () => {
	const workflow = createWorkflow();
	const definition = createWorkflowScheduleJobDefinition(workflow, {
		jobId: "custom.job.id",
		jobName: "Custom Job",
		trigger: { kind: "cron", expression: "*/5 * * * *" },
		retry: {
			maxRetries: 4,
			baseDelayMs: 100,
			maxDelayMs: 1_000,
		},
	});

	assert.equal(definition.id, "custom.job.id");
	assert.equal(definition.name, "Custom Job");
	assert.deepEqual(definition.trigger, { kind: "cron", expression: "*/5 * * * *" });
	assert.deepEqual(definition.retry, { maxRetries: 4, baseDelayMs: 100, maxDelayMs: 1_000 });
});

test("workflow job id helpers map and parse ids", () => {
	const jobId = createWorkflowJobId("wf.abc");
	assert.equal(jobId, "workflow:wf.abc");
	assert.deepEqual(parseWorkflowJobId(jobId), { workflowId: "wf.abc" });
	assert.equal(parseWorkflowJobId("job:wf.abc"), undefined);
});

test("registerScheduledWorkflow registers heartbeat job and executes handler", async () => {
	const workflow = createWorkflow();
	const registrar = new FakeRegistrar();
	const completed: Array<{ runId: string; status: string; attempt: number }> = [];

	const job = await registerScheduledWorkflow(registrar, {
		workflow,
		binding: {
			trigger: { kind: "heartbeat", intervalMs: 30_000 },
		},
		dispatchers: {
			toolInvoker: async () => ({ ok: true, result: { rows: 1 } }),
		},
		inputResolver: (context) => ({
			invokedBy: "heartbeat",
			attempt: context.attempt,
		}),
		onRunCompleted: (result, intent) => {
			completed.push({
				runId: result.result.record.runId,
				status: result.result.record.status,
				attempt: intent.attempt,
			});
		},
	});

	assert.equal(job.trigger.kind, "heartbeat");
	assert.ok(registrar.handler !== undefined);

	await registrar.handler?.({
		job,
		runId: "orun-1",
		attempt: 0,
		signal: new AbortController().signal,
	});

	assert.deepEqual(completed, [{ runId: "orun-1", status: "succeeded", attempt: 0 }]);
});

test("registerScheduledWorkflow registers cron job and executes handler", async () => {
	const workflow = createWorkflow();
	const registrar = new FakeRegistrar();
	let finishedStatus = "";

	const job = await registerScheduledWorkflow(registrar, {
		workflow,
		binding: {
			trigger: { kind: "cron", expression: "0 * * * *" },
		},
		dispatchers: {
			toolInvoker: async () => ({ ok: true, result: { rows: 3 } }),
		},
		inputResolver: () => ({ invokedBy: "cron" }),
		onRunCompleted: (result) => {
			finishedStatus = result.result.record.status;
		},
	});

	assert.equal(job.trigger.kind, "cron");
	assert.ok(registrar.handler !== undefined);

	await registrar.handler?.({
		job,
		runId: "orun-2",
		attempt: 1,
		signal: new AbortController().signal,
	});

	assert.equal(finishedStatus, "succeeded");
});
