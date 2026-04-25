import {
	type DecisionWorkflowStep,
	type WorkflowConditionOperator,
	type WorkflowDefinition,
	type WorkflowStep,
} from "./types.js";
import { type WorkflowValidationIssue, WorkflowValidationError } from "./errors.js";

const SUPPORTED_OPERATORS: readonly WorkflowConditionOperator[] = [
	"eq",
	"neq",
	"gt",
	"gte",
	"lt",
	"lte",
	"exists",
	"not_exists",
	"contains",
] as const;

export function getWorkflowValidationIssues(definition: WorkflowDefinition): WorkflowValidationIssue[] {
	const issues: WorkflowValidationIssue[] = [];

	if (!Number.isInteger(definition.schemaVersion) || definition.schemaVersion <= 0) {
		issues.push({
			code: "invalid_schema_version",
			message: "schemaVersion must be a positive integer.",
			fieldPath: "schemaVersion",
		});
	}

	if (definition.steps.length === 0) {
		issues.push({
			code: "missing_steps",
			message: "Workflow must contain at least one step.",
			fieldPath: "steps",
		});
		return issues;
	}

	const stepIds = new Set<string>();
	const duplicateStepIds = new Set<string>();

	for (const [index, step] of definition.steps.entries()) {
		if (stepIds.has(step.id)) {
			duplicateStepIds.add(step.id);
			issues.push({
				code: "duplicate_step_id",
				message: `Duplicate step id: "${step.id}".`,
				fieldPath: `steps[${index}].id`,
			});
		} else {
			stepIds.add(step.id);
		}

		validateStepRuntimeFields(step, issues, index);
	}

	if (!stepIds.has(definition.entryStepId)) {
		issues.push({
			code: "unknown_entry_step",
			message: `entryStepId "${definition.entryStepId}" does not reference an existing step.`,
			fieldPath: "entryStepId",
		});
	}

	const finishSteps = definition.steps.filter((step) => step.kind === "finish");
	if (finishSteps.length === 0) {
		issues.push({
			code: "missing_finish_step",
			message: "Workflow must contain at least one finish step.",
			fieldPath: "steps",
		});
	}

	const adjacency = new Map<string, string[]>();
	for (const step of definition.steps) {
		adjacency.set(step.id, []);
	}

	const seenEdges = new Set<string>();
	const graphEdgeOutCounts = new Map<string, number>();

	for (const [index, edge] of definition.edges.entries()) {
		const edgeKey = `${edge.fromStepId}->${edge.toStepId}`;
		if (seenEdges.has(edgeKey)) {
			issues.push({
				code: "duplicate_edge",
				message: `Duplicate edge "${edgeKey}".`,
				fieldPath: `edges[${index}]`,
			});
		} else {
			seenEdges.add(edgeKey);
		}

		if (!stepIds.has(edge.fromStepId) || !stepIds.has(edge.toStepId)) {
			issues.push({
				code: "invalid_edge_reference",
				message: `Edge "${edgeKey}" references unknown step id(s).`,
				fieldPath: `edges[${index}]`,
			});
			continue;
		}

		adjacency.get(edge.fromStepId)?.push(edge.toStepId);
		graphEdgeOutCounts.set(edge.fromStepId, (graphEdgeOutCounts.get(edge.fromStepId) ?? 0) + 1);
	}

	for (const [stepIndex, step] of definition.steps.entries()) {
		const graphOutCount = graphEdgeOutCounts.get(step.id) ?? 0;

		if (step.kind === "finish" && graphOutCount > 0) {
			issues.push({
				code: "finish_step_has_outgoing_transition",
				message: `Finish step "${step.id}" must not have outgoing transitions.`,
				fieldPath: `steps[${stepIndex}]`,
			});
		}

		if (step.kind === "decision") {
			validateDecisionStep(step, issues, stepIndex, stepIds, adjacency);
			if (graphOutCount > 0) {
				issues.push({
					code: "decision_has_graph_edge",
					message: `Decision step "${step.id}" must define transitions via branches, not edges.`,
					fieldPath: `steps[${stepIndex}]`,
				});
			}
			continue;
		}

		if (step.kind !== "finish") {
			if (graphOutCount === 0) {
				issues.push({
					code: "step_missing_outgoing_transition",
					message: `Step "${step.id}" requires exactly one outgoing edge.`,
					fieldPath: `steps[${stepIndex}]`,
				});
			}
			if (graphOutCount > 1) {
				issues.push({
					code: "step_has_multiple_outgoing_transitions",
					message: `Step "${step.id}" must have at most one outgoing edge.`,
					fieldPath: `steps[${stepIndex}]`,
				});
			}
		}
	}

	if (issues.some((issue) => issue.code === "invalid_edge_reference" || issue.code === "duplicate_step_id")) {
		return issues;
	}

	if (containsCycle(adjacency)) {
		issues.push({
			code: "workflow_cycle_detected",
			message: "Workflow graph must be acyclic in phase-1.",
			fieldPath: "edges",
		});
	}

	const reachable = getReachableSteps(definition.entryStepId, adjacency);
	let reachableFinishCount = 0;
	for (const step of definition.steps) {
		if (!reachable.has(step.id)) {
			issues.push({
				code: "unreachable_step",
				message: `Step "${step.id}" is unreachable from entryStepId.`,
				fieldPath: "steps",
			});
		}
		if (step.kind === "finish" && reachable.has(step.id)) {
			reachableFinishCount += 1;
		}
	}

	if (reachableFinishCount === 0) {
		issues.push({
			code: "no_reachable_finish_step",
			message: "No reachable finish step found from entryStepId.",
			fieldPath: "entryStepId",
		});
	}

	return issues;
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): void {
	const issues = getWorkflowValidationIssues(definition);
	if (issues.length > 0) {
		throw new WorkflowValidationError(issues);
	}
}

