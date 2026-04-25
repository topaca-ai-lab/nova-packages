# RFC-MEMORY-001: memory-core Foundation

- Status: Draft (Accepted for implementation)
- Authors: TOPACA AI-Lab
- Created: 2026-04-25
- Target Package: `@topaca/memory-core`

## 1. Summary

`memory-core` defines a provider-agnostic memory runtime for Nova/Edgent.
It standardizes how memory is written, indexed, queried, retained, and observed
across local and server deployments.

## 2. Motivation

Nova needs a single memory abstraction that works for:

- lightweight local usage with small models
- server setups with SQL and vector indexes
- transparent and inspectable file-based memory (Markdown/wiki)

Without a shared core, every feature would implement ad hoc memory behavior,
leading to incompatible retrieval quality and higher maintenance cost.

## 3. Goals

- Unified memory contracts for all Nova components.
- Adapter architecture for multiple storage/index backends.
- Deterministic baseline behavior for low-resource models.
- Explicit retention/safety policies.
- Observable runtime for diagnostics and benchmarking.

## 4. Non-Goals (Phase 0/1)

- No hardcoded vendor backend in core package.
- No coupled RAG pipeline orchestration inside `memory-core`.
- No UI concerns in the package API.
- No distributed consensus or multi-region replication features.

## 5. Domain Model

### 5.1 Memory Entry

Core record with:

- `id` (stable identifier)
- `namespace` (scope boundary)
- `kind` (`working`, `episodic`, `semantic`, `fact`)
- `content` (text payload + optional structured metadata)
- `tags` (categorization/filtering)
- lifecycle fields (`createdAt`, `updatedAt`, `expiresAt`, `deletedAt`)
- provenance (`source`, `sourceRef`, `author`, optional trace metadata)

### 5.2 Query

Query supports:

- text prompt (optional)
- namespace and tag filters
- time window filters
- limit/pagination cursor
- retrieval profile (`lexical`, `vector`, `hybrid`)

### 5.3 Result

Query result returns:

- ranked entries
- score breakdown (vector/lexical/recency components when available)
- retrieval diagnostics (backend used, fallback flags)

## 6. Architecture

`memory-core` is split into layers:

1. Domain + contracts (`types`, interfaces, errors)
2. Reference behavior (in-memory store and baseline ranking)
3. Optional adapters (SQLite/SQL, vector index, markdown source)
4. Policy + observability modules

The package must remain usable with only layer 1+2.

## 7. API Direction (initial)

### 7.1 Core Interfaces

- `MemoryStore`: CRUD + query + compaction
- `EmbeddingProvider`: text -> vector abstraction
- `VectorIndex`: index/write/delete/search abstraction
- `MemoryPolicy`: retention/redaction/access hooks

### 7.2 Service Facade

`MemoryCore` (name TBD in implementation) coordinates store, index, and policy:

- `upsert(entry | entries)`
- `query(request)`
- `remove(id | filter)`
- `compact(policyOverride?)`
- `health()`

## 8. Retention and Safety

Retention is policy-driven (not hardcoded):

- `maxEntries` per namespace
- `maxAgeMs` expiry window
- optional decay strategy for low-value entries

Safety hooks:

- optional redaction before persistence
- optional write guard for namespace restrictions

## 9. Compatibility and Migration

- Start with in-memory store for immediate integration.
- Add SQLite adapter with contract parity.
- Add vector adapter behind optional interfaces.
- Existing modules integrate through interfaces, not direct backend APIs.

## 10. Testing Strategy

- Unit tests for model, scoring, policies, errors.
- Contract tests shared by all store adapters.
- Integration tests for SQLite migration path.
- Performance smoke tests with low-resource model assumptions.

## 11. Open Questions

- Default score weighting for `hybrid` profile.
- Cursor format for portable pagination across adapters.
- Minimum metadata required for traceability without bloat.

## 12. Decision

Proceed with Phase 1 implementation based on this RFC and `PLAN.md`, with
interface-first development and in-memory reference behavior as baseline.
