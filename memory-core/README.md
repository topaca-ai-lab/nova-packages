# @topaca/memory-core

Provider-agnostic memory runtime contracts for Nova / Edgent.

## Status

Phase 8 (packaging and release-ready).

## Installation

```bash
npm install @topaca/memory-core
```

## Scope (current)

- Memory domain types (`working`, `episodic`, `semantic`, `fact`)
- Store abstraction (`MemoryStore`)
- Embedding provider abstraction (`EmbeddingProvider`)
- Vector index abstraction (`VectorIndex`)
- Policy hooks (`MemoryPolicy`)
- In-memory reference store (`createInMemoryMemoryStore`)
- SQLite store with schema migrations (`createSqliteMemoryStore`)
- In-memory vector index reference adapter (`createInMemoryVectorIndex`)
- Hybrid retrieval with weighted lexical/vector/recency scoring
- Markdown ingestion pipeline with deterministic chunk IDs (`ingestMarkdownDocument`)
- Wiki-style editable pages (`upsertWikiPage`, `getWikiPage`, `listWikiPages`)
- Policy-aware wrapper store (`createPolicyAwareMemoryStore`)
- Default policy with namespace guard + redaction hook (`DefaultMemoryPolicy`)
- Retention policy compaction (`maxEntriesPerNamespace`, `maxAgeMs`)
- Observable store wrapper with runtime metrics/events (`createObservableMemoryStore`)
- In-memory event sink for local telemetry (`InMemoryMemoryEventSink`)
- Health snapshot API with store + metrics (`getHealthSnapshot`)

## Quickstart

```ts
import {
  createInMemoryMemoryStore,
  createObservableMemoryStore,
  DefaultMemoryPolicy,
  createPolicyAwareMemoryStore,
  ingestMarkdownDocument,
  upsertWikiPage,
} from "@topaca/memory-core";

const baseStore = createInMemoryMemoryStore();
const policyStore = createPolicyAwareMemoryStore({
  store: baseStore,
  policy: new DefaultMemoryPolicy({
    allowedNamespaces: ["project-docs", "project-wiki"],
  }),
  retention: { maxEntriesPerNamespace: 2000 },
});
const store = createObservableMemoryStore({ store: policyStore });

await ingestMarkdownDocument(store, {
  namespace: "project-docs",
  sourceId: "architecture-overview",
  markdown: "# Architecture\n\nNova uses Edgent memory abstractions.",
});

await upsertWikiPage(store, {
  namespace: "project-wiki",
  slug: "memory-model",
  title: "Memory Model",
  body: "Use semantic + episodic memory for retrieval.",
});

const result = await store.query({
  text: "edgent memory abstractions",
  filter: { namespaces: ["project-docs", "project-wiki"] },
  profile: "hybrid",
  includeDiagnostics: true,
});
console.log(result.hits[0]?.entry.id, result.diagnostics);
```

## Release Notes

- License: `AGPL-3.0-only` with commercial licensing option at repository level.
- Node.js: `>=22.5.0`
- Package scope: `@topaca/*`
- Release process: see [RELEASING.md](RELEASING.md)

## Development

```bash
npm run build
npm run check
```
