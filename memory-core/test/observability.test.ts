import { describe, expect, it } from "vitest";
import {
	InMemoryMemoryEventSink,
	createInMemoryMemoryStore,
	createObservableMemoryStore,
} from "../src/index.js";
import type {
	MemoryCompactionRequest,
	MemoryCompactionResult,
	MemoryEntry,
	MemoryEntryId,
	MemoryQuery,
	MemoryQueryResult,
	MemoryRemoveRequest,
	MemoryRemoveResult,
	MemoryStore,
	MemoryStoreHealth,
	MemoryUpsertEntry,
} from "../src/index.js";

describe("observable memory store", () => {
	it("records events and keeps bounded snapshots", async () => {
		const baseStore = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});
		const sink = new InMemoryMemoryEventSink(2);
		const store = createObservableMemoryStore({
			store: baseStore,
			sinks: [sink],
			maxEvents: 2,
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		await store.upsert({
			id: "a",
			namespace: "n1",
			kind: "working",
			content: { text: "alpha" },
		});
		await store.query({ filter: { namespaces: ["n1"] } });
		await store.compact({ namespace: "n1", maxEntries: 10 });

		const snapshot = store.getEventSnapshot();
		expect(snapshot).toHaveLength(3);
		expect(snapshot.map((event) => event.operation)).toEqual(["upsert", "query", "compact"]);
		expect(sink.list()).toHaveLength(3);
	});

	it("tracks metrics including query hit/zero-hit counts", async () => {
		const baseStore = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});
		const store = createObservableMemoryStore({
			store: baseStore,
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		await store.upsert({
			id: "e1",
			namespace: "n1",
			kind: "semantic",
			content: { text: "banana memory" },
		});
		await store.query({
			text: "banana",
			filter: { namespaces: ["n1"] },
		});
		await store.query({
			text: "nothing-match",
			filter: { namespaces: ["missing"] },
		});
		await store.remove({ id: "e1" });

		const metrics = store.getMetricsSnapshot();
		expect(metrics.totalOperations).toBe(4);
		expect(metrics.perOperationCount.upsert).toBe(1);
		expect(metrics.perOperationCount.query).toBe(2);
		expect(metrics.perOperationCount.remove).toBe(1);
		expect(metrics.queryCount).toBe(2);
		expect(metrics.queryZeroHitCount).toBe(1);
		expect(metrics.queryHitCountTotal).toBe(1);
	});

	it("captures operation failures and exposes health snapshot", async () => {
		const baseStore: MemoryStore = {
			backend: "failing_store",
			upsert: async (_entry: MemoryUpsertEntry): Promise<MemoryEntry> => {
				throw new Error("upsert failed");
			},
			upsertMany: async (_entries: readonly MemoryUpsertEntry[]): Promise<readonly MemoryEntry[]> => {
				throw new Error("upsertMany failed");
			},
			getById: async (_id: MemoryEntryId, _namespace?: string): Promise<MemoryEntry | undefined> => {
				return undefined;
			},
			query: async (_request: MemoryQuery): Promise<MemoryQueryResult> => {
				throw new Error("query failed");
			},
			remove: async (_request: MemoryRemoveRequest): Promise<MemoryRemoveResult> => {
				throw new Error("remove failed");
			},
			compact: async (_request?: MemoryCompactionRequest): Promise<MemoryCompactionResult> => {
				throw new Error("compact failed");
			},
			health: async (): Promise<MemoryStoreHealth> => ({
				backend: "failing_store",
				ok: false,
				message: "forced failure backend",
			}),
		};
		const store = createObservableMemoryStore({
			store: baseStore,
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		await expect(store.query({ text: "x" })).rejects.toThrow("query failed");

		const failed = store.getEventSnapshot({ success: false });
		expect(failed.length).toBe(1);
		expect(failed[0]?.operation).toBe("query");
		expect(failed[0]?.error).toBeTruthy();

		const health = await store.getHealthSnapshot();
		expect(health.backend).toBe("failing_store");
		expect(health.store.ok).toBe(false);
		expect(health.metrics.errorCount).toBe(1);
		expect(health.recentEventCount).toBeGreaterThan(0);
	});
});
