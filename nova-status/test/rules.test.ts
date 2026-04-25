import assert from "node:assert/strict";
import test from "node:test";

import { buildNovaStatusSnapshot, determineOverallSeverity, evaluateNovaStatus } from "../src/index.js";
import type { EvaluateNovaStatusInput, NovaStatusIssue } from "../src/index.js";

function createBaseInput(overrides: Partial<EvaluateNovaStatusInput> = {}): EvaluateNovaStatusInput {
	return {
		agent: { severity: "green", state: "working" },
		scheduler: {
			severity: "green",
			heartbeatRunning: true,
			cronRunning: true,
			missedRuns: 0,
		},
		diagnostics: { severity: "green", internalChecks: "green", extendedChecks: "green" },
		dependencies: {
			severity: "green",
			orchestrationCore: "green",
			workflowSkills: "green",
			memoryCore: "green",
			connectorSkills: "green",
		},
		...overrides,
	};
}

test("determineOverallSeverity treats unknown-only as degraded yellow", () => {
	assert.equal(determineOverallSeverity(["unknown"]), "yellow");
	assert.equal(determineOverallSeverity(["green", "unknown"]), "yellow");
});

test("evaluateNovaStatus returns green when all domains are green and no issues", () => {
	const result = evaluateNovaStatus(createBaseInput());
	assert.equal(result.overall, "green");
	assert.equal(result.counts.green, 4);
	assert.equal(result.issues.length, 0);
	assert.ok(result.reasons[0]?.includes("green"));
});

test("evaluateNovaStatus returns red when a domain is red", () => {
	const result = evaluateNovaStatus(
		createBaseInput({
			diagnostics: { severity: "red", internalChecks: "red", extendedChecks: "yellow" },
		}),
	);
	assert.equal(result.overall, "red");
	assert.ok(result.reasons.some((reason) => reason.includes("red")));
});

test("evaluateNovaStatus returns yellow when unknown exists but no red exists", () => {
	const result = evaluateNovaStatus(
		createBaseInput({
			scheduler: {
				severity: "unknown",
				heartbeatRunning: false,
				cronRunning: false,
				missedRuns: 0,
			},
		}),
	);
	assert.equal(result.overall, "yellow");
	assert.ok(result.reasons.some((reason) => reason.includes("Unknown")));
});

test("evaluateNovaStatus sorts issues deterministically by severity/domain/code/message", () => {
	const issues: NovaStatusIssue[] = [
		{
			code: "unknown_state",
			domain: "scheduler",
			severity: "unknown",
			message: "scheduler state unknown",
		},
		{
			code: "agent_blocked",
			domain: "agent",
			severity: "red",
			message: "agent blocked",
		},
		{
			code: "scheduler_missed_runs",
			domain: "scheduler",
			severity: "yellow",
			message: "missed runs",
		},
	];

	const result = evaluateNovaStatus(createBaseInput({ issues }));
	assert.equal(result.overall, "red");
	assert.deepEqual(
		result.issues.map((issue) => issue.code),
		["agent_blocked", "scheduler_missed_runs", "unknown_state"],
	);
});

test("buildNovaStatusSnapshot computes overall and keeps deterministic timestamp", () => {
	const snapshot = buildNovaStatusSnapshot({
		...createBaseInput({
			scheduler: {
				severity: "yellow",
				heartbeatRunning: true,
				cronRunning: false,
				missedRuns: 2,
			},
		}),
		now: () => new Date("2026-01-01T00:00:00.000Z"),
	});

	assert.equal(snapshot.generatedAt, "2026-01-01T00:00:00.000Z");
	assert.equal(snapshot.overall, "yellow");
	assert.equal(snapshot.issues.length, 0);
});
