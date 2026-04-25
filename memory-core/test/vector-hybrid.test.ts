import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EmbeddingRequest, EmbeddingResponse } from "../src/types.js";
import type { EmbeddingProvider } from "../src/interfaces/embedding-provider.js";
import {
	createInMemoryMemoryStore,
	createInMemoryVectorIndex,
	createSqliteMemoryStore,
} from "../src/index.js";

class DeterministicEmbeddingProvider implements EmbeddingProvider {
	public readonly provider = "deterministic-test";

	public async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
		const vectors = request.texts.map((text) => mapTextToVector(text));
		return {
			vectors,
			dimensions: 2,
		};
	}
}

describe("Vector and Hybrid Retrieval", () => {
	it("uses vector ranking for hybrid profile in in-memory store", async () => {
		const vectorIndex = createInMemoryVectorIndex();
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
			embeddingProvider: new DeterministicEmbeddingProvider(),
			vectorIndex,
		});

		await store.upsert({
			id: "recent-logs",
			namespace: "n1",
			kind: "semantic",
			content: { text: "error logs and stack traces" },
			updatedAt: "2026-04-25T11:59:00.000Z",
		});
		await store.upsert({
			id: "banana-note",
			namespace: "n1",
			kind: "semantic",
			content: { text: "banana smoothie notes" },
			updatedAt: "2026-04-25T10:00:00.000Z",
		});

		const result = await store.query({
			text: "yellow fruit ideas",
			profile: "hybrid",
			filter: { namespaces: ["n1"] },
			includeDiagnostics: true,
		});

		expect(result.hits[0]?.entry.id).toBe("banana-note");
		expect(result.diagnostics?.vectorUsed).toBe(true);
		expect(result.diagnostics?.vectorBackend).toBe("in_memory_vector");
	});

	it("falls back gracefully when vector index is unavailable", async () => {
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
			embeddingProvider: new DeterministicEmbeddingProvider(),
		});

		await store.upsert({
			id: "a",
			namespace: "n1",
			kind: "semantic",
			content: { text: "banana smoothie notes" },
		});

		const result = await store.query({
			text: "yellow fruit ideas",
			profile: "vector",
			filter: { namespaces: ["n1"] },
			includeDiagnostics: true,
		});

		expect(result.hits).toHaveLength(1);
		expect(result.diagnostics?.vectorUsed).toBe(false);
		expect(result.diagnostics?.fallbackReason).toBe("vector_index_unavailable");
	});

	it("supports forced queryVector without embedding provider", async () => {
		const vectorIndex = createInMemoryVectorIndex();
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
			vectorIndex,
		});

		await store.upsert({
			id: "apple",
			namespace: "n1",
			kind: "semantic",
			content: { text: "apple pie recipe" },
		});
		await store.upsert({
			id: "banana",
			namespace: "n1",
			kind: "semantic",
			content: { text: "banana smoothie notes" },
		});
		await vectorIndex.upsert([
			{
				entryId: "apple",
				namespace: "n1",
				vector: [1, 0],
				updatedAt: "2026-04-25T12:00:00.000Z",
			},
			{
				entryId: "banana",
				namespace: "n1",
				vector: [0, 1],
				updatedAt: "2026-04-25T12:00:00.000Z",
			},
		]);

		const result = await store.query({
			profile: "vector",
			queryVector: [0, 1],
			filter: { namespaces: ["n1"] },
			includeDiagnostics: true,
		});

		expect(result.hits[0]?.entry.id).toBe("banana");
		expect(result.diagnostics?.vectorUsed).toBe(true);
		expect(result.diagnostics?.fallbackReason).toBeUndefined();
	});

	it("applies vector retrieval in sqlite store", async () => {
		const dir = mkdtempSync(join(tmpdir(), "nova-memory-phase4-"));
		try {
			const store = createSqliteMemoryStore({
				path: join(dir, "memory.sqlite"),
				now: () => new Date("2026-04-25T12:00:00.000Z"),
				embeddingProvider: new DeterministicEmbeddingProvider(),
				vectorIndex: createInMemoryVectorIndex(),
			});
			try {
				await store.upsert({
					id: "apple",
					namespace: "n1",
					kind: "semantic",
					content: { text: "apple pie recipe" },
				});
				await store.upsert({
					id: "banana",
					namespace: "n1",
					kind: "semantic",
					content: { text: "banana smoothie notes" },
				});

				const result = await store.query({
					text: "yellow fruit ideas",
					profile: "hybrid",
					filter: { namespaces: ["n1"] },
					includeDiagnostics: true,
				});

				expect(result.hits[0]?.entry.id).toBe("banana");
				expect(result.diagnostics?.vectorUsed).toBe(true);
			} finally {
				store.close();
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

function mapTextToVector(text: string): readonly number[] {
	const normalized = text.toLowerCase();
	if (normalized.includes("banana") || normalized.includes("yellow") || normalized.includes("fruit")) {
		return [0, 1];
	}
	if (normalized.includes("apple")) {
		return [1, 0];
	}
	if (normalized.includes("error") || normalized.includes("stack")) {
		return [0.8, 0.2];
	}
	return [0.5, 0.5];
}
