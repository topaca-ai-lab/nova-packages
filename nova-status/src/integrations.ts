import type {
	AgentStatus,
	DependencyStatus,
	DiagnosticsStatus,
	NovaStatusIssue,
	NovaStatusSeverity,
	SchedulerStatus,
} from "./types.js";

export interface SchedulerSignals {
	readonly heartbeatConfigured: boolean;
	readonly heartbeatRunning: boolean;
	readonly cronConfigured: boolean;
	readonly cronRunning: boolean;
	readonly missedRuns: number;
	readonly lastSuccessAt?: string;
	readonly nextRunAt?: string;
	readonly message?: string;
}

export interface SchedulerIntegrationResult {
	readonly status: SchedulerStatus;
	readonly issues: readonly NovaStatusIssue[];
}

export interface DiagnosticProbeResult {
	readonly id: string;
	readonly scope: "internal" | "extended";
	readonly ok: boolean;
	readonly message?: string;
	readonly backend?: string;
	readonly severity?: Exclude<NovaStatusSeverity, "unknown">;
}

export interface DiagnosticsIntegrationResult {
	readonly status: DiagnosticsStatus;
	readonly issues: readonly NovaStatusIssue[];
}

export interface DependencySignals {
	readonly orchestrationCore: boolean | NovaStatusSeverity;
	readonly workflowSkills: boolean | NovaStatusSeverity;
	readonly memoryCore: boolean | NovaStatusSeverity;
	readonly connectorSkills: boolean | NovaStatusSeverity;
	readonly message?: string;
}

export interface DependencyIntegrationResult {
	readonly status: DependencyStatus;
	readonly issues: readonly NovaStatusIssue[];
}

export function mapSchedulerSignalsToStatus(signals: SchedulerSignals): SchedulerIntegrationResult {
	const severeMissedRuns = signals.missedRuns >= 5;
	const partialMissedRuns = signals.missedRuns > 0;
	const heartbeatDown = signals.heartbeatConfigured && !signals.heartbeatRunning;
	const cronDown = signals.cronConfigured && !signals.cronRunning;

	let severity: NovaStatusSeverity = "green";
	if (severeMissedRuns) {
		severity = "red";
	} else if (heartbeatDown || cronDown || partialMissedRuns) {
		severity = "yellow";
	}

	const status: SchedulerStatus = {
		severity,
		heartbeatRunning: signals.heartbeatRunning,
		cronRunning: signals.cronRunning,
		missedRuns: Math.max(0, signals.missedRuns),
		lastSuccessAt: signals.lastSuccessAt,
		nextRunAt: signals.nextRunAt,
		message: signals.message,
	};

	return {
		status,
		issues: deriveIssuesFromSchedulerStatus(status),
	};
}

export function mapDiagnosticProbesToStatus(probes: readonly DiagnosticProbeResult[]): DiagnosticsIntegrationResult {
	const internal = probes.filter((probe) => probe.scope === "internal");
	const extended = probes.filter((probe) => probe.scope === "extended");

	const internalChecks = reduceProbeScopeSeverity(internal, "internal");
	const extendedChecks = reduceProbeScopeSeverity(extended, "extended");
	const severity = maxSeverity(internalChecks, extendedChecks);

	const status: DiagnosticsStatus = {
		severity,
		internalChecks,
		extendedChecks,
		message: probes.length === 0 ? "No diagnostic probes were reported." : undefined,
	};

	return {
		status,
		issues: deriveIssuesFromDiagnosticsStatus(status, probes),
	};
}

export function mapDependencySignalsToStatus(signals: DependencySignals): DependencyIntegrationResult {
	const orchestrationCore = toSeverity(signals.orchestrationCore);
	const workflowSkills = toSeverity(signals.workflowSkills);
	const memoryCore = toSeverity(signals.memoryCore);
	const connectorSkills = toSeverity(signals.connectorSkills);
	const severity = maxSeverity(orchestrationCore, workflowSkills, memoryCore, connectorSkills);

	const status: DependencyStatus = {
		severity,
		orchestrationCore,
		workflowSkills,
		memoryCore,
		connectorSkills,
		message: signals.message,
	};

	return {
		status,
		issues: deriveIssuesFromDependencyStatus(status),
	};
}

export function deriveIssuesFromAgentStatus(status: AgentStatus): readonly NovaStatusIssue[] {
	if (status.state === "blocked") {
		return [
			{
				code: "agent_blocked",
				domain: "agent",
				severity: status.severity === "red" ? "red" : "yellow",
				message: status.message ?? "Agent is blocked and needs operator intervention.",
			},
		];
	}
	if (status.state === "unknown" || status.severity === "unknown") {
		return [
			{
				code: "unknown_state",
				domain: "agent",
				severity: "unknown",
				message: status.message ?? "Agent state is unknown.",
			},
		];
	}
	return [];
}

