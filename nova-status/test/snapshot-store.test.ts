import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryNovaStatusSnapshotStore, type NovaStatusSnapshot } from "../src/index.js";

function createSnapshot(generatedAt: string, overall: NovaStatusSnapshot["overall"]): NovaStatusSnapshot {
	return {
		generatedAt,
		overall,
		agent: { severity: "green", state: "working" },
		scheduler: {
			severity: "green",
			heartbeatRunning: true,
			cronRunning: true,
			missedRuns: 0,
		},
		diagnostics: {
			severity: "green",
			internalChecks: "green",
			extendedChecks: "green",
		},
		dependencies: {
			severity: "green",
			orchestrationCore: "green",
			workflowSkills: "green",
			memoryCore: "green",
			connectorSkills: "green",
		},
		issues: [],
	};
}

test("InMemoryNovaStatusSnapshotStore stores and lists snapshots", async () => {
	const store = new InMemoryNovaStatusSnapshotStore({ maxSnapshots: 10 });

	await store.upsert(createSnapshot("2026-01-01T00:00:00.000Z", "green"));
	await store.upsert(createSnapshot("2026-01-01T00:01:00.000Z", "yellow"));

	const list = await store.list();
	assert.equal(list.length, 2);
	assert.equal(list[0]?.generatedAt, "2026-01-01T00:00:00.000Z");
	assert.equal(list[1]?.generatedAt, "2026-01-01T00:01:00.000Z");

	const yellowOnly = await store.list({ overall: "yellow" });
	assert.equal(yellowOnly.length, 1);
	assert.equal(yellowOnly[0]?.overall, "yellow");
});

test("InMemoryNovaStatusSnapshotStore prunes oldest snapshots", async () => {
	const store = new InMemoryNovaStatusSnapshotStore({ maxSnapshots: 2 });

	await store.upsert(createSnapshot("2026-01-01T00:00:00.000Z", "green"));
	await store.upsert(createSnapshot("2026-01-01T00:01:00.000Z", "green"));
	await store.upsert(createSnapshot("2026-01-01T00:02:00.000Z", "yellow"));

	const list = await store.list();
	assert.equal(list.length, 2);
	assert.equal(list[0]?.generatedAt, "2026-01-01T00:01:00.000Z");
	assert.equal(list[1]?.generatedAt, "2026-01-01T00:02:00.000Z");
});

test("InMemoryNovaStatusSnapshotStore health returns available", async () => {
	const store = new InMemoryNovaStatusSnapshotStore({ maxSnapshots: 3 });
	await store.upsert(createSnapshot("2026-01-01T00:00:00.000Z", "green"));

	const health = await store.health();
	assert.equal(health.ok, true);
	assert.equal(health.backend, "in_memory");
	assert.equal(health.snapshotCount, 1);
	assert.equal(health.maxSnapshots, 3);
});
