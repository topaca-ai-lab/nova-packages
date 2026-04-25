import type { ConnectorCapabilityCheck } from "../envelope.js";
import type {
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
} from "../types/calendar.js";

export interface CalendarConnector {
	readonly skillId: "calendar";

	check(): Promise<ConnectorCapabilityCheck>;

	eventsList(params: EventsListParams, signal?: AbortSignal): Promise<EventsListResult>;
	eventCreate(params: EventCreateParams, signal?: AbortSignal): Promise<EventCreateResult>;
	eventUpdate(params: EventUpdateParams, signal?: AbortSignal): Promise<EventUpdateResult>;
	eventDelete(params: EventDeleteParams, signal?: AbortSignal): Promise<EventDeleteResult>;
	freeBusyQuery(params: FreeBusyQueryParams, signal?: AbortSignal): Promise<FreeBusyQueryResult>;
}
