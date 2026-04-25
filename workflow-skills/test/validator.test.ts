import assert from "node:assert/strict";
import test from "node:test";

import { WorkflowValidationError, getWorkflowValidationIssues, validateWorkflowDefinition } from "../src/index.js";
import type { WorkflowDefinition } from "../src/types.js";

function createValidWorkflow(): WorkflowDefinition {
	return {
		schemaVersion: 1,
		id: "wf.support.triage",
		name: "Support Triage",
		version: "1.0.0",
		entryStepId: "step.tool.readTicket",
		steps: [
			{
				id: "step.tool.readTicket",
				kind: "tool",
				skillId: "files",
				action: "download",
			},
			{
				id: "step.decision.priority",
				kind: "decision",
				branches: [
					{
						id: "branch.high",
						targetStepId: "step.memory.write",
						condition: {
							path: "ticket.priority",
							operator: "eq",
							value: "high",
						},
					},
				],
				defaultTargetStepId: "step.finish.low",
			},
			{
				id: "step.memory.write",
				kind: "memory",
				operation: "write",
				namespace: "tickets",
			},
			{
				id: "step.finish.low",
				kind: "finish",
			},
			{
				id: "step.finish.high",
				kind: "finish",
			},
		],
		edges: [
			{ fromStepId: "step.tool.readTicket", toStepId: "step.decision.priority" },
			{ fromStepId: "step.memory.write", toStepId: "step.finish.high" },
		],
	};
}

test("validateWorkflowDefinition accepts a valid minimal deterministic workflow", () => {
	const workflow = createValidWorkflow();
	assert.doesNotThrow(() => validateWorkflowDefinition(workflow));
	assert.deepEqual(getWorkflowValidationIssues(workflow), []);
});

test("validateWorkflowDefinition rejects unknown entry step", () => {
	const workflow = {
		...createValidWorkflow(),
		entryStepId: "step.unknown",
	};

	assert.throws(
		() => validateWorkflowDefinition(workflow),
		(error: unknown) => {
			assert.ok(error instanceof WorkflowValidationError);
			assert.ok(error.issues.some((issue) => issue.code === "unknown_entry_step"));
			return true;
		},
	);
});

test("validateWorkflowDefinition rejects cycle graphs in phase-1", () => {
	const workflow = {
		...createValidWorkflow(),
		edges: [
			{ fromStepId: "step.tool.readTicket", toStepId: "step.decision.priority" },
			{ fromStepId: "step.memory.write", toStepId: "step.finish.high" },
			{ fromStepId: "step.finish.high", toStepId: "step.tool.readTicket" },
		],
	};

	assert.throws(
		() => validateWorkflowDefinition(workflow),
		(error: unknown) => {
			assert.ok(error instanceof WorkflowValidationError);
			assert.ok(error.issues.some((issue) => issue.code === "finish_step_has_outgoing_transition"));
			assert.ok(error.issues.some((issue) => issue.code === "workflow_cycle_detected"));
			return true;
		},
	);
});

test("validateWorkflowDefinition rejects invalid branch targets", () => {
	const base = createValidWorkflow();
	const decision = base.steps.find((step) => step.id === "step.decision.priority");
	assert.ok(decision !== undefined);
	assert.equal(decision.kind, "decision");

	const workflow = {
		...base,
		steps: base.steps.map((step) => {
			if (step.id !== "step.decision.priority") {
				return step;
			}
			return {
				...step,
				branches: [
					{
						id: "branch.high",
						targetStepId: "step.not.found",
						condition: {
							path: "ticket.priority",
							operator: "eq",
							value: "high",
						},
					},
				],
			};
		}),
	};

	assert.throws(
		() => validateWorkflowDefinition(workflow),
		(error: unknown) => {
			assert.ok(error instanceof WorkflowValidationError);
			assert.ok(error.issues.some((issue) => issue.code === "invalid_branch_target"));
			return true;
		},
	);
});

test("validateWorkflowDefinition rejects workflow without reachable finish", () => {
	const base = createValidWorkflow();
	const workflow: WorkflowDefinition = {
		...base,
		edges: [{ fromStepId: "step.tool.readTicket", toStepId: "step.decision.priority" }],
		steps: base.steps.filter((step) => step.id !== "step.finish.low" && step.id !== "step.finish.high"),
	};

	assert.throws(
		() => validateWorkflowDefinition(workflow),
		(error: unknown) => {
			assert.ok(error instanceof WorkflowValidationError);
			assert.ok(error.issues.some((issue) => issue.code === "missing_finish_step"));
			assert.ok(error.issues.some((issue) => issue.code === "invalid_default_branch_target"));
			assert.ok(error.issues.some((issue) => issue.code === "no_reachable_finish_step"));
			return true;
		},
	);
});
