import { describe, expect, it } from "vitest";
import { createInMemoryMemoryStore } from "../src/index.js";

function fixedNow(iso: string): () => Date {
	return () => new Date(iso);
}

describe("InMemoryMemoryStore", () => {
	it("upserts entries and increments version", async () => {
		const store = createInMemoryMemoryStore({
			now: fixedNow("2026-04-25T12:00:00.000Z"),
			idFactory: () => "m-1",
		});

		const created = await store.upsert({
			namespace: "project-a",
			kind: "working",
			content: { text: "first draft task state" },
		});
		const updated = await store.upsert({
			id: created.id,
			namespace: "project-a",
			kind: "working",
			content: { text: "second draft task state" },
		});

		expect(created.version).toBe(1);
		expect(updated.version).toBe(2);
		expect(updated.createdAt).toBe(created.createdAt);
	});

	it("ranks lexical matches deterministically", async () => {
		const store = createInMemoryMemoryStore({
			now: fixedNow("2026-04-25T12:00:00.000Z"),
		});

		await store.upsert({
			id: "a",
			namespace: "docs",
			kind: "semantic",
			content: { text: "agent memory policy and retrieval ranking" },
			updatedAt: "2026-04-25T11:00:00.000Z",
		});
		await store.upsert({
			id: "b",
			namespace: "docs",
			kind: "semantic",
			content: { text: "memory policy" },
			updatedAt: "2026-04-25T11:30:00.000Z",
		});

		const result = await store.query({
			text: "memory policy retrieval",
			filter: { namespaces: ["docs"] },
			limit: 10,
		});

		expect(result.hits).toHaveLength(2);
		expect(result.hits[0]?.entry.id).toBe("a");
		expect(result.hits[1]?.entry.id).toBe("b");
	});

	it("excludes expired and soft-deleted entries by default", async () => {
		const store = createInMemoryMemoryStore({
			now: fixedNow("2026-04-25T12:00:00.000Z"),
		});

		await store.upsert({
			id: "expired",
			namespace: "docs",
			kind: "fact",
			content: { text: "old info" },
			expiresAt: "2026-04-25T11:00:00.000Z",
		});
		await store.upsert({
			id: "active",
			namespace: "docs",
			kind: "fact",
			content: { text: "current info" },
		});
		await store.remove({ id: "active" });

		const query = await store.query({ filter: { namespaces: ["docs"] }, includeDiagnostics: true });
		const includeDeleted = await store.query({
			filter: { namespaces: ["docs"], includeDeleted: true },
		});

		expect(query.hits).toHaveLength(0);
		expect(query.diagnostics?.storeBackend).toBe("in_memory");
		expect(includeDeleted.hits).toHaveLength(1);
		expect(includeDeleted.hits[0]?.entry.id).toBe("active");
	});

	it("supports hard delete and reports counters", async () => {
		const store = createInMemoryMemoryStore({
			now: fixedNow("2026-04-25T12:00:00.000Z"),
		});

		await store.upsert({
			id: "r1",
			namespace: "n1",
			kind: "working",
			content: { text: "one" },
		});
		await store.upsert({
			id: "r2",
			namespace: "n1",
			kind: "working",
			content: { text: "two" },
		});

		const soft = await store.remove({ id: "r1" });
		const hard = await store.remove({ ids: ["r1", "r2"], hardDelete: true });
		const left = await store.query({ filter: { namespaces: ["n1"], includeDeleted: true } });

		expect(soft.softDeletedCount).toBe(1);
		expect(hard.hardDeletedCount).toBe(2);
		expect(left.hits).toHaveLength(0);
	});

	it("compacts by maxAgeMs and maxEntries", async () => {
		const store = createInMemoryMemoryStore({
			now: fixedNow("2026-04-25T12:00:00.000Z"),
		});

		await store.upsert({
			id: "old",
			namespace: "n1",
			kind: "episodic",
			content: { text: "old" },
			updatedAt: "2026-04-25T09:00:00.000Z",
		});
		await store.upsert({
			id: "mid",
			namespace: "n1",
			kind: "episodic",
			content: { text: "mid" },
			updatedAt: "2026-04-25T11:00:00.000Z",
		});
		await store.upsert({
			id: "new",
			namespace: "n1",
			kind: "episodic",
			content: { text: "new" },
			updatedAt: "2026-04-25T11:50:00.000Z",
		});

		const first = await store.compact({ namespace: "n1", maxAgeMs: 60 * 60 * 1000 });
		const second = await store.compact({ namespace: "n1", maxEntries: 1 });
		const remaining = await store.query({ filter: { namespaces: ["n1"] } });

		expect(first.removedCount).toBe(1);
		expect(second.removedCount).toBe(1);
		expect(remaining.hits).toHaveLength(1);
		expect(remaining.hits[0]?.entry.id).toBe("new");
	});

	it("supports offset cursor pagination", async () => {
		const store = createInMemoryMemoryStore({
			now: fixedNow("2026-04-25T12:00:00.000Z"),
		});

		await store.upsert({
			id: "1",
			namespace: "n1",
			kind: "fact",
			content: { text: "alpha" },
		});
		await store.upsert({
			id: "2",
			namespace: "n1",
			kind: "fact",
			content: { text: "beta" },
		});
		await store.upsert({
			id: "3",
			namespace: "n1",
			kind: "fact",
			content: { text: "gamma" },
		});

		const first = await store.query({ filter: { namespaces: ["n1"] }, limit: 2 });
		const second = await store.query({
			filter: { namespaces: ["n1"] },
			limit: 2,
			cursor: first.nextCursor,
		});

		expect(first.hits).toHaveLength(2);
		expect(first.nextCursor).toBe("offset:2");
		expect(second.hits).toHaveLength(1);
	});
});
