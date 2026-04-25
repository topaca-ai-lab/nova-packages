import { describe, expect, it } from "vitest";
import {
	DefaultMemoryPolicy,
	MemoryPolicyViolationError,
	createInMemoryMemoryStore,
	createPolicyAwareMemoryStore,
} from "../src/index.js";
import type { MemoryPolicyDecision } from "../src/types.js";

describe("policy aware memory store", () => {
	it("blocks writes to disallowed namespaces", async () => {
		const baseStore = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});
		const policy = new DefaultMemoryPolicy({
			allowedNamespaces: ["allowed"],
		});
		const store = createPolicyAwareMemoryStore({
			store: baseStore,
			policy,
		});

		await expect(
			store.upsert({
				namespace: "forbidden",
				kind: "working",
				content: { text: "secret" },
			}),
		).rejects.toBeInstanceOf(MemoryPolicyViolationError);
	});

	it("applies redaction hook before persistence", async () => {
		const baseStore = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});
		const policy = new DefaultMemoryPolicy({
			allowedNamespaces: ["allowed"],
			redactText: (text) => text.replaceAll("SECRET", "[REDACTED]"),
		});
		const decisions: MemoryPolicyDecision[] = [];
		const store = createPolicyAwareMemoryStore({
			store: baseStore,
			policy,
			onDecision: (decision) => {
				decisions.push(decision);
			},
		});

		await store.upsert({
			id: "e1",
			namespace: "allowed",
			kind: "semantic",
			content: { text: "contains SECRET token" },
		});

		const entry = await store.getById("e1", "allowed");
		expect(entry?.content.text).toContain("[REDACTED]");
		expect(decisions.some((decision) => decision.action === "redact")).toBe(true);
	});

	it("runs retention compaction and keeps max entries per namespace", async () => {
		const baseStore = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});
		const policy = new DefaultMemoryPolicy({
			allowedNamespaces: ["n1"],
		});
		const store = createPolicyAwareMemoryStore({
			store: baseStore,
			policy,
			retention: {
				maxEntriesPerNamespace: 2,
			},
		});

		await store.upsert({
			id: "a",
			namespace: "n1",
			kind: "episodic",
			content: { text: "a" },
			updatedAt: "2026-04-25T10:00:00.000Z",
		});
		await store.upsert({
			id: "b",
			namespace: "n1",
			kind: "episodic",
			content: { text: "b" },
			updatedAt: "2026-04-25T11:00:00.000Z",
		});
		await store.upsert({
			id: "c",
			namespace: "n1",
			kind: "episodic",
			content: { text: "c" },
			updatedAt: "2026-04-25T11:50:00.000Z",
		});

		const all = await store.query({ filter: { namespaces: ["n1"] }, limit: 10 });
		expect(all.hits).toHaveLength(2);
		expect(all.hits.map((hit) => hit.entry.id).sort()).toEqual(["b", "c"]);
	});
});
