# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Phase 0 package skeleton for `@topaca/nova-status`.
- Initial RFC (`RFC-STATUS-001.md`) for deterministic status and diagnostics architecture.
- Initial domain contracts for status severity, domains, issues, snapshots, and collector interfaces.
- Public phase marker export (`NOVA_STATUS_PHASE`).
- Phase 1 issue taxonomy (`NovaStatusIssueCode`) and deterministic rule engine APIs.
- Deterministic overall severity evaluation (`evaluateNovaStatus`, `determineOverallSeverity`) with stable issue ordering.
- Snapshot builder API (`buildNovaStatusSnapshot`) for consistent generated status payloads.
- Baseline rule tests for green/yellow/red/unknown edge and degraded scenarios.
- Phase 2 collector orchestration API (`collectNovaStatus`) with timeout-safe and failure-safe degradation.
- Reference deterministic adapters (`createStaticCollector`, `createFailingCollector`) for testing and local simulations.
- Collector error normalization to typed issues (`collector_timeout`, `collector_failed`, `unknown_state`).
- Collector tests for success, timeout, failure, and missing-collector fallback behavior.
- Phase 3 text/JSON rendering APIs (`renderNovaStatusText`, `renderNovaStatusJson`) for CLI/TUI integration.
- Compact and verbose deterministic text rendering modes with stable section formatting.
- Watch refresh contract APIs (`createNovaStatusWatchContract`, `computeRefreshDelay`, `computeNextRefreshAt`).
- Renderer and watch contract tests for deterministic output and refresh timing behavior.
- Phase 4 integration mappers for scheduler, diagnostics probes, and dependency health correlation.
- Automatic derived domain issues for scheduler/diagnostics/dependencies/agent signals inside status collection.
- Uniform diagnostics representation across mixed backends via probe normalization.
- Integration tests for scheduler visibility, diagnostics mapping, dependency correlation, and collector-to-issue propagation.
- Phase 5 in-memory snapshot store (`InMemoryNovaStatusSnapshotStore`) with list/filter/prune/health APIs.
- Hardening tests for deterministic degraded snapshots and collector issue de-duplication behavior.
- Snapshot-store tests for storage, pruning, filtering, and health checks.
- Release guide hardening with test and post-release validation steps.