function validateStepRuntimeFields(step: WorkflowStep, issues: WorkflowValidationIssue[], index: number): void {
		if (step.timeoutMs !== undefined) {
			if (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0) {
				issues.push({
					code: "invalid_timeout",
					message: `Step "${step.id}" timeoutMs must be a positive integer when defined.`,
					fieldPath: `steps[${index}].timeoutMs`,
				});
			}
		}

		if (step.maxRetries !== undefined) {
			if (!Number.isInteger(step.maxRetries) || step.maxRetries < 0) {
				issues.push({
					code: "invalid_max_retries",
					message: `Step "${step.id}" maxRetries must be a non-negative integer when defined.`,
					fieldPath: `steps[${index}].maxRetries`,
				});
			}
		}
}

function validateDecisionStep(
	step: DecisionWorkflowStep,
	issues: WorkflowValidationIssue[],
	stepIndex: number,
	stepIds: Set<string>,
	adjacency: Map<string, string[]>,
): void {
	if (step.branches.length === 0) {
		issues.push({
			code: "decision_missing_branches",
			message: `Decision step "${step.id}" must define at least one branch.`,
			fieldPath: `steps[${stepIndex}].branches`,
		});
		return;
	}

	const branchIds = new Set<string>();
	for (const [branchIndex, branch] of step.branches.entries()) {
		if (branchIds.has(branch.id)) {
			issues.push({
				code: "duplicate_branch_id",
				message: `Decision step "${step.id}" has duplicate branch id "${branch.id}".`,
				fieldPath: `steps[${stepIndex}].branches[${branchIndex}].id`,
			});
		} else {
			branchIds.add(branch.id);
		}

		if (!stepIds.has(branch.targetStepId)) {
			issues.push({
				code: "invalid_branch_target",
				message: `Branch "${branch.id}" in step "${step.id}" targets unknown step "${branch.targetStepId}".`,
				fieldPath: `steps[${stepIndex}].branches[${branchIndex}].targetStepId`,
			});
		} else {
			adjacency.get(step.id)?.push(branch.targetStepId);
		}

		if (branch.condition.path.trim().length === 0) {
			issues.push({
				code: "invalid_condition_path",
				message: `Branch "${branch.id}" in step "${step.id}" must define a non-empty condition path.`,
				fieldPath: `steps[${stepIndex}].branches[${branchIndex}].condition.path`,
			});
		}

		if (!SUPPORTED_OPERATORS.includes(branch.condition.operator)) {
			issues.push({
				code: "invalid_condition_operator",
				message: `Branch "${branch.id}" in step "${step.id}" uses unsupported condition operator "${branch.condition.operator}".`,
				fieldPath: `steps[${stepIndex}].branches[${branchIndex}].condition.operator`,
			});
		}
	}

	if (step.defaultTargetStepId !== undefined) {
		if (!stepIds.has(step.defaultTargetStepId)) {
			issues.push({
				code: "invalid_default_branch_target",
				message: `Decision step "${step.id}" defaultTargetStepId references unknown step "${step.defaultTargetStepId}".`,
				fieldPath: `steps[${stepIndex}].defaultTargetStepId`,
			});
		} else {
			adjacency.get(step.id)?.push(step.defaultTargetStepId);
		}
	}
}

function containsCycle(adjacency: Map<string, string[]>): boolean {
	const visiting = new Set<string>();
	const visited = new Set<string>();

	for (const nodeId of adjacency.keys()) {
		if (visit(nodeId, adjacency, visiting, visited)) {
			return true;
		}
	}
	return false;
}

function visit(
	nodeId: string,
	adjacency: Map<string, string[]>,
	visiting: Set<string>,
	visited: Set<string>,
): boolean {
	if (visited.has(nodeId)) {
		return false;
	}
	if (visiting.has(nodeId)) {
		return true;
	}

	visiting.add(nodeId);
	const outgoing = adjacency.get(nodeId) ?? [];
	for (const nextId of outgoing) {
		if (visit(nextId, adjacency, visiting, visited)) {
			return true;
		}
	}
	visiting.delete(nodeId);
	visited.add(nodeId);
	return false;
}

function getReachableSteps(entryStepId: string, adjacency: Map<string, string[]>): Set<string> {
	const reachable = new Set<string>();
	if (!adjacency.has(entryStepId)) {
		return reachable;
	}

	const queue: string[] = [entryStepId];
	reachable.add(entryStepId);

	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined) {
			break;
		}
		for (const next of adjacency.get(current) ?? []) {
			if (!reachable.has(next)) {
				reachable.add(next);
				queue.push(next);
			}
		}
	}

	return reachable;
}
