import { describe, expect, it } from "vitest";
import type { MemoryStore } from "../src/interfaces/memory-store.js";

interface StoreContractOptions {
	name: string;
	createStore: () => MemoryStore;
	disposeStore?: (store: MemoryStore) => void | Promise<void>;
}

export function runMemoryStoreContractSuite(options: StoreContractOptions): void {
	describe(`${options.name} memory store contract`, () => {
		it("upserts, reads, and versions entries", async () => {
			const store = options.createStore();
			try {
				const created = await store.upsert({
					id: "entry-1",
					namespace: "project-a",
					kind: "working",
					content: { text: "first draft state" },
					updatedAt: "2026-04-25T12:00:00.000Z",
				});
				const updated = await store.upsert({
					id: "entry-1",
					namespace: "project-a",
					kind: "working",
					content: { text: "second draft state" },
					updatedAt: "2026-04-25T12:01:00.000Z",
				});
				const fetched = await store.getById("entry-1", "project-a");
				expect(created.version).toBe(1);
				expect(updated.version).toBe(2);
				expect(fetched?.content.text).toBe("second draft state");
			} finally {
				await options.disposeStore?.(store);
			}
		});

		it("supports lexical query ranking with namespace filter", async () => {
			const store = options.createStore();
			try {
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
					content: { text: "memory policy only" },
					updatedAt: "2026-04-25T11:30:00.000Z",
				});
				const result = await store.query({
					text: "memory policy retrieval",
					filter: { namespaces: ["docs"] },
				});
				expect(result.hits).toHaveLength(2);
				expect(result.hits[0]?.entry.id).toBe("a");
				expect(result.hits[1]?.entry.id).toBe("b");
			} finally {
				await options.disposeStore?.(store);
			}
		});

		it("supports soft-delete and hard-delete removal", async () => {
			const store = options.createStore();
			try {
				await store.upsert({
					id: "s1",
					namespace: "n1",
					kind: "fact",
					content: { text: "one" },
				});
				await store.upsert({
					id: "s2",
					namespace: "n1",
					kind: "fact",
					content: { text: "two" },
				});

				const soft = await store.remove({ id: "s1" });
				const visible = await store.query({ filter: { namespaces: ["n1"] } });
				const all = await store.query({ filter: { namespaces: ["n1"], includeDeleted: true } });
				const hard = await store.remove({ ids: ["s1", "s2"], hardDelete: true });
				const left = await store.query({ filter: { namespaces: ["n1"], includeDeleted: true } });

				expect(soft.softDeletedCount).toBe(1);
				expect(visible.hits).toHaveLength(1);
				expect(all.hits).toHaveLength(2);
				expect(hard.hardDeletedCount).toBe(2);
				expect(left.hits).toHaveLength(0);
			} finally {
				await options.disposeStore?.(store);
			}
		});

		it("compacts by age and max entries", async () => {
			const store = options.createStore();
			try {
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

				const first = await store.compact({
					namespace: "n1",
					maxAgeMs: 60 * 60 * 1000,
					now: "2026-04-25T12:00:00.000Z",
				});
				const second = await store.compact({
					namespace: "n1",
					maxEntries: 1,
					now: "2026-04-25T12:00:00.000Z",
				});
				const remaining = await store.query({ filter: { namespaces: ["n1"] } });

				expect(first.removedCount).toBe(1);
				expect(second.removedCount).toBe(1);
				expect(remaining.hits).toHaveLength(1);
				expect(remaining.hits[0]?.entry.id).toBe("new");
			} finally {
				await options.disposeStore?.(store);
			}
		});

		it("supports cursor pagination and health snapshots", async () => {
			const store = options.createStore();
			try {
				await store.upsert({
					id: "1",
					namespace: "p",
					kind: "fact",
					content: { text: "alpha" },
				});
				await store.upsert({
					id: "2",
					namespace: "p",
					kind: "fact",
					content: { text: "beta" },
				});
				await store.upsert({
					id: "3",
					namespace: "p",
					kind: "fact",
					content: { text: "gamma" },
				});
				const first = await store.query({ filter: { namespaces: ["p"] }, limit: 2, includeDiagnostics: true });
				const second = await store.query({
					filter: { namespaces: ["p"] },
					limit: 2,
					cursor: first.nextCursor,
				});
				const health = await store.health();

				expect(first.hits).toHaveLength(2);
				expect(first.nextCursor).toBe("offset:2");
				expect(second.hits).toHaveLength(1);
				expect(first.diagnostics?.storeBackend).toBeTruthy();
				expect(health.ok).toBe(true);
			} finally {
				await options.disposeStore?.(store);
			}
		});
	});
}
