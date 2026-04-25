export type {
	JobDefinition,
	JobId,
	OrchestrationEvent,
	RetryPolicy,
	RunRecord,
	RunStatus,
	Trigger,
} from "./types.js";
export {
	canTransitionRunStatus,
	InvalidRunTransitionError,
	isTerminalStatus,
	transitionRunRecordStatus,
} from "./state-machine.js";
export { getNextRunAt, InvalidTriggerError, SchedulerRangeError, validateTrigger } from "./scheduler.js";
export { JobRunCanceledError, JobRunTimeoutError, runJob } from "./runner.js";
export type { JobHandler, JobRunContext, RunJobOptions, RunJobResult } from "./runner.js";
export { createInMemoryOrchestrationStore, InMemoryOrchestrationStore } from "./store.js";
export type { OrchestrationStore, RunRetentionPolicy, StoreStats, StoreStatsOptions } from "./store.js";
export { createSqliteOrchestrationStore, SqliteOrchestrationStore } from "./store.sqlite.js";
export type { SqliteCompactionHistoryEntry, SqliteOrchestrationStoreOptions } from "./store.sqlite.js";
export { InMemoryOrchestrationDeadLetterSink, InMemoryOrchestrationEventSink } from "./events.js";
export type {
	EventSinkDeadLetterEntry,
	InMemoryDeadLetterSinkOptions,
	InMemoryEventSinkOptions,
	InMemoryEventSnapshotOptions,
	OrchestrationDeadLetterSink,
	OrchestrationEventSink,
	OrchestrationEventSubscriber,
	ReplayableDeadLetterSink,
} from "./events.js";
export {
	GlobalConcurrencyLimitExceededError,
	JobAlreadyRunningError,
	JobHandlerNotRegisteredError,
	JobNotFoundError,
} from "./errors.js";
export { Orchestrator } from "./orchestrator.js";
export type {
	DeadLetterReplayOptions,
	DeadLetterReplaySummary,
	EventSinkPolicyOptions,
	OrchestratorHealth,
	OrchestratorMetrics,
	OrchestratorOptions,
	OrchestrationEventListener,
	RunNowOptions,
	StopOptions,
} from "./orchestrator.js";
export { RetentionCompactionWorker, runRetentionCompactionOnce } from "./retention-worker.js";
export type { RetentionCompactionSummary, RetentionCompactionWorkerOptions } from "./retention-worker.js";

export const ORCHESTRATION_CORE_PHASE = "phase-8" as const;

export function createOrchestrationCoreSkeleton(): { phase: typeof ORCHESTRATION_CORE_PHASE } {
	return {
		phase: ORCHESTRATION_CORE_PHASE,
	};
}
