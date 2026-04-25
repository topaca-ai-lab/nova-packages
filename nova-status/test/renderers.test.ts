import assert from "node:assert/strict";
import test from "node:test";

import { renderNovaStatusJson, renderNovaStatusText, type NovaStatusSnapshot } from "../src/index.js";

function createSnapshot(): NovaStatusSnapshot {
	return {
		generatedAt: "2026-01-01T00:00:00.000Z",
		overall: "yellow",
		agent: {
			severity: "green",
			state: "working",
			activeRunId: "run-1",
		},
		scheduler: {
			severity: "yellow",
			heartbeatRunning: true,
			cronRunning: false,
			missedRuns: 2,
			lastSuccessAt: "2026-01-01T00:10:00.000Z",
			nextRunAt: "2026-01-01T00:15:00.000Z",
		},
		diagnostics: {
			severity: "green",
			internalChecks: "green",
			extendedChecks: "yellow",
		},
		dependencies: {
			severity: "green",
			orchestrationCore: "green",
			workflowSkills: "green",
			memoryCore: "green",
			connectorSkills: "green",
		},
		issues: [
			{
				code: "scheduler_missed_runs",
				domain: "scheduler",
				severity: "yellow",
				message: "Missed two scheduled runs.",
			},
		],
		notes: ["watch mode active"],
	};
}

test("renderNovaStatusText compact mode is deterministic", () => {
	const text = renderNovaStatusText(createSnapshot(), { mode: "compact" });
	assert.equal(
		text,
		"NOVA STATUS YELLOW @ 2026-01-01T00:00:00.000Z agent=GREEN(working) scheduler=YELLOW(hb=yes,cron=no,missed=2) diagnostics=GREEN(internal=GREEN,extended=YELLOW) dependencies=GREEN(orc=GREEN,wf=GREEN,mem=GREEN,conn=GREEN) issues=1",
	);
});

test("renderNovaStatusText verbose mode includes sections and issues", () => {
	const text = renderNovaStatusText(createSnapshot(), { mode: "verbose" });
	assert.ok(text.includes("Nova Status Report"));
	assert.ok(text.includes("Overall: YELLOW"));
	assert.ok(text.includes("Scheduler: YELLOW"));
	assert.ok(text.includes("Issues (1):"));
	assert.ok(text.includes("scheduler:scheduler_missed_runs"));
});

test("renderNovaStatusJson emits pretty JSON with stable fields", () => {
	const json = renderNovaStatusJson(createSnapshot());
	const parsed = JSON.parse(json) as NovaStatusSnapshot;

	assert.equal(parsed.overall, "yellow");
	assert.equal(parsed.issues.length, 1);
	assert.equal(parsed.scheduler.missedRuns, 2);
	assert.equal(parsed.generatedAt, "2026-01-01T00:00:00.000Z");
});
