import type { Trigger } from "./types.js";

interface ParsedCronField {
	any: boolean;
	allowed: Set<number>;
}

interface ParsedCronExpression {
	minute: ParsedCronField;
	hour: ParsedCronField;
	dayOfMonth: ParsedCronField;
	month: ParsedCronField;
	dayOfWeek: ParsedCronField;
}

const MINUTE_MS = 60_000;
const MAX_SEARCH_MINUTES = 60 * 24 * 366 * 5; // five years

export class InvalidTriggerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidTriggerError";
	}
}

export class SchedulerRangeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SchedulerRangeError";
	}
}

export function validateTrigger(trigger: Trigger): void {
	if (trigger.kind === "heartbeat") {
		if (!Number.isFinite(trigger.intervalMs) || !Number.isInteger(trigger.intervalMs) || trigger.intervalMs <= 0) {
			throw new InvalidTriggerError("Heartbeat intervalMs must be a positive integer.");
		}
		return;
	}

	parseCronExpression(trigger.expression);
}

export function getNextRunAt(trigger: Trigger, from: Date): Date {
	validateTrigger(trigger);

	if (trigger.kind === "heartbeat") {
		return new Date(from.getTime() + trigger.intervalMs);
	}

	return getNextCronRunAt(trigger.expression, from);
}

function getNextCronRunAt(expression: string, from: Date): Date {
	const parsed = parseCronExpression(expression);
	let currentMinute = from.getTime() - (from.getTime() % MINUTE_MS) + MINUTE_MS;

	for (let i = 0; i < MAX_SEARCH_MINUTES; i++) {
		const candidate = new Date(currentMinute);
		if (matchesCron(candidate, parsed)) {
			return candidate;
		}
		currentMinute += MINUTE_MS;
	}

	throw new SchedulerRangeError(`Could not resolve next cron run within ${MAX_SEARCH_MINUTES} minutes.`);
}

function parseCronExpression(expression: string): ParsedCronExpression {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new InvalidTriggerError(`Cron expression must have exactly 5 fields: "${expression}"`);
	}

	return {
		minute: parseCronField(fields[0], { min: 0, max: 59 }),
		hour: parseCronField(fields[1], { min: 0, max: 23 }),
		dayOfMonth: parseCronField(fields[2], { min: 1, max: 31 }),
		month: parseCronField(fields[3], { min: 1, max: 12 }),
		dayOfWeek: parseCronField(fields[4], { min: 0, max: 7 }, { map7To0: true }),
	};
}

function parseCronField(
	raw: string,
	range: { min: number; max: number },
	options: { map7To0?: boolean } = {},
): ParsedCronField {
	const value = raw.trim();
	if (value === "*") {
		return { any: true, allowed: new Set<number>() };
	}

	const allowed = new Set<number>();
	for (const part of value.split(",")) {
		const token = part.trim();
		if (token.length === 0) {
			throw new InvalidTriggerError(`Invalid empty token in cron field "${raw}".`);
		}
		parseCronTokenIntoSet(token, range, allowed, options);
	}

	if (allowed.size === 0) {
		throw new InvalidTriggerError(`Cron field "${raw}" resolved to no values.`);
	}

	return { any: false, allowed };
}

function parseCronTokenIntoSet(
	token: string,
	range: { min: number; max: number },
	target: Set<number>,
	options: { map7To0?: boolean },
): void {
	const [base, stepRaw] = token.split("/");
	const step = stepRaw ? Number.parseInt(stepRaw, 10) : 1;

	if (!Number.isInteger(step) || step <= 0) {
		throw new InvalidTriggerError(`Invalid cron step "${token}".`);
	}

	if (base === "*") {
		for (let n = range.min; n <= range.max; n += step) {
			target.add(normalizeCronValue(n, options));
		}
		return;
	}

	if (base.includes("-")) {
		const [startRaw, endRaw] = base.split("-");
		const start = Number.parseInt(startRaw, 10);
		const end = Number.parseInt(endRaw, 10);
		if (!Number.isInteger(start) || !Number.isInteger(end)) {
			throw new InvalidTriggerError(`Invalid cron range "${token}".`);
		}
		if (start > end) {
			throw new InvalidTriggerError(`Cron range start must be <= end: "${token}".`);
		}
		validateCronValue(start, range, token);
		validateCronValue(end, range, token);
		for (let n = start; n <= end; n += step) {
			target.add(normalizeCronValue(n, options));
		}
		return;
	}

	const exact = Number.parseInt(base, 10);
	if (!Number.isInteger(exact)) {
		throw new InvalidTriggerError(`Invalid cron value "${token}".`);
	}
	validateCronValue(exact, range, token);
	target.add(normalizeCronValue(exact, options));
}

function validateCronValue(value: number, range: { min: number; max: number }, token: string): void {
	if (value < range.min || value > range.max) {
		throw new InvalidTriggerError(
			`Cron value "${token}" is outside range ${range.min}-${range.max}: "${value}".`,
		);
	}
}

function normalizeCronValue(value: number, options: { map7To0?: boolean }): number {
	if (options.map7To0 && value === 7) {
		return 0;
	}
	return value;
}

function matchesCron(date: Date, parsed: ParsedCronExpression): boolean {
	const minute = date.getUTCMinutes();
	const hour = date.getUTCHours();
	const dayOfMonth = date.getUTCDate();
	const month = date.getUTCMonth() + 1;
	const dayOfWeek = date.getUTCDay();

	const minuteMatch = fieldMatches(minute, parsed.minute);
	const hourMatch = fieldMatches(hour, parsed.hour);
	const monthMatch = fieldMatches(month, parsed.month);
	const domMatch = fieldMatches(dayOfMonth, parsed.dayOfMonth);
	const dowMatch = fieldMatches(dayOfWeek, parsed.dayOfWeek);

	const dayMatch = dayOfMonthDayOfWeekMatch(parsed.dayOfMonth, parsed.dayOfWeek, domMatch, dowMatch);

	return minuteMatch && hourMatch && monthMatch && dayMatch;
}

function fieldMatches(value: number, field: ParsedCronField): boolean {
	return field.any || field.allowed.has(value);
}

function dayOfMonthDayOfWeekMatch(
	dayOfMonth: ParsedCronField,
	dayOfWeek: ParsedCronField,
	domMatch: boolean,
	dowMatch: boolean,
): boolean {
	// Cron semantics:
	// - if either DOM or DOW is '*', the other must match
	// - if both are restricted, either may match
	if (dayOfMonth.any && dayOfWeek.any) return true;
	if (dayOfMonth.any) return dowMatch;
	if (dayOfWeek.any) return domMatch;
	return domMatch || dowMatch;
}

