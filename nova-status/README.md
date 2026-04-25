# nova-status

`@topaca/nova-status` is the deterministic runtime status layer for Nova/Edgent.

Current status:

- maturity marker: `phase-5`
- phase scope: full MVP including contracts, deterministic rules, collectors, renderers, watch contracts, integration hooks, and snapshot store hardening

## Package Scope (target)

- agent activity status contracts
- heartbeat/cron scheduler status contracts
- internal and extended diagnostics status contracts
- deterministic health aggregation rules
- compact text, verbose text, and JSON status rendering

## Exported in Phase 5

- status domain contracts (`NovaStatusSnapshot`, `AgentStatus`, `SchedulerStatus`, `DiagnosticsStatus`)
- issue and severity model (`NovaStatusIssue`, `NovaStatusSeverity`, `NovaStatusDomain`)
- typed issue code taxonomy (`NovaStatusIssueCode`)
- collector contracts (`NovaStatusCollector`, `NovaStatusCollectorResult`, `NovaStatusCollectorOptions`)
- collector orchestration API (`collectNovaStatus`) with deterministic fallback behavior
- reference test adapters (`createStaticCollector`, `createFailingCollector`)
- deterministic rule engine (`evaluateNovaStatus`, `determineOverallSeverity`, `buildNovaStatusSnapshot`)
- renderers (`renderNovaStatusText`, `renderNovaStatusJson`) with `compact` and `verbose` output modes
- watch refresh contract (`createNovaStatusWatchContract`, `computeRefreshDelay`, `computeNextRefreshAt`)
- snapshot store (`createInMemoryNovaStatusSnapshotStore`, `InMemoryNovaStatusSnapshotStore`)
- integration mappers:
  - `mapSchedulerSignalsToStatus`
  - `mapDiagnosticProbesToStatus`
  - `mapDependencySignalsToStatus`
- derived issue helpers:
  - `deriveIssuesFromAgentStatus`
  - `deriveIssuesFromSchedulerStatus`
  - `deriveIssuesFromDiagnosticsStatus`
  - `deriveIssuesFromDependencyStatus`
- phase marker export (`NOVA_STATUS_PHASE`)

## Install

```bash
npm install @topaca/nova-status
```

## Development

```bash
npm run check
```
