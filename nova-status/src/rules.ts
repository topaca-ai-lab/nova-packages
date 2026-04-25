import type {
	AgentStatus,
	DependencyStatus,
	DiagnosticsStatus,
	NovaStatusIssue,
	NovaStatusSeverity,
	NovaStatusSnapshot,
	SchedulerStatus,
} from "./types.js";

export interface NovaStatusDomainSet {
	readonly agent: AgentStatus;
	readonly scheduler: SchedulerStatus;
	readonly diagnostics: DiagnosticsStatus;
	readonly dependencies: DependencyStatus;
}

export interface EvaluateNovaStatusInput extends NovaStatusDomainSet {
	readonly issues?: readonly NovaStatusIssue[];
	readonly notes?: readonly string[];
	readonly now?: () => Date;
}

export interface EvaluateNovaStatusResult {
	readonly overall: NovaStatusSeverity;
	readonly issues: readonly NovaStatusIssue[];
	readonly counts: Record<NovaStatusSeverity, number>;
	readonly reasons: readonly string[];
}

const SEVERITY_PRIORITY: Record<NovaStatusSeverity, number> = {
	red: 4,
	yellow: 3,
	unknown: 2,
	green: 1,
};

const ISSUE_SORT_PRIORITY: Record<NovaStatusSeverity, number> = {
	red: 1,
	yellow: 2,
	unknown: 3,
	green: 4,
};

const DOMAIN_SORT_PRIORITY: Record<NovaStatusIssue["domain"], number> = {
	overall: 1,
	agent: 2,
	scheduler: 3,
	diagnostics: 4,
	dependencies: 5,
};

export function evaluateNovaStatus(input: EvaluateNovaStatusInput): EvaluateNovaStatusResult {
	const domainSeverities: readonly NovaStatusSeverity[] = [
		input.agent.severity,
		input.scheduler.severity,
		input.diagnostics.severity,
		input.dependencies.severity,
	];
	const issues = sortIssuesDeterministically(input.issues ?? []);
	const issueSeverities = issues.map((issue) => issue.severity);
	const combinedSeverities = [...domainSeverities, ...issueSeverities];
	const counts = countSeverities(combinedSeverities);

	const overall = determineOverallSeverity(combinedSeverities);
	const reasons = buildReasons(domainSeverities, issues, overall);

	return {
		overall,
		issues,
		counts,
		reasons,
	};
}

export function buildNovaStatusSnapshot(input: EvaluateNovaStatusInput): NovaStatusSnapshot {
	const now = input.now ?? (() => new Date());
	const evaluation = evaluateNovaStatus(input);

	return {
		generatedAt: now().toISOString(),
		overall: evaluation.overall,
		agent: input.agent,
		scheduler: input.scheduler,
		diagnostics: input.diagnostics,
		dependencies: input.dependencies,
		issues: evaluation.issues,
		notes: input.notes,
	};
}

export function determineOverallSeverity(severities: readonly NovaStatusSeverity[]): NovaStatusSeverity {
	if (severities.length === 0) {
		return "unknown";
	}

	let highest: NovaStatusSeverity = "green";
	for (const severity of severities) {
		if (SEVERITY_PRIORITY[severity] > SEVERITY_PRIORITY[highest]) {
			highest = severity;
		}
	}

	if (highest === "unknown") {
		return "yellow";
	}
	return highest;
}

export function countSeverities(severities: readonly NovaStatusSeverity[]): Record<NovaStatusSeverity, number> {
	const counts: Record<NovaStatusSeverity, number> = {
		green: 0,
		yellow: 0,
		red: 0,
		unknown: 0,
	};
	for (const severity of severities) {
		counts[severity] += 1;
	}
	return counts;
}

function sortIssuesDeterministically(issues: readonly NovaStatusIssue[]): readonly NovaStatusIssue[] {
	return [...issues].sort((left, right) => {
		const severityDiff = ISSUE_SORT_PRIORITY[left.severity] - ISSUE_SORT_PRIORITY[right.severity];
		if (severityDiff !== 0) {
			return severityDiff;
		}

		const domainDiff = DOMAIN_SORT_PRIORITY[left.domain] - DOMAIN_SORT_PRIORITY[right.domain];
		if (domainDiff !== 0) {
			return domainDiff;
		}

		const codeDiff = left.code.localeCompare(right.code);
		if (codeDiff !== 0) {
			return codeDiff;
		}

		return left.message.localeCompare(right.message);
	});
}

function buildReasons(
	domainSeverities: readonly NovaStatusSeverity[],
	issues: readonly NovaStatusIssue[],
	overall: NovaStatusSeverity,
): readonly string[] {
	if (overall === "green") {
		return ["All required status domains are green and no degrading issues are present."];
	}

	const reasons: string[] = [];
	if (domainSeverities.includes("red")) {
		reasons.push("At least one primary status domain is red.");
	}
	if (issues.some((issue) => issue.severity === "red")) {
		reasons.push("At least one status issue is red.");
	}
	if (domainSeverities.includes("yellow") || issues.some((issue) => issue.severity === "yellow")) {
		reasons.push("At least one status domain or issue is yellow.");
	}
	if (domainSeverities.includes("unknown") || issues.some((issue) => issue.severity === "unknown")) {
		reasons.push("Unknown status signals were detected and treated as degraded health.");
	}
	if (reasons.length === 0) {
		reasons.push("Status is degraded by deterministic policy.");
	}
	return reasons;
}
