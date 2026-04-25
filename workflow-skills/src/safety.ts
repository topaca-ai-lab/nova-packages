export interface WorkflowToolActionPolicyRule {
	readonly allowActions?: readonly string[];
	readonly denyActions?: readonly string[];
}

export interface WorkflowSafetyPolicy {
	readonly maxRuntimeMs?: number;
	readonly toolActions?: WorkflowToolActionPolicyRule & {
		readonly stepRules?: Readonly<Record<string, WorkflowToolActionPolicyRule>>;
	};
	readonly budgets?: {
		readonly maxInitialInputBytes?: number;
		readonly maxStepInputBytes?: number;
		readonly maxStepOutputBytes?: number;
		readonly maxStoredStepOutputsBytes?: number;
		readonly maxFinalOutputBytes?: number;
	};
}

export interface WorkflowToolActionPolicyResult {
	readonly allowed: boolean;
	readonly reason?: string;
}

export function evaluateToolActionPolicy(
	policy: WorkflowSafetyPolicy | undefined,
	stepId: string,
	actionKey: string,
): WorkflowToolActionPolicyResult {
	const rules = policy?.toolActions;
	if (rules === undefined) {
		return { allowed: true };
	}

	const stepRule = rules.stepRules?.[stepId];

	if (includes(stepRule?.denyActions, actionKey) || includes(rules.denyActions, actionKey)) {
		return {
			allowed: false,
			reason: `Action "${actionKey}" is denied for step "${stepId}".`,
		};
	}

	if (stepRule?.allowActions !== undefined && stepRule.allowActions.length > 0) {
		if (!includes(stepRule.allowActions, actionKey)) {
			return {
				allowed: false,
				reason: `Action "${actionKey}" is not in allowActions for step "${stepId}".`,
			};
		}
	}

	if (rules.allowActions !== undefined && rules.allowActions.length > 0) {
		if (!includes(rules.allowActions, actionKey)) {
			return {
				allowed: false,
				reason: `Action "${actionKey}" is not in global allowActions policy.`,
			};
		}
	}

	return { allowed: true };
}

export function estimatePayloadBytes(value: unknown): number {
	try {
		const serialized = JSON.stringify(value);
		if (serialized === undefined) {
			return 0;
		}
		return Buffer.byteLength(serialized, "utf8");
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

function includes(values: readonly string[] | undefined, target: string): boolean {
	return values !== undefined && values.includes(target);
}
