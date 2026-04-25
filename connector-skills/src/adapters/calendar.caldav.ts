import { DAVClient, DAVCalendar, createDAVClient } from "tsdav";
import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorAuthError, ConnectorNotAvailableError } from "../errors.js";
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

export interface CalDavCalendarOptions {
	serverUrl: string;
	credentials: { username: string; password: string };
	authMethod?: "Basic" | "Oauth";
	defaultCalendarId?: string;
}

export class CalDavCalendarConnector implements CalendarConnector {
	readonly skillId = "calendar" as const;
	private readonly options: CalDavCalendarOptions;
	private client: DAVClient | null = null;
	private calendars: DAVCalendar[] = [];

	constructor(options: CalDavCalendarOptions) {
		this.options = options;
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		try {
			await this.ensureClient();
			return {
				skillId: "calendar",
				available: true,
				backend: "caldav",
				capabilities: { eventsList: true, eventCreate: true, eventUpdate: true, eventDelete: true, freeBusyQuery: true },
			};
		} catch (err) {
			return {
				skillId: "calendar",
				available: false,
				backend: "caldav",
				message: err instanceof Error ? err.message : String(err),
				capabilities: { eventsList: false, eventCreate: false, eventUpdate: false, eventDelete: false, freeBusyQuery: false },
			};
		}
	}

	async eventsList(params: EventsListParams): Promise<EventsListResult> {
		const client = await this.ensureClient();
		const calendar = await this.resolveCalendar(params.calendarId);

		const objects = await client.fetchCalendarObjects({
			calendar,
			timeRange: { start: params.from, end: params.to },
		});

		const events: CalendarEvent[] = objects.map((obj, idx) => parseVEvent(String(obj.data), String(obj.url), String(calendar.displayName ?? "default"), idx));
		const limit = params.limit ?? 50;
		return { events: events.slice(0, limit), totalCount: events.length };
	}

	async eventCreate(params: EventCreateParams): Promise<EventCreateResult> {
		const client = await this.ensureClient();
		const calendar = await this.resolveCalendar(params.calendarId);

		const uid = `nova-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const vcal = buildVCalendar(uid, params);

		await client.createCalendarObject({ calendar, filename: `${uid}.ics`, iCalString: vcal });

		const event: CalendarEvent = {
			id: uid,
			calendarId: params.calendarId,
			title: params.title,
			description: params.description,
			location: params.location,
			startAt: params.startAt,
			endAt: params.endAt,
			allDay: params.allDay ?? false,
			attendees: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		return { event };
	}

	async eventUpdate(params: EventUpdateParams): Promise<EventUpdateResult> {
		const client = await this.ensureClient();
		const calendar = this.calendars[0];
		if (!calendar) throw new ConnectorNotAvailableError("caldav", "No calendar available");

		const objects = await client.fetchCalendarObjects({ calendar });
		const target = objects.find((o) => o.url.includes(params.eventId) || o.data.includes(params.eventId));
		if (!target) throw new Error(`Event not found: ${params.eventId}`);

		let data = target.data;
		if (params.title) data = data.replace(/SUMMARY:.*/g, `SUMMARY:${params.title}`);
		if (params.startAt) data = data.replace(/DTSTART:.*/g, `DTSTART:${toICalDate(params.startAt)}`);
		if (params.endAt) data = data.replace(/DTEND:.*/g, `DTEND:${toICalDate(params.endAt)}`);
		if (params.description !== undefined) data = data.replace(/DESCRIPTION:.*/g, `DESCRIPTION:${params.description}`);
		if (params.location !== undefined) data = data.replace(/LOCATION:.*/g, `LOCATION:${params.location}`);

		await client.updateCalendarObject({ calendarObject: { ...target, data } });

		const event = parseVEvent(String(data), String(target.url), String(calendar.displayName ?? "default"), 0);
		event.id = params.eventId;
		return { event };
	}

	async eventDelete(params: EventDeleteParams): Promise<EventDeleteResult> {
		const client = await this.ensureClient();
		const calendar = this.calendars[0];
		if (!calendar) return { deleted: false };

		const objects = await client.fetchCalendarObjects({ calendar });
		const target = objects.find((o) => o.url.includes(params.eventId) || o.data.includes(params.eventId));
		if (!target) return { deleted: false };

		await client.deleteCalendarObject({ calendarObject: target });
		return { deleted: true };
	}

	async freeBusyQuery(params: FreeBusyQueryParams): Promise<FreeBusyQueryResult> {
		const result = await this.eventsList({
			from: params.from,
			to: params.to,
			calendarId: params.calendarIds?.[0],
		});

		const slots: FreeBusySlot[] = result.events.map((e) => ({
			startAt: e.startAt,
			endAt: e.endAt,
			status: "busy" as const,
		}));
		return { slots };
	}

	private async ensureClient(): Promise<DAVClient> {
		if (this.client) return this.client;
		try {
			this.client = (await createDAVClient({
				serverUrl: this.options.serverUrl,
				credentials: this.options.credentials,
				authMethod: this.options.authMethod ?? "Basic",
				defaultAccountType: "caldav",
			})) as unknown as DAVClient;
			this.calendars = await this.client.fetchCalendars();
			return this.client;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("401") || msg.includes("auth")) throw new ConnectorAuthError(msg);
			throw new ConnectorNotAvailableError("caldav", msg);
		}
	}

	private async resolveCalendar(calendarId?: string): Promise<DAVCalendar> {
		if (calendarId) {
			const found = this.calendars.find((c) => c.displayName === calendarId || c.url.includes(calendarId));
			if (found) return found;
		}
		if (this.calendars.length > 0) return this.calendars[0]!;
		throw new ConnectorNotAvailableError("caldav", "No calendars available");
	}
}

function parseVEvent(data: string, url: string, calendarId: string, _idx: number): CalendarEvent {
	const get = (key: string): string | undefined => {
		const match = data.match(new RegExp(`${key}[^:]*:(.+)`));
		return match?.[1]?.trim();
	};
	const now = new Date().toISOString();
	return {
		id: get("UID") ?? url,
		calendarId,
		title: get("SUMMARY") ?? "",
		description: get("DESCRIPTION"),
		location: get("LOCATION"),
		startAt: fromICalDate(get("DTSTART")) ?? now,
		endAt: fromICalDate(get("DTEND")) ?? now,
		allDay: false,
		attendees: [],
		createdAt: fromICalDate(get("CREATED")) ?? now,
		updatedAt: fromICalDate(get("LAST-MODIFIED")) ?? now,
	};
}

function toICalDate(iso: string): string {
	return iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
}

function fromICalDate(ical?: string): string | undefined {
	if (!ical) return undefined;
	const clean = ical.replace(/[TZ]/g, "").replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6Z");
	return clean.includes("-") ? clean : undefined;
}

function buildVCalendar(uid: string, params: EventCreateParams): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Nova//connector-skills//EN",
		"BEGIN:VEVENT",
		`UID:${uid}`,
		`SUMMARY:${params.title}`,
		`DTSTART:${toICalDate(params.startAt)}`,
		`DTEND:${toICalDate(params.endAt)}`,
	];
	if (params.description) lines.push(`DESCRIPTION:${params.description}`);
	if (params.location) lines.push(`LOCATION:${params.location}`);
	lines.push("END:VEVENT", "END:VCALENDAR");
	return lines.join("\r\n");
}
