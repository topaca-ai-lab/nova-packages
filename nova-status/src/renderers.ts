import type { NovaStatusSnapshot } from "./types.js";

export type NovaStatusTextMode = "compact" | "verbose";

export interface RenderNovaStatusTextOptions {
	readonly mode?: NovaStatusTextMode;
	readonly includeTimestamp?: boolean;
	readonly includeNotes?: boolean;
	readonly includeIssues?: boolean;
}

export function renderNovaStatusText(
	snapshot: NovaStatusSnapshot,
	options: RenderNovaStatusTextOptions = {},
): string {
	const mode = options.mode ?? "compact";
	if (mode === "verbose") {
		return renderVerboseText(snapshot, options);
	}
	return renderCompactText(snapshot, options);
}

export function renderNovaStatusJson(snapshot: NovaStatusSnapshot): string {
	return JSON.stringify(snapshot, null, 2);
}

function renderCompactText(snapshot: NovaStatusSnapshot, options: RenderNovaStatusTextOptions): string {
	const includeTimestamp = options.includeTimestamp ?? true;
	const includeIssues = options.includeIssues ?? true;
	const timestamp = includeTimestamp ? ` @ ${snapshot.generatedAt}` : "";
	const issueCount = includeIssues ? ` issues=${snapshot.issues.length}` : "";

	const summary = [
		`NOVA STATUS ${toLabel(snapshot.overall)}${timestamp}`,
		`agent=${toLabel(snapshot.agent.severity)}(${snapshot.agent.state})`,
		`scheduler=${toLabel(snapshot.scheduler.severity)}(hb=${boolToText(snapshot.scheduler.heartbeatRunning)},cron=${boolToText(snapshot.scheduler.cronRunning)},missed=${snapshot.scheduler.missedRuns})`,
		`diagnostics=${toLabel(snapshot.diagnostics.severity)}(internal=${toLabel(snapshot.diagnostics.internalChecks)},extended=${toLabel(snapshot.diagnostics.extendedChecks)})`,
		`dependencies=${toLabel(snapshot.dependencies.severity)}(orc=${toLabel(snapshot.dependencies.orchestrationCore)},wf=${toLabel(snapshot.dependencies.workflowSkills)},mem=${toLabel(snapshot.dependencies.memoryCore)},conn=${toLabel(snapshot.dependencies.connectorSkills)})`,
	];

	return `${summary.join(" ")}${issueCount}`.trim();
}

function renderVerboseText(snapshot: NovaStatusSnapshot, options: RenderNovaStatusTextOptions): string {
	const includeTimestamp = options.includeTimestamp ?? true;
	const includeNotes = options.includeNotes ?? true;
	const includeIssues = options.includeIssues ?? true;
	const lines: string[] = [];

	lines.push(`Nova Status Report`);
	lines.push(`Overall: ${toLabel(snapshot.overall)}`);
	if (includeTimestamp) {
		lines.push(`Generated At: ${snapshot.generatedAt}`);
	}
	lines.push(``);
	lines.push(`Agent: ${toLabel(snapshot.agent.severity)} (state=${snapshot.agent.state})`);
	if (snapshot.agent.activeRunId !== undefined) {
		lines.push(`- activeRunId: ${snapshot.agent.activeRunId}`);
	}
	if (snapshot.agent.message !== undefined) {
		lines.push(`- message: ${snapshot.agent.message}`);
	}

	lines.push(`Scheduler: ${toLabel(snapshot.scheduler.severity)}`);
	lines.push(`- heartbeatRunning: ${boolToText(snapshot.scheduler.heartbeatRunning)}`);
	lines.push(`- cronRunning: ${boolToText(snapshot.scheduler.cronRunning)}`);
	lines.push(`- missedRuns: ${snapshot.scheduler.missedRuns}`);
	if (snapshot.scheduler.lastSuccessAt !== undefined) {
		lines.push(`- lastSuccessAt: ${snapshot.scheduler.lastSuccessAt}`);
	}
	if (snapshot.scheduler.nextRunAt !== undefined) {
		lines.push(`- nextRunAt: ${snapshot.scheduler.nextRunAt}`);
	}
	if (snapshot.scheduler.message !== undefined) {
		lines.push(`- message: ${snapshot.scheduler.message}`);
	}

	lines.push(`Diagnostics: ${toLabel(snapshot.diagnostics.severity)}`);
	lines.push(`- internalChecks: ${toLabel(snapshot.diagnostics.internalChecks)}`);
	lines.push(`- extendedChecks: ${toLabel(snapshot.diagnostics.extendedChecks)}`);
	if (snapshot.diagnostics.message !== undefined) {
		lines.push(`- message: ${snapshot.diagnostics.message}`);
	}

	lines.push(`Dependencies: ${toLabel(snapshot.dependencies.severity)}`);
	lines.push(`- orchestrationCore: ${toLabel(snapshot.dependencies.orchestrationCore)}`);
	lines.push(`- workflowSkills: ${toLabel(snapshot.dependencies.workflowSkills)}`);
	lines.push(`- memoryCore: ${toLabel(snapshot.dependencies.memoryCore)}`);
	lines.push(`- connectorSkills: ${toLabel(snapshot.dependencies.connectorSkills)}`);
	if (snapshot.dependencies.message !== undefined) {
		lines.push(`- message: ${snapshot.dependencies.message}`);
	}

	if (includeIssues) {
		lines.push(`Issues (${snapshot.issues.length}):`);
		if (snapshot.issues.length === 0) {
			lines.push(`- none`);
		} else {
			for (const issue of snapshot.issues) {
				lines.push(`- [${toLabel(issue.severity)}] ${issue.domain}:${issue.code} ${issue.message}`);
			}
		}
	}

	if (includeNotes) {
		lines.push(`Notes (${snapshot.notes?.length ?? 0}):`);
		if ((snapshot.notes?.length ?? 0) === 0) {
			lines.push(`- none`);
		} else {
			for (const note of snapshot.notes ?? []) {
				lines.push(`- ${note}`);
			}
		}
	}

	return lines.join("\n");
}

function toLabel(value: string): string {
	return value.toUpperCase();
}

function boolToText(value: boolean): string {
	return value ? "yes" : "no";
}
