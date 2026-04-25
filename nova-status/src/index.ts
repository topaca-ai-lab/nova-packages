export type {
	AgentStatus,
	DependencyStatus,
	DiagnosticsStatus,
	NovaStatusCollector,
	NovaStatusCollectorOptions,
	NovaStatusCollectorResult,
	NovaStatusDomain,
	NovaStatusIssueCode,
	NovaStatusIssue,
	NovaStatusSeverity,
	NovaStatusSnapshot,
	SchedulerStatus,
} from "./types.js";
export type {
	CollectNovaStatusOptions,
	CreateFailingCollectorOptions,
	CreateStaticCollectorOptions,
	NovaStatusCollectors,
} from "./collectors.js";
export type { RenderNovaStatusTextOptions, NovaStatusTextMode } from "./renderers.js";
export type { NovaStatusWatchContract, NovaStatusWatchOptions } from "./watch.js";
export type { EvaluateNovaStatusInput, EvaluateNovaStatusResult, NovaStatusDomainSet } from "./rules.js";
export type {
	InMemoryNovaStatusSnapshotStoreOptions,
	NovaStatusSnapshotStore,
	NovaStatusSnapshotStoreHealth,
} from "./snapshot-store.js";
export type {
	DependencyIntegrationResult,
	DependencySignals,
	DiagnosticProbeResult,
	DiagnosticsIntegrationResult,
	SchedulerIntegrationResult,
	SchedulerSignals,
} from "./integrations.js";

export { collectNovaStatus, createFailingCollector, createStaticCollector } from "./collectors.js";
export {
	deriveIssuesFromAgentStatus,
	deriveIssuesFromDependencyStatus,
	deriveIssuesFromDiagnosticsStatus,
	deriveIssuesFromSchedulerStatus,
	mapDependencySignalsToStatus,
	mapDiagnosticProbesToStatus,
	mapSchedulerSignalsToStatus,
} from "./integrations.js";
export { renderNovaStatusJson, renderNovaStatusText } from "./renderers.js";
export { computeNextRefreshAt, computeRefreshDelay, createNovaStatusWatchContract } from "./watch.js";
export { createInMemoryNovaStatusSnapshotStore, InMemoryNovaStatusSnapshotStore } from "./snapshot-store.js";
export {
	buildNovaStatusSnapshot,
	countSeverities,
	determineOverallSeverity,
	evaluateNovaStatus,
} from "./rules.js";

export const NOVA_STATUS_PHASE = "phase-5" as const;

export function createNovaStatusSkeleton(): { phase: typeof NOVA_STATUS_PHASE } {
	return { phase: NOVA_STATUS_PHASE };
}
