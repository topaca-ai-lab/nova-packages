import type { IsoTimestamp } from "../envelope.js";

// --- Calendar Types (CalDAV + ICS) ---

export interface CalendarEvent {
	id: string;
	calendarId: string;
	title: string;
	description?: string;
	location?: string;
	startAt: IsoTimestamp;
	endAt: IsoTimestamp;
	allDay: boolean;
	recurrence?: string;
	attendees: readonly CalendarAttendee[];
	createdAt: IsoTimestamp;
	updatedAt: IsoTimestamp;
}

export interface CalendarAttendee {
	name?: string;
	email: string;
	status: "accepted" | "declined" | "tentative" | "pending";
}

export interface CalendarInfo {
	id: string;
	name: string;
	color?: string;
	writable: boolean;
}

// --- Action Params ---

export interface EventsListParams {
	from: string;
	to: string;
	calendarId?: string;
	limit?: number;
}

export interface EventCreateParams {
	calendarId: string;
	title: string;
	startAt: string;
	endAt: string;
	description?: string;
	location?: string;
	allDay?: boolean;
}

export interface EventUpdateParams {
	eventId: string;
	title?: string;
	startAt?: string;
	endAt?: string;
	description?: string;
	location?: string;
}

export interface EventDeleteParams {
	eventId: string;
}

export interface FreeBusyQueryParams {
	from: string;
	to: string;
	calendarIds?: readonly string[];
}

// --- Action Results ---

export interface EventsListResult {
	events: readonly CalendarEvent[];
	totalCount: number;
}

export interface EventCreateResult {
	event: CalendarEvent;
}

export interface EventUpdateResult {
	event: CalendarEvent;
}

export interface EventDeleteResult {
	deleted: boolean;
}

export interface FreeBusySlot {
	startAt: IsoTimestamp;
	endAt: IsoTimestamp;
	status: "busy" | "free";
}

export interface FreeBusyQueryResult {
	slots: readonly FreeBusySlot[];
}
