export type NovaStatusSeverity = "green" | "yellow" | "red" | "unknown";

export type NovaStatusDomain = "agent" | "scheduler" | "diagnostics" | "dependencies" | "overall";

export type NovaStatusIssueCode =
	| "agent_blocked"
	| "agent_stalled"
	| "scheduler_heartbeat_down"
	| "scheduler_cron_down"
	| "scheduler_missed_runs"
	| "diagnostics_core_failed"
	| "diagnostics_extended_failed"
	| "dependency_unavailable"
	| "collector_timeout"
	| "collector_failed"
	| "unknown_state";

export interface NovaStatusIssue {
	readonly code: NovaStatusIssueCode | (string & {});
	readonly domain: NovaStatusDomain;
	readonly severity: NovaStatusSeverity;
	readonly message: string;
	readonly source?: string;
	readonly timestamp?: string;
}

export interface AgentStatus {
	readonly severity: NovaStatusSeverity;
	readonly state: "idle" | "working" | "blocked" | "unknown";
	readonly activeRunId?: string;
	readonly message?: string;
}

export interface SchedulerStatus {
	readonly severity: NovaStatusSeverity;
	readonly heartbeatRunning: boolean;
	readonly cronRunning: boolean;
	readonly missedRuns: number;
	readonly lastSuccessAt?: string;
	readonly nextRunAt?: string;
	readonly message?: string;
}

export interface DiagnosticsStatus {
	readonly severity: NovaStatusSeverity;
	readonly internalChecks: "green" | "yellow" | "red" | "unknown";
	readonly extendedChecks: "green" | "yellow" | "red" | "unknown";
	readonly message?: string;
}

export interface DependencyStatus {
	readonly severity: NovaStatusSeverity;
	readonly orchestrationCore: NovaStatusSeverity;
	readonly workflowSkills: NovaStatusSeverity;
	readonly memoryCore: NovaStatusSeverity;
	readonly connectorSkills: NovaStatusSeverity;
	readonly message?: string;
}

export interface NovaStatusSnapshot {
	readonly generatedAt: string;
	readonly overall: NovaStatusSeverity;
	readonly agent: AgentStatus;
	readonly scheduler: SchedulerStatus;
	readonly diagnostics: DiagnosticsStatus;
	readonly dependencies: DependencyStatus;
	readonly issues: readonly NovaStatusIssue[];
	readonly notes?: readonly string[];
}

export interface NovaStatusCollectorOptions {
	readonly timeoutMs?: number;
	readonly now?: () => Date;
}

export interface NovaStatusCollectorResult<TPayload> {
	readonly domain: NovaStatusDomain;
	readonly payload: TPayload;
	readonly issues: readonly NovaStatusIssue[];
	readonly latencyMs: number;
	readonly timedOut: boolean;
}

export type NovaStatusCollector<TPayload> = (
	options?: NovaStatusCollectorOptions,
) => Promise<NovaStatusCollectorResult<TPayload>>;
