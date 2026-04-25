import assert from "node:assert/strict";
import test from "node:test";

import { collectNovaStatus } from "../src/index.js";

test("degraded snapshots remain deterministic for identical input signals", async () => {
	const collect = async () =>
		collectNovaStatus({
			collectors: {
				agent: async () => ({
					domain: "agent",
					payload: { severity: "green", state: "working" },
					issues: [],
					latencyMs: 1,
					timedOut: false,
				}),
				scheduler: async () => ({
					domain: "scheduler",
					payload: {
						severity: "yellow",
						heartbeatRunning: true,
						cronRunning: false,
						missedRuns: 2,
					},
					issues: [],
					latencyMs: 1,
					timedOut: false,
				}),
				diagnostics: async () => ({
					domain: "diagnostics",
					payload: {
						severity: "yellow",
						internalChecks: "green",
						extendedChecks: "yellow",
					},
					issues: [],
					latencyMs: 1,
					timedOut: false,
				}),
				dependencies: async () => ({
					domain: "dependencies",
					payload: {
						severity: "green",
						orchestrationCore: "green",
						workflowSkills: "green",
						memoryCore: "green",
						connectorSkills: "green",
					},
					issues: [],
					latencyMs: 1,
					timedOut: false,
				}),
			},
			now: () => new Date("2026-01-01T00:00:00.000Z"),
		});

	const first = await collect();
	const second = await collect();

	assert.deepEqual(second, first);
	assert.equal(first.overall, "yellow");
	assert.ok(first.issues.some((issue) => issue.code === "scheduler_cron_down"));
	assert.ok(first.issues.some((issue) => issue.code === "scheduler_missed_runs"));
});