export function deriveIssuesFromSchedulerStatus(status: SchedulerStatus): readonly NovaStatusIssue[] {
	const issues: NovaStatusIssue[] = [];
	if (!status.heartbeatRunning) {
		issues.push({
			code: "scheduler_heartbeat_down",
			domain: "scheduler",
			severity: status.severity === "red" ? "red" : "yellow",
			message: "Heartbeat scheduler is not running.",
		});
	}
	if (!status.cronRunning) {
		issues.push({
			code: "scheduler_cron_down",
			domain: "scheduler",
			severity: status.severity === "red" ? "red" : "yellow",
			message: "Cron scheduler is not running.",
		});
	}
	if (status.missedRuns > 0) {
		issues.push({
			code: "scheduler_missed_runs",
			domain: "scheduler",
			severity: status.missedRuns >= 5 ? "red" : "yellow",
			message: `Scheduler missed runs detected: ${status.missedRuns}.`,
		});
	}
	if (status.severity === "unknown") {
		issues.push({
			code: "unknown_state",
			domain: "scheduler",
			severity: "unknown",
			message: status.message ?? "Scheduler state is unknown.",
		});
	}
	return issues;
}

export function deriveIssuesFromDiagnosticsStatus(
	status: DiagnosticsStatus,
	probes: readonly DiagnosticProbeResult[] = [],
): readonly NovaStatusIssue[] {
	const issues: NovaStatusIssue[] = [];
	for (const probe of probes) {
		if (probe.ok) {
			continue;
		}
		issues.push({
			code: probe.scope === "internal" ? "diagnostics_core_failed" : "diagnostics_extended_failed",
			domain: "diagnostics",
			severity: probe.severity ?? (probe.scope === "internal" ? "red" : "yellow"),
			message:
				probe.message ??
				`Diagnostic probe failed: ${probe.id}${probe.backend ? ` (${probe.backend})` : ""}.`,
			source: probe.backend,
		});
	}

	if (issues.length === 0 && status.severity === "unknown") {
		issues.push({
			code: "unknown_state",
			domain: "diagnostics",
			severity: "unknown",
			message: status.message ?? "Diagnostics state is unknown.",
		});
	}

	return issues;
}

export function deriveIssuesFromDependencyStatus(status: DependencyStatus): readonly NovaStatusIssue[] {
	const issues: NovaStatusIssue[] = [];
	const entries: Array<readonly [string, NovaStatusSeverity]> = [
		["orchestration-core", status.orchestrationCore],
		["workflow-skills", status.workflowSkills],
		["memory-core", status.memoryCore],
		["connector-skills", status.connectorSkills],
	];

	for (const [component, severity] of entries) {
		if (severity === "green") {
			continue;
		}
		issues.push({
			code: severity === "unknown" ? "unknown_state" : "dependency_unavailable",
			domain: "dependencies",
			severity: severity === "unknown" ? "unknown" : severity,
			message: `Dependency ${component} is ${severity}.`,
			source: component,
		});
	}

	return issues;
}

function reduceProbeScopeSeverity(
	probes: readonly DiagnosticProbeResult[],
	scope: DiagnosticProbeResult["scope"],
): NovaStatusSeverity {
	if (probes.length === 0) {
		return "unknown";
	}

	const failed = probes.filter((probe) => !probe.ok);
	if (failed.length === 0) {
		return "green";
	}

	if (failed.some((probe) => (probe.severity ?? defaultProbeFailureSeverity(scope)) === "red")) {
		return "red";
	}
	return "yellow";
}

function defaultProbeFailureSeverity(scope: DiagnosticProbeResult["scope"]): Exclude<NovaStatusSeverity, "unknown"> {
	return scope === "internal" ? "red" : "yellow";
}

function toSeverity(value: boolean | NovaStatusSeverity): NovaStatusSeverity {
	if (typeof value === "boolean") {
		return value ? "green" : "red";
	}
	return value;
}

function maxSeverity(...values: readonly NovaStatusSeverity[]): NovaStatusSeverity {
	const priority: Record<NovaStatusSeverity, number> = {
		green: 1,
		unknown: 2,
		yellow: 3,
		red: 4,
	};

	let selected: NovaStatusSeverity = "green";
	for (const value of values) {
		if (priority[value] > priority[selected]) {
			selected = value;
		}
	}
	return selected;
}
