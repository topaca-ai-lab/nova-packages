import { describe, expect, it } from "vitest";
import { createInMemoryMemoryStore, ingestMarkdownDocument } from "../src/index.js";

const SAMPLE_MARKDOWN = `
# Nova Memory

This is a long-form memory document.

## Section A

Banana vectors should rank semantically better than lexical-only matches in some cases.

## Section B

Chunk ids should be deterministic across re-ingestion.
`;

describe("markdown ingestion", () => {
	it("generates deterministic chunk ids across re-ingestion", async () => {
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		const first = await ingestMarkdownDocument(store, {
			namespace: "docs",
			sourceId: "memory-overview",
			markdown: SAMPLE_MARKDOWN,
			chunkSize: 120,
			chunkOverlap: 20,
		});
		const second = await ingestMarkdownDocument(store, {
			namespace: "docs",
			sourceId: "memory-overview",
			markdown: SAMPLE_MARKDOWN,
			chunkSize: 120,
			chunkOverlap: 20,
		});

		expect(first.chunkCount).toBeGreaterThan(0);
		expect(second.chunkCount).toBe(first.chunkCount);
		expect(second.chunks.map((chunk) => chunk.id)).toEqual(first.chunks.map((chunk) => chunk.id));

		const all = await store.query({
			filter: { namespaces: ["docs"], tagsAny: ["source:memory-overview"] },
			limit: 100,
		});
		expect(all.hits).toHaveLength(first.chunkCount);
	});

	it("retains source attribution in retrieved entries", async () => {
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		await ingestMarkdownDocument(store, {
			namespace: "docs",
			sourceId: "edgent-wiki",
			markdown: SAMPLE_MARKDOWN,
			chunkSize: 140,
		});

		const result = await store.query({
			text: "deterministic chunk ids",
			filter: { namespaces: ["docs"] },
			limit: 1,
		});

		expect(result.hits).toHaveLength(1);
		expect(result.hits[0]?.entry.provenance?.source).toBe("markdown");
		expect(result.hits[0]?.entry.provenance?.sourceRef).toContain("edgent-wiki#chunk-");
	});
});
