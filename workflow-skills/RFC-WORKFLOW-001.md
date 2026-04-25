# RFC-WORKFLOW-001

## Title

Workflow Skills Core for Nova/Edgent

## Status

Draft (Phase 0)

## Summary

`@topaca/workflow-skills` defines a reusable, typed workflow runtime for Nova.
It provides deterministic orchestration of multi-step tool flows on top of
`@topaca/orchestration-core`, `@topaca/connector-skills`, and `@topaca/memory-core`.

The first goal is not feature breadth, but a stable execution model suitable for
local-first environments and smaller models.

## Motivation

Nova already has:

- scheduling and run lifecycle primitives (`orchestration-core`),
- tool integration primitives (`connector-skills`),
- memory primitives (`memory-core`).

What is missing is a portable workflow layer that:

- describes agent flows as typed definitions,
- validates definitions before runtime,
- executes steps deterministically,
- captures diagnostics for repair loops and operations.

## Design Goals

1. Deterministic execution for identical definitions and inputs.
2. Strict contracts to reduce runtime ambiguity for small models.
3. Clear integration boundaries to other core packages.
4. Typed error surface and observable lifecycle events.
5. Local-first behavior with safe defaults and bounded runtime.

## Non-Goals (Initial)

- visual workflow editor,
- distributed locking/leader election,
- BPMN parity,
- arbitrary runtime code execution,
- provider-specific prompt framework.

## Core Concepts

### WorkflowDefinition

Declarative workflow graph with:

- metadata (`id`, `name`, version),
- step dictionary,
- edge definitions,
- entry step,
- terminal step contract.

### WorkflowStep

Typed step union (initial target set):

- `tool`,
- `decision`,
- `memory`,
- `transform`,
- `finish`.

### WorkflowRunRecord

Persistent run view with:

- workflow id/version,
- run status,
- step trace,
- attempts/retries,
- timestamps,
- last typed error.

## Validation Requirements

Before registration/execution:

- unique ids,
- resolvable edge targets,
- reachable terminal step,
- no unresolved references,
- no invalid step kind payload.

## Execution Model (Initial)

- state machine driven,
- explicit step dispatch,
- retry/timeout/cancel support,
- deterministic transition ordering,
- typed event emission.

## Integration Boundaries

- `orchestration-core`: optional scheduler trigger bridge for periodic workflow runs.
- `connector-skills`: tool step dispatch target.
- `memory-core`: workflow state read/write/query for memory steps.

## Error Model

Workflow runtime maps failures into typed workflow errors with categories such as:

- validation,
- execution timeout,
- canceled,
- dependency unavailable,
- action failed,
- policy denied.

## Observability

Initial requirements:

- lifecycle event stream,
- run-level and step-level timings,
- machine-readable health snapshot,
- deterministic trace extraction for debugging.

## Versioning

The package follows the Nova-Packages lockstep style for practical release
operations. Initial package maturity marker will be exported in code as
`WORKFLOW_SKILLS_PHASE`.

## Open Questions

1. Strict DAG-only MVP or controlled loop support.
2. Guard expression DSL shape.
3. Transform step expressiveness boundaries.
4. Snapshot persistence granularity (run-only vs per-step artifacts).
