# nova-status Plan

## Goal

Build `@topaca/nova-status` as a deterministic status and diagnostics package for Nova/Edgent.

The package extends CLI/TUI feedback with reliable runtime visibility for:

- agent activity state,
- heartbeat/cron scheduler health,
- internal and extended diagnostics,
- aggregated overall health with machine-readable output.

The package must remain local-model friendly and work robustly with very small models by keeping status computation deterministic and LLM-independent.

---

## Scope for First Release (MVP)

- typed status contracts for agent, scheduler, diagnostics, dependencies, and overall state
- deterministic status aggregation rules (`green`, `yellow`, `red`, `unknown`)
- collector interfaces for:
  - agent runtime state
  - orchestration heartbeat/cron state
  - diagnostic probes
- in-memory reference snapshot store
- CLI-friendly render adapters:
  - compact text summary
  - verbose text summary
  - JSON output
- watch-mode hooks for live status refresh

---

## Non-Goals (MVP)

- rich graphical dashboard
- remote multi-node status federation
- hard dependency on any single provider backend
- automatic remediation actions (status is observability-first in MVP)

---

## Architecture

### 1) Core Modules

1. `types`
- status domain contracts and discriminated unions.

2. `rules`
- deterministic health aggregation and severity rules.

3. `collectors`
- interfaces and adapters for agent/scheduler/diagnostic probes.

4. `snapshot-store`
- status snapshot persistence abstraction.

5. `renderers`
- text and JSON output formatting for CLI/TUI integration.

### 2) Key Contracts

- `NovaStatusSnapshot`
- `NovaStatusSeverity`
- `AgentStatus`
- `SchedulerStatus`
- `DiagnosticsStatus`
- `NovaStatusIssue`
- `NovaStatusCollector`

### 3) Public API Shape (initial)

- `collectNovaStatus(options)`
- `evaluateNovaStatus(snapshot)`
- `renderNovaStatusText(snapshot, options?)`
- `renderNovaStatusJson(snapshot)`
- `createInMemoryNovaStatusStore()`

---

## Delivery Phases

## Phase 0: Scope + RFC + Package Skeleton

### Deliverables

- `nova-status/` folder initialization
- `PLAN.md` (this file)
- `RFC-STATUS-001.md` with terminology, constraints, and API draft
- package metadata (`package.json`, `tsconfig.build.json`, `src/index.ts`, `src/types.ts`)

### Acceptance Criteria

- package compiles as type-only skeleton
- status domains and boundaries are documented
- local-model constraints are explicitly captured

Status: completed

## Phase 1: Domain Model + Status Rules

### Deliverables

- typed severity model and issue taxonomy
- deterministic rule engine for overall health scoring
- baseline rule tests for edge and degraded states

### Acceptance Criteria

- no nondeterministic status scoring
- `green/yellow/red/unknown` mapping is stable and test-covered

Status: completed

## Phase 2: Collector Interfaces + Reference Adapters

### Deliverables

- collector interfaces for agent/scheduler/diagnostics
- in-memory and mock adapters for deterministic tests
- timeout-safe collector orchestration

### Acceptance Criteria

- partial collector failures degrade gracefully (`unknown` / `yellow`) without crashes
- collector time budgets are enforced

Status: completed

## Phase 3: Rendering + CLI Integration Contract

### Deliverables

- compact text renderer
- verbose text renderer
- JSON renderer
- watch refresh contract for CLI/TUI

### Acceptance Criteria

- renderers stay LLM-free and deterministic
- machine-readable JSON includes enough detail for automation

Status: completed

## Phase 4: Orchestration/Diagnostics Integration

### Deliverables

- heartbeat/cron status integration hooks
- diagnostic probe integration hooks (`doctor`/extended checks)
- dependency-state correlation and aggregation

### Acceptance Criteria

- scheduler issues are visible and affect overall status correctly
- diagnostics can be represented uniformly across backends

Status: completed

## Phase 5: Hardening + Bench + Release

### Deliverables

- reliability tests on degraded collector scenarios
- release docs and package docs
- publish workflow under `@topaca/nova-status`

### Acceptance Criteria

- package passes `npm run check`
- deterministic outputs across repeated runs
- release artifact includes contracts and renderers

Status: completed

---

## Testing Strategy

- unit tests for rules and severity scoring
- contract tests for collectors and snapshot store
- renderer tests for stable text/json output
- integration tests with mock scheduler/diagnostic states
- regression tests for tiny-model-first constraints (no LLM dependency in status path)
