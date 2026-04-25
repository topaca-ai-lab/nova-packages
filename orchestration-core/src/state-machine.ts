import type { RunRecord, RunStatus } from "./types.js";

const TERMINAL_STATUSES: RunStatus[] = ["succeeded", "failed", "canceled"];

const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
	queued: ["running", "canceled"],
	running: ["succeeded", "failed", "canceled"],
	succeeded: [],
	failed: ["queued"],
	canceled: [],
};

export class InvalidRunTransitionError extends Error {
	readonly from: RunStatus;
	readonly to: RunStatus;

	constructor(from: RunStatus, to: RunStatus) {
		super(`Invalid run status transition: ${from} -> ${to}`);
		this.name = "InvalidRunTransitionError";
		this.from = from;
		this.to = to;
	}
}

export function isTerminalStatus(status: RunStatus): boolean {
	return TERMINAL_STATUSES.includes(status);
}

export function canTransitionRunStatus(from: RunStatus, to: RunStatus): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionRunRecordStatus(
	current: RunRecord,
	next: RunStatus,
	options: { at?: string; lastError?: string } = {},
): RunRecord {
	if (!canTransitionRunStatus(current.status, next)) {
		throw new InvalidRunTransitionError(current.status, next);
	}

	const at = options.at ?? new Date().toISOString();

	const nextRecord: RunRecord = {
		...current,
		status: next,
	};

	if (next === "running") {
		nextRecord.startedAt = nextRecord.startedAt ?? at;
	}

	if (next === "failed") {
		nextRecord.finishedAt = at;
		nextRecord.lastError = options.lastError ?? nextRecord.lastError;
	}

	if (next === "succeeded" || next === "canceled") {
		nextRecord.finishedAt = at;
		nextRecord.lastError = undefined;
	}

	if (current.status === "failed" && next === "queued") {
		nextRecord.attempt = current.attempt + 1;
		nextRecord.startedAt = undefined;
		nextRecord.finishedAt = undefined;
		nextRecord.lastError = undefined;
	}

	return nextRecord;
}

