# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Phase 0 package skeleton for `@topaca/workflow-skills`.
- Initial RFC (`RFC-WORKFLOW-001.md`) for workflow runtime scope and architecture.
- Public phase marker export (`WORKFLOW_SKILLS_PHASE`).
- Phase 1 domain contracts (`WorkflowDefinition`, step/edge/condition types).
- Typed validation issue/error model (`WorkflowValidationIssue`, `WorkflowValidationError`).
- Deterministic workflow definition validator with topology and transition checks.
- Validator test suite for valid and invalid workflow definitions.
- Phase 2 run and step lifecycle state machine with transition guards.
- Core executor runtime (`executeWorkflow`) with deterministic step scheduling.
- Retry envelope support for step execution (`maxRetries` + bounded backoff).
- Timeout and cancellation propagation through workflow execution options.
- Executor tests for success path, retry, timeout, cancellation, and decision-next-step failure.
- Phase 3 dispatcher layer for `tool`, `decision`, `memory`, `transform`, and `finish` steps.
- Default dispatcher-based step handler factory (`createDefaultStepHandler`).
- Convenience execution API using dispatchers (`executeWorkflowWithDispatchers`).
- Dispatcher tests and executor+dispatcher integration tests.
- Phase 4 persistence contract (`WorkflowStore`) with in-memory implementation (`InMemoryWorkflowStore`).
- Phase 4 event sink contract (`WorkflowEventSink`) with in-memory implementation (`InMemoryWorkflowEventSink`).
- Runtime helper (`executeWorkflowRuntime`) that combines execution, optional persistence, and ordered event publishing.
- Store, events, and runtime integration tests for snapshot and event flow.
- Phase 5 orchestration bridge for schedule-driven workflow execution (`orchestration-bridge`).
- Workflow-to-job mapping helpers (`createWorkflowScheduleJobDefinition`, `createWorkflowJobId`, `parseWorkflowJobId`).
- Scheduled registration and handler bridge (`registerScheduledWorkflow`, `createScheduledWorkflowJobHandler`).
- Run intent mapping (`createWorkflowRunIntent`) for orchestration context propagation.
- Cron and heartbeat compatibility tests for orchestration bridge registration/execution flow.
- Phase 6 safety policy model (`WorkflowSafetyPolicy`) with tool action allow/deny rules.
- Executor runtime guard for `maxRuntimeMs` and typed runtime exceed errors.
- Payload budget enforcement for input, per-step input/output, aggregate step outputs, and final output.
- Typed safety errors (`WorkflowPolicyDeniedError`, `WorkflowMaxRuntimeExceededError`, `WorkflowPayloadBudgetExceededError`).
- Safety test suite for policy denials, runtime limits, and payload-budget failures.
- Phase 7 observability module with aggregate metrics snapshots from run results/snapshots.
- Health diagnostics API (`getWorkflowHealthSnapshot`) combining store, sink, and metrics state.
- Structured workflow failure context API (`getWorkflowFailureContext`) for machine-readable incident analysis.
- Event sink health endpoint for in-memory diagnostics (`InMemoryWorkflowEventSink.health()`).
- Observability test suite for metrics, health snapshots, and failure-context extraction.
