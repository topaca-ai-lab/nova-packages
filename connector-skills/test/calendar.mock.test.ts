import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockCalendarConnector } from "../src/adapters/calendar.mock.ts";

describe("MockCalendarConnector", () => {
	let cal: MockCalendarConnector;

	beforeEach(() => {
		cal = new MockCalendarConnector();
	});

	it("check returns available", async () => {
		const check = await cal.check();
		assert.equal(check.available, true);
		assert.equal(check.capabilities.eventCreate, true);
	});

	it("eventCreate and eventsList round-trip", async () => {
		const created = await cal.eventCreate({
			calendarId: "cal-1",
			title: "Meeting",
			startAt: "2026-04-25T14:00:00Z",
			endAt: "2026-04-25T15:00:00Z",
		});
		assert.equal(created.event.title, "Meeting");

		const listed = await cal.eventsList({
			from: "2026-04-25T00:00:00Z",
			to: "2026-04-25T23:59:59Z",
		});
		assert.equal(listed.events.length, 1);
	});

	it("eventUpdate modifies existing event", async () => {
		const { event } = await cal.eventCreate({
			calendarId: "cal-1",
			title: "Old Title",
			startAt: "2026-04-25T14:00:00Z",
			endAt: "2026-04-25T15:00:00Z",
		});
		const updated = await cal.eventUpdate({ eventId: event.id, title: "New Title" });
		assert.equal(updated.event.title, "New Title");
	});

	it("eventDelete removes event", async () => {
		const { event } = await cal.eventCreate({
			calendarId: "cal-1",
			title: "Delete Me",
			startAt: "2026-04-25T14:00:00Z",
			endAt: "2026-04-25T15:00:00Z",
		});
		const result = await cal.eventDelete({ eventId: event.id });
		assert.equal(result.deleted, true);
		const listed = await cal.eventsList({ from: "2026-04-25T00:00:00Z", to: "2026-04-25T23:59:59Z" });
		assert.equal(listed.events.length, 0);
	});

	it("freeBusyQuery returns busy slots for existing events", async () => {
		await cal.eventCreate({
			calendarId: "cal-1",
			title: "Busy",
			startAt: "2026-04-25T14:00:00Z",
			endAt: "2026-04-25T15:00:00Z",
		});
		const result = await cal.freeBusyQuery({
			from: "2026-04-25T00:00:00Z",
			to: "2026-04-25T23:59:59Z",
		});
		assert.equal(result.slots.length, 1);
		assert.equal(result.slots[0]?.status, "busy");
	});
});
