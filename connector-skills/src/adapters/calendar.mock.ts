import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { CalendarConnector } from "../interfaces/calendar.js";
import type {
	CalendarEvent,
	EventCreateParams,
	EventCreateResult,
	EventDeleteParams,
	EventDeleteResult,
	EventUpdateParams,
	EventUpdateResult,
	EventsListParams,
	EventsListResult,
	FreeBusyQueryParams,
	FreeBusyQueryResult,
	FreeBusySlot,
} from "../types/calendar.js";

export class MockCalendarConnector implements CalendarConnector {
	readonly skillId = "calendar" as const;

	private readonly events = new Map<string, CalendarEvent>();
	private nextId = 1;

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "calendar",
			available: true,
			backend: "mock",
			capabilities: {
				eventsList: true,
				eventCreate: true,
				eventUpdate: true,
				eventDelete: true,
				freeBusyQuery: true,
			},
		};
	}

	async eventsList(params: EventsListParams): Promise<EventsListResult> {
		let events = [...this.events.values()];

		if (params.calendarId) {
			events = events.filter((e) => e.calendarId === params.calendarId);
		}

		events = events.filter((e) => e.startAt >= params.from && e.startAt <= params.to);

		const limit = params.limit ?? 50;
		const sliced = events.slice(0, limit);

		return { events: sliced.map((e) => ({ ...e })), totalCount: events.length };
	}

	async eventCreate(params: EventCreateParams): Promise<EventCreateResult> {
		const now = new Date().toISOString();
		const event: CalendarEvent = {
			id: `evt-${this.nextId++}`,
			calendarId: params.calendarId,
			title: params.title,
			description: params.description,
			location: params.location,
			startAt: params.startAt,
			endAt: params.endAt,
			allDay: params.allDay ?? false,
			attendees: [],
			createdAt: now,
			updatedAt: now,
		};
		this.events.set(event.id, event);
		return { event: { ...event } };
	}

	async eventUpdate(params: EventUpdateParams): Promise<EventUpdateResult> {
		const event = this.events.get(params.eventId);
		if (!event) {
			throw new Error(`Event not found: ${params.eventId}`);
		}
		if (params.title !== undefined) event.title = params.title;
		if (params.startAt !== undefined) event.startAt = params.startAt;
		if (params.endAt !== undefined) event.endAt = params.endAt;
		if (params.description !== undefined) event.description = params.description;
		if (params.location !== undefined) event.location = params.location;
		event.updatedAt = new Date().toISOString();
		return { event: { ...event } };
	}

	async eventDelete(params: EventDeleteParams): Promise<EventDeleteResult> {
		const deleted = this.events.delete(params.eventId);
		return { deleted };
	}

	async freeBusyQuery(params: FreeBusyQueryParams): Promise<FreeBusyQueryResult> {
		let events = [...this.events.values()];
		if (params.calendarIds && params.calendarIds.length > 0) {
			const ids = new Set(params.calendarIds);
			events = events.filter((e) => ids.has(e.calendarId));
		}
		events = events.filter((e) => e.endAt > params.from && e.startAt < params.to);

		const slots: FreeBusySlot[] = events.map((e) => ({
			startAt: e.startAt,
			endAt: e.endAt,
			status: "busy" as const,
		}));

		return { slots };
	}

	/** Test helper: seed an event. */
	seedEvent(event: CalendarEvent): void {
		this.events.set(event.id, { ...event });
	}
}
