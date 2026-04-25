import { describe, expect, it } from "vitest";
import { getNextRunAt, InvalidTriggerError, validateTrigger } from "../src/index.js";
import type { Trigger } from "../src/types.js";

describe("scheduler heartbeat", () => {
	it("returns next run using interval in ms", () => {
		const trigger: Trigger = { kind: "heartbeat", intervalMs: 30_000 };
		const from = new Date("2026-04-25T08:00:00.000Z");

		const next = getNextRunAt(trigger, from);
		expect(next.toISOString()).toBe("2026-04-25T08:00:30.000Z");
	});

	it("rejects invalid heartbeat interval", () => {
		expect(() => validateTrigger({ kind: "heartbeat", intervalMs: 0 })).toThrow(InvalidTriggerError);
	});
});

describe("scheduler cron", () => {
	it("supports every-minute cron", () => {
		const trigger: Trigger = { kind: "cron", expression: "* * * * *" };
		const from = new Date("2026-04-25T08:00:30.000Z");

		const next = getNextRunAt(trigger, from);
		expect(next.toISOString()).toBe("2026-04-25T08:01:00.000Z");
	});

	it("supports specific time cron and strictly-future resolution", () => {
		const trigger: Trigger = { kind: "cron", expression: "15 10 * * *" };
		expect(getNextRunAt(trigger, new Date("2026-04-25T10:14:59.000Z")).toISOString()).toBe(
			"2026-04-25T10:15:00.000Z",
		);
		expect(getNextRunAt(trigger, new Date("2026-04-25T10:15:00.000Z")).toISOString()).toBe(
			"2026-04-26T10:15:00.000Z",
		);
	});

	it("supports weekday range cron", () => {
		const trigger: Trigger = { kind: "cron", expression: "0 9 * * 1-5" };
		expect(getNextRunAt(trigger, new Date("2026-04-24T08:59:59.000Z")).toISOString()).toBe(
			"2026-04-24T09:00:00.000Z",
		);
		// from Friday 09:00 UTC should roll to Monday 09:00 UTC
		expect(getNextRunAt(trigger, new Date("2026-04-24T09:00:00.000Z")).toISOString()).toBe(
			"2026-04-27T09:00:00.000Z",
		);
	});

	it("supports cron lists and steps", () => {
		const trigger: Trigger = { kind: "cron", expression: "*/10 8,9 * * *" };
		expect(getNextRunAt(trigger, new Date("2026-04-25T08:09:00.000Z")).toISOString()).toBe(
			"2026-04-25T08:10:00.000Z",
		);
		expect(getNextRunAt(trigger, new Date("2026-04-25T09:59:59.000Z")).toISOString()).toBe(
			"2026-04-26T08:00:00.000Z",
		);
	});

	it("rejects invalid cron syntax", () => {
		expect(() => validateTrigger({ kind: "cron", expression: "* * * *" })).toThrow(InvalidTriggerError);
		expect(() => validateTrigger({ kind: "cron", expression: "61 * * * *" })).toThrow(InvalidTriggerError);
		expect(() => validateTrigger({ kind: "cron", expression: "*/0 * * * *" })).toThrow(InvalidTriggerError);
	});
});

