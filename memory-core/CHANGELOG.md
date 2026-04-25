# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.1] - 2026-04-25

### Added

- Initial Phase 1 scaffold for `@topaca/memory-core`.
- Core memory domain types and retrieval contracts.
- Interface-first abstractions for store, embedding, vector index, and policy.
- In-memory memory store with CRUD, query, retention compaction, and health API.
- SQLite memory store with schema migrations and matching query/remove/compaction semantics.
- Cross-adapter store contract tests (in-memory and SQLite).
- Vector/hybrid retrieval support with fallback diagnostics in in-memory and SQLite stores.
- In-memory vector index adapter for local testing and development.
- Markdown ingestion with deterministic chunking and source attribution metadata.
- Wiki memory helpers for upsert/get/list of editable curated pages.
- Policy-aware memory store wrapper with observable policy decisions.
- Default policy implementation for namespace restrictions and text redaction.
- Typed policy violation errors and retention-triggered compaction hooks.
- Observable memory store wrapper with operation-level events and latency metrics.
- In-memory memory event sink and event snapshot filtering for diagnostics.
- Runtime health snapshot API combining backend health and telemetry metrics.
- Release-ready package metadata (`exports`, `repository`, `homepage`, `publishConfig`).
- Extended README quickstart with policy, observability, markdown, and wiki flows.
- Added `RELEASING.md` with reproducible validation and publish steps.
