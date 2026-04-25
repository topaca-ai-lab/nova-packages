# workflow-skills

`@topaca/workflow-skills` is the declarative workflow layer for Nova/Edgent.

Current status:

- maturity marker: `phase-7`
- phase scope: typed workflow contracts, deterministic validation, state machine, executor core, step dispatchers, persistence, eventing, orchestration bridge integration, safety policy enforcement, and observability diagnostics

## Package Scope (planned)

- typed workflow definitions and validation
- deterministic step execution runtime
- integration hooks for `orchestration-core`, `connector-skills`, and `memory-core`
- workflow run snapshots and event telemetry

## Exported in Phase 7

- workflow domain contracts (`WorkflowDefinition`, step unions, edges, conditions)
- validation API (`validateWorkflowDefinition`, `getWorkflowValidationIssues`)
- typed validation error model (`WorkflowValidationError` + issue codes)
- run/step state machine transitions and guardrails
- executor runtime (`executeWorkflow`) with retry, timeout, and cancellation support
- dispatcher runtime (`createDefaultStepHandler`) for `tool`, `decision`, `memory`, `transform`, `finish`
- convenience API: `executeWorkflowWithDispatchers(...)`
- persistence contracts and in-memory adapter (`WorkflowStore`, `InMemoryWorkflowStore`)
- event sink contracts and in-memory adapter (`WorkflowEventSink`, `InMemoryWorkflowEventSink`)
- runtime orchestration helper with snapshot/event integration (`executeWorkflowRuntime(...)`)
- orchestration bridge helpers for scheduled runs (`registerScheduledWorkflow`, job-id/run-intent mapping, cron/heartbeat compatible job definitions)
- safety policy model (`WorkflowSafetyPolicy`) with:
  - tool action allow/deny policies (global + per-step)
  - runtime guard (`maxRuntimeMs`)
  - payload budgets (`maxInitialInputBytes`, `maxStepInputBytes`, `maxStepOutputBytes`, `maxStoredStepOutputsBytes`, `maxFinalOutputBytes`)
- observability diagnostics:
  - metrics snapshots (`computeWorkflowMetrics`, `computeWorkflowMetricsFromSnapshots`)
  - health snapshots (`getWorkflowHealthSnapshot`)
  - structured failure context (`getWorkflowFailureContext`)

## Install

```bash
npm install @topaca/workflow-skills
```

## Development

```bash
npm run check
```
