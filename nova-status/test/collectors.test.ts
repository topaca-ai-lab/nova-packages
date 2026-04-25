import assert from "node:assert/strict";
import test from "node:test";

import { collectNovaStatus, createFailingCollector, createStaticCollector } from "../src/index.js";

test("collectNovaStatus aggregates green collectors into green overall status", async () => {
	const snapshot = await collectNovaStatus({
		collectors: {
			agent: createStaticCollector("agent", { severity: "green", state: "working" }),
			scheduler: createStaticCollector("scheduler", {
				severity: "green",
				heartbeatRunning: true,
				cronRunning: true,
				missedRuns: 0,
			}),
			diagnostics: createStaticCollector("diagnostics", {
				severity: "green",
				internalChecks: "green",
				extendedChecks: "green",
			}),
			dependencies: createStaticCollector("dependencies", {
				severity: "green",
				orchestrationCore: "green",
				workflowSkills: "green",
				memoryCore: "green",
				connectorSkills: "green",
			}),
		},
		now: () => new Date("2026-01-01T00:00:00.000Z"),
	});

	assert.equal(snapshot.generatedAt, "2026-01-01T00:00:00.000Z");
	assert.equal(snapshot.overall, "green");
	assert.equal(snapshot.issues.length, 0);
});

test("collectNovaStatus degrades to yellow when one collector times out", async () => {
	const snapshot = await collectNovaStatus({
		timeoutMs: 10,
		collectors: {
			agent: createStaticCollector("agent", { severity: "green", state: "working" }),
			scheduler: async () => {
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 50);
				});
				return {
					domain: "scheduler",
					payload: {
						severity: "green",
						heartbeatRunning: true,
						cronRunning: true,
						missedRuns: 0,
					},
					issues: [],
					latencyMs: 50,
					timedOut: false,
				};
			},
			diagnostics: createStaticCollector("diagnostics", {
				severity: "green",
				internalChecks: "green",
				extendedChecks: "green",
			}),
			dependencies: createStaticCollector("dependencies", {
				severity: "green",
				orchestrationCore: "green",
				workflowSkills: "green",
				memoryCore: "green",
				connectorSkills: "green",
			}),
		},
	});

	assert.equal(snapshot.overall, "yellow");
	assert.ok(snapshot.issues.some((issue) => issue.code === "collector_timeout"));
	assert.equal(snapshot.scheduler.severity, "unknown");
});

test("collectNovaStatus degrades to yellow when a collector throws", async () => {
	const snapshot = await collectNovaStatus({
		collectors: {
			agent: createFailingCollector("agent", { message: "agent adapter unavailable" }),
			scheduler: createStaticCollector("scheduler", {
				severity: "green",
				heartbeatRunning: true,
				cronRunning: true,
				missedRuns: 0,
			}),
			diagnostics: createStaticCollector("diagnostics", {
				severity: "green",
				internalChecks: "green",
				extendedChecks: "green",
			}),
			dependencies: createStaticCollector("dependencies", {
				severity: "green",
				orchestrationCore: "green",
				workflowSkills: "green",
				memoryCore: "green",
				connectorSkills: "green",
			}),
		},
	});

	assert.equal(snapshot.overall, "yellow");
	assert.ok(snapshot.issues.some((issue) => issue.code === "collector_failed"));
	assert.equal(snapshot.agent.severity, "unknown");
	assert.equal(snapshot.agent.state, "unknown");
});

test("collectNovaStatus reports unknown state when collectors are missing", async () => {
	const snapshot = await collectNovaStatus();

	assert.equal(snapshot.overall, "yellow");
	assert.ok(snapshot.issues.length >= 4);
	assert.ok(snapshot.issues.some((issue) => issue.code === "unknown_state"));
	assert.ok(snapshot.issues.some((issue) => issue.code === "scheduler_heartbeat_down"));
});

test("collectNovaStatus deduplicates identical collector and derived issues", async () => {
	const snapshot = await collectNovaStatus({
		collectors: {
			agent: createStaticCollector("agent", { severity: "green", state: "working" }),
			scheduler: createStaticCollector(
				"scheduler",
				{
					severity: "yellow",
					heartbeatRunning: true,
					cronRunning: false,
					missedRuns: 0,
				},
				{
					issues: [
						{
							code: "scheduler_cron_down",
							domain: "scheduler",
							severity: "yellow",
							message: "Cron scheduler is not running.",
						},
					],
				},
			),
			diagnostics: createStaticCollector("diagnostics", {
				severity: "green",
				internalChecks: "green",
				extendedChecks: "green",
			}),
			dependencies: createStaticCollector("dependencies", {
				severity: "green",
				orchestrationCore: "green",
				workflowSkills: "green",
				memoryCore: "green",
				connectorSkills: "green",
			}),
		},
	});

	const cronIssues = snapshot.issues.filter((issue) => issue.code === "scheduler_cron_down");
	assert.equal(cronIssues.length, 1);
});
