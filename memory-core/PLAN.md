# memory-core Plan

## Goal

Build `@topaca/memory-core` as the shared memory runtime for Nova/Edgent with
clear interfaces for in-memory, SQL, and vector-backed persistence.

## Phase 0: Scope and RFC (completed)

### Deliverables

- This `PLAN.md`
- `RFC-MEMORY-001.md`
- Package folder initialization (`memory-core/`)

### Acceptance Criteria

- Memory model and terminology are defined.
- API surface is outlined at interface level.
- Non-goals are explicit to prevent scope drift.
- Migration path to production adapters is documented.

## Phase 1: API and Domain Model

### Deliverables

- `src/types.ts` with entry/query/filter/result contracts
- `src/index.ts` public exports
- `src/interfaces/*.ts` for `MemoryStore`, `EmbeddingProvider`, `Indexer`

### Acceptance Criteria

- No provider hardcoding in core interfaces.
- Type-only package compiles without adapter implementations.

## Phase 2: In-Memory Reference Store

### Deliverables

- CRUD implementation
- Namespace/tag filtering
- TTL and soft-delete behavior
- Baseline ranking (lexical + recency weighting)

### Acceptance Criteria

- Deterministic behavior with stable sort for equal score.
- Unit tests cover lifecycle and query semantics.

Status: completed

## Phase 3: SQL Persistence Adapter

### Deliverables

- SQLite adapter with schema migrations
- Versioned schema metadata
- Read/write/query parity with in-memory store

### Acceptance Criteria

- Contract tests pass for in-memory and SQLite adapters.
- Migrations are forward-safe and idempotent.

Status: completed

## Phase 4: Vector and Hybrid Retrieval

### Deliverables

- Embedding provider abstraction integration
- Vector index adapter interface
- Hybrid ranking (vector + lexical + recency)

### Acceptance Criteria

- Configurable weighting strategy
- Graceful fallback when vector backend unavailable

Status: completed

## Phase 5: Markdown/Wiki Memory

### Deliverables

- Markdown ingestion pipeline
- Chunking and source tracking
- Editable wiki-style pages for curated knowledge

### Acceptance Criteria

- Deterministic chunk IDs for re-ingestion
- Source attribution retained in retrieval results

Status: completed

## Phase 6: Policies and Safety

### Deliverables

- Retention policies (`maxAgeMs`, `maxEntries`, decay)
- Optional redaction hook for sensitive data
- Read/write policy scopes per namespace

### Acceptance Criteria

- Policy violations produce typed errors.
- Policy decisions are observable in events/metrics.

Status: completed

## Phase 7: Observability and Operations

### Deliverables

- Metrics counters (latency, hit rate proxy, index health)
- Event stream (`add`, `update`, `delete`, `query`, `compact`)
- Health/diagnostic APIs

### Acceptance Criteria

- Runtime exposes machine-readable health snapshot.
- No silent failures in compaction/reindex flows.

Status: completed

## Phase 8: Packaging and Release

### Deliverables

- `README.md`, `CHANGELOG.md`, examples
- NPM release under `@topaca/memory-core`

### Acceptance Criteria

- License metadata is `AGPL-3.0-only`.
- Versioning follows repository policy in `VERSIONING.md`.

Status: completed
