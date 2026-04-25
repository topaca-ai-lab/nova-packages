# workflow-skills Plan

## Goal

Build `@topaca/workflow-skills` as the declarative workflow layer for Nova/Edgent.
The package should orchestrate multi-step agent workflows with typed contracts,
deterministic execution semantics, and local-first reliability on small models.

`workflow-skills` sits above:

- `@topaca/orchestration-core` (scheduling/run lifecycle)
- `@topaca/connector-skills` (tool connectors)
- `@topaca/memory-core` (state/memory integration)

---

## Scope for First Release (MVP)

- Typed workflow definition model (`workflow`, `step`, `edge`, `guard`, `retry`)
- Deterministic workflow executor (state machine + step dispatch)
- Built-in step kinds for practical automation:
  - `tool` (connector action invocation)
  - `decision` (branching by structured condition)
  - `memory` (read/write/query memory-core)
  - `transform` (schema-safe payload reshape)
  - `finish` (terminal output)
- Execution context model (input/state/vars/artifacts/errors)
- Minimal persistence abstraction for workflow run snapshots
- Event/telemetry stream for debugging and operations
- In-memory reference adapters and deterministic tests

---

## Non-Goals (MVP)

- Visual workflow editor/UI
- Distributed multi-node workflow locking
- Unbounded dynamic code execution
- Provider-specific prompt engineering framework
- Full BPMN compatibility

---

## Architecture

## 1) Core Modules

1. `types`
- Workflow contracts and discriminated unions for step kinds.

2. `validator`
- Structural and semantic workflow validation.
- Rejects invalid graph topology and unresolved references.

3. `state-machine`
- Defines valid run/step transitions and terminal semantics.

4. `executor`
- Drives step execution with retry, timeout, and cancellation behavior.

5. `dispatchers`
- Step-kind implementations (`tool`, `decision`, `memory`, `transform`, `finish`).

6. `store`
- Workflow definition and run snapshot interfaces.
- MVP adapter: in-memory.

7. `events`
- Typed lifecycle and diagnostics events.

## 2) Key Contracts

- `WorkflowDefinition`
- `WorkflowStep` (discriminated union by `kind`)
- `WorkflowEdge`
- `WorkflowGuard`
- `WorkflowRunRecord`
- `WorkflowStepResult`
- `WorkflowEvent`
- `WorkflowExecutionContext`

## 3) Public API Shape (initial)

- `registerWorkflow(definition)`
- `validateWorkflow(definition)`
- `startWorkflow(workflowId, input, options?)`
- `resumeWorkflow(runId)`
- `cancelWorkflow(runId)`
- `getWorkflow(workflowId)`
- `listWorkflows()`
- `getRun(runId)`
- `listRuns(workflowId?)`
- `onEvent(listener)`

---

## Delivery Phases

## Phase 0: Scope + RFC + Package Skeleton

### Deliverables

- `workflow-skills/` folder initialization
- `PLAN.md` (this file)
- `RFC-WORKFLOW-001.md` with terminology, constraints, and API draft
- package metadata (`package.json`, `tsconfig.build.json`, `src/index.ts`)

### Acceptance Criteria

- package compiles as type-only skeleton
- architecture boundaries to other core packages are documented
- non-goals and risk assumptions are explicit

Status: completed

## Phase 1: Domain Model + Validation

### Deliverables

- `src/types.ts` with workflow and step contracts
- `src/validator.ts` with static checks:
  - unique ids
  - acyclic graph validation (for MVP DAG mode)
  - reachable finish step
  - valid branch targets
  - schema references resolvable

### Acceptance Criteria

- invalid definitions fail with typed validation errors
- valid minimal workflows pass validation deterministically

Status: completed

## Phase 2: State Machine + Executor Core

### Deliverables

- run lifecycle model (`queued -> running -> succeeded|failed|canceled`)
- per-step lifecycle and retry envelope
- timeout/cancel propagation
- deterministic step scheduling order

### Acceptance Criteria

- no invalid transition possible through public API
- retry and cancel behavior covered by tests
- deterministic execution for same input + same workflow definition

Status: completed

## Phase 3: Step Dispatchers (MVP Set)

### Deliverables

- `tool` dispatcher: invoke `connector-skills` action envelope
- `decision` dispatcher: evaluate typed guard expression
- `memory` dispatcher: scoped read/write/query via `memory-core`
- `transform` dispatcher: safe payload mapping without dynamic eval
- `finish` dispatcher: final response shaping

### Acceptance Criteria

- each dispatcher has contract tests + failure mapping tests
- connector and memory failures map to typed workflow errors
- branch behavior is stable and traceable via events

Status: completed

## Phase 4: Persistence + Eventing

### Deliverables

- `WorkflowStore` interface
- `InMemoryWorkflowStore` adapter
- event sink interface + in-memory sink
- run snapshots and step traces

### Acceptance Criteria

- run replay/debug data available for every execution
- store/event adapter contract tests pass
- event ordering guarantees documented

Status: completed

## Phase 5: Orchestration Integration

### Deliverables

- integration bridge to `orchestration-core` for scheduled workflow runs
- mapping between job ids and workflow run intents
- heartbeat/cron compatibility tests

### Acceptance Criteria

- scheduled workflow triggers execute through same executor path as runNow
- cancellation and retries remain consistent with orchestrator semantics

Status: completed

## Phase 6: Safety + Policy + Local-Model Hardening

### Deliverables

- action allowlist/denylist at workflow and step scope
- max-step-count / max-runtime safety limits
- strict schema budgets for step inputs/outputs
- guardrails against context blowup (artifact size limits)

### Acceptance Criteria

- hard limits enforced with typed errors
- safety policy decisions are observable in events
- edge-model baseline scenarios remain stable

Status: completed

## Phase 7: Observability + Diagnostics

### Deliverables

- metrics snapshot (`runCount`, `failureRate`, `avgStepLatency`, ...)
- health API (`getHealthSnapshot()`)
- debug traces and structured failure context

### Acceptance Criteria

- machine-readable diagnostics for operational tooling
- no silent failures in dispatcher/store/event pathways

Status: completed

## Phase 8: Packaging + Release

### Deliverables

- `README.md`, `CHANGELOG.md`, `RELEASING.md`
- npm publish under `@topaca/workflow-skills`
- documentation page in `Nova-Dokumentation/packages/workflow-skills.md`

### Acceptance Criteria

- license metadata is `AGPL-3.0-only`
- package passes `npm run check`
- first published version tagged and documented

Status: in progress (implementation and documentation completed; publish/tag pending)

---

## Testing Strategy

- unit tests per module (`validator`, `state-machine`, `executor`, dispatchers)
- deterministic workflow fixtures for regression stability
- adapter contract tests for store and event sink
- integration tests:
  - workflow + connector mock adapters
  - workflow + memory-core
  - workflow + orchestration-core schedule triggers
- edge-case regressions:
  - invalid branch target
  - retry exhaustion
  - cancel during long step
  - memory unavailable fallback

---

## Initial Success Criteria

- workflow definitions are strictly typed and validated before execution
- executor behavior is deterministic for identical inputs
- failures are always mapped to typed, actionable error categories
- orchestration and memory integrations work without provider lock-in
- local-model-friendly payload budgets are enforced by default

---

## Open Decisions

1. MVP graph model: strict DAG only vs controlled loops with max-iteration caps
2. Guard expression model: JSON-logic style vs minimal native comparator DSL
3. Transform model: declarative mapping only vs restricted expression language
4. Snapshot persistence: run-level only vs full step-level artifact journaling
5. Versioning: workflow schema version policy and migration strategy
