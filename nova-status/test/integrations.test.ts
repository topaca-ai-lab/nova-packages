import assert from "node:assert/strict";
import test from "node:test";

import {
	collectNovaStatus,
	mapDependencySignalsToStatus,
	mapDiagnosticProbesToStatus,
	mapSchedulerSignalsToStatus,
} from "../src/index.js";

test("mapSchedulerSignalsToStatus marks missed-runs as visible issues", () => {
	const result = mapSchedulerSignalsToStatus({
		heartbeatConfigured: true,
		heartbeatRunning: true,
		cronConfigured: true,
		cronRunning: true,
		missedRuns: 3,
	});

	assert.equal(result.status.severity, "yellow");
	assert.ok(result.issues.some((issue) => issue.code === "scheduler_missed_runs"));
});

test("mapDiagnosticProbesToStatus handles mixed backends uniformly", () => {
	const result = mapDiagnosticProbesToStatus([
		{
			id: "doctor-core-parser",
			scope: "internal",
			ok: false,
			backend: "LiteLLM+Ollama",
			message: "Core parser mismatch",
		},
		{
			id: "doctor-extended-telemetry",
			scope: "extended",
			ok: false,
			backend: "LM-Studio",
			message: "Telemetry collector unavailable",
		},
	]);

	assert.equal(result.status.internalChecks, "red");
	assert.equal(result.status.extendedChecks, "yellow");
	assert.equal(result.status.severity, "red");
	assert.ok(result.issues.some((issue) => issue.code === "diagnostics_core_failed"));
	assert.ok(result.issues.some((issue) => issue.code === "diagnostics_extended_failed"));
});

test("mapDependencySignalsToStatus correlates dependency health and emits issues", () => {
	const result = mapDependencySignalsToStatus({
		orchestrationCore: true,
		workflowSkills: "yellow",
		memoryCore: false,
		connectorSkills: "unknown",
	});

	assert.equal(result.status.severity, "red");
	assert.ok(result.issues.some((issue) => issue.code === "dependency_unavailable"));
	assert.ok(result.issues.some((issue) => issue.code === "unknown_state"));
});

test("collectNovaStatus exposes scheduler issues even without collector-provided issues", async () => {
	const snapshot = await collectNovaStatus({
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
					severity: "green",
					internalChecks: "green",
					extendedChecks: "green",
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

	assert.equal(snapshot.overall, "yellow");
	assert.ok(snapshot.issues.some((issue) => issue.code === "scheduler_cron_down"));
	assert.ok(snapshot.issues.some((issue) => issue.code === "scheduler_missed_runs"));
});
