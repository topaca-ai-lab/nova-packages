# RFC-STATUS-001: nova-status

## Status

Draft (Phase 0)

## Summary

`@topaca/nova-status` provides deterministic runtime status visibility for Nova.
It focuses on trustworthy, low-overhead health reporting that is robust even when Nova runs on very small local models.

The package is designed to extend standard CLI/TUI usage with clear operational feedback:

- Is the agent actively working?
- Are heartbeat and cron jobs healthy?
- Are core and extended diagnostics green?
- Is the system overall healthy, degraded, or failing?

## Motivation

Nova is intentionally local-first and small-model friendly.
That increases the need for explicit runtime visibility:

- model behavior can vary strongly by backend profile,
- tool-call and parser drift can cause silent degradation,
- scheduler and diagnostics failures should never remain hidden.

`nova-status` addresses this by making health state deterministic, typed, and machine-readable.

## Design Principles

1. Deterministic by default:
- no LLM requirement in status calculation path.

2. Graceful degradation:
- partial probe failures produce `unknown`/`yellow`, not crashes.

3. Low overhead:
- bounded collector timeouts and small payload contracts.

4. Local-first:
- compatible with local backends and offline-capable workflows.

5. Composable:
- separate collectors, rules, store, and renderers.

## Domain Model (Proposed)

- `NovaStatusSeverity`: `green | yellow | red | unknown`
- `AgentStatus`: activity and loop state
- `SchedulerStatus`: heartbeat/cron health and missed-run signals
- `DiagnosticsStatus`: internal and extended probe results
- `DependencyStatus`: status for orchestration, memory, connectors
- `NovaStatusIssue`: typed issue record with severity, code, message, source
- `NovaStatusSnapshot`: aggregate snapshot with timestamp and overall severity

## Aggregation Rules (MVP)

- any `red` critical issue in core domains -> overall `red`
- no `red`, but at least one `yellow` or `unknown` -> overall `yellow`
- all required checks green -> overall `green`
- collector hard failure without fallback -> overall `unknown`

Rule evaluation must be deterministic and test-covered.

## Collector Contract (MVP)

Each collector returns:

- domain name,
- status payload,
- issues,
- collection metadata (latency, timeout flag, source id).

Collectors are executed under bounded timeouts.
Timeouts and internal errors are normalized into typed issues.

## Rendering Contract (MVP)

Three output modes:

- compact text summary,
- verbose text summary,
- JSON snapshot.

JSON output is considered the stable automation interface.

## Integration Targets

- orchestration-core: heartbeat/cron run-health hooks
- workflow-skills: optional workflow diagnostics inputs
- memory-core / connector-skills: dependency health overlays
- CLI/TUI: status and watch rendering surfaces

## Risks

1. Overly strict rules causing noisy `yellow`.
2. Under-specified collector timeouts causing UI stalls.
3. Schema churn if domain contracts are not frozen early.

## Mitigations

1. Rule matrix tests with representative scenarios.
2. Hard timeout defaults and defensive fallbacks.
3. Versioned contracts and changelog discipline.

## Open Questions

1. Should `unknown` map to yellow in human-facing compact mode?
2. Should extended diagnostics be optional by default in `watch` mode?
3. Which scheduler metrics are mandatory for MVP (`missedRuns`, `lastSuccessAt`, `nextRunAt`)?

## Phase 0 Decision

Proceed with package skeleton and typed contracts first.
No runtime collector implementation in Phase 0.
