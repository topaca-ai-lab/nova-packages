import type { OrchestrationEvent } from "./types.js";

export interface OrchestrationEventSink {
	publish(event: OrchestrationEvent): void | Promise<void>;
}

export interface EventSinkDeadLetterEntry {
	deadLetterId: string;
	event: OrchestrationEvent;
	sinkIndex: number;
	attempts: number;
	failedAt: string;
	errorMessage: string;
}

export interface OrchestrationDeadLetterSink {
	publish(entry: EventSinkDeadLetterEntry): void | Promise<void>;
}

export interface ReplayableDeadLetterSink extends OrchestrationDeadLetterSink {
	snapshot(limit?: number): EventSinkDeadLetterEntry[];
	ack(deadLetterIds: string[]): number;
	size(): number;
}

export type OrchestrationEventSubscriber = (event: OrchestrationEvent) => void;

export interface InMemoryEventSinkOptions {
	maxEvents?: number;
}

export interface InMemoryEventSnapshotOptions {
	limit?: number;
	jobId?: string;
	types?: OrchestrationEvent["type"][];
}

export interface InMemoryDeadLetterSinkOptions {
	maxEntries?: number;
}

export class InMemoryOrchestrationEventSink implements OrchestrationEventSink {
	private readonly maxEvents: number;
	private readonly events: OrchestrationEvent[] = [];
	private readonly subscribers = new Set<OrchestrationEventSubscriber>();

	constructor(options: InMemoryEventSinkOptions = {}) {
		this.maxEvents = validateMaxEvents(options.maxEvents);
	}

	publish(event: OrchestrationEvent): void {
		this.events.push(event);
		if (this.events.length > this.maxEvents) {
			this.events.splice(0, this.events.length - this.maxEvents);
		}
		for (const subscriber of this.subscribers) {
			subscriber(event);
		}
	}

	subscribe(subscriber: OrchestrationEventSubscriber): () => void {
		this.subscribers.add(subscriber);
		return () => {
			this.subscribers.delete(subscriber);
		};
	}

	snapshot(options: InMemoryEventSnapshotOptions = {}): OrchestrationEvent[] {
		const types = options.types ? new Set(options.types) : undefined;
		const filtered = this.events.filter((event) => {
			if (options.jobId && event.jobId !== options.jobId) {
				return false;
			}
			if (types && !types.has(event.type)) {
				return false;
			}
			return true;
		});

		if (typeof options.limit === "number") {
			if (!Number.isInteger(options.limit) || options.limit < 0) {
				throw new Error("snapshot limit must be a non-negative integer.");
			}
			return filtered.slice(Math.max(0, filtered.length - options.limit));
		}

		return [...filtered];
	}

	clear(): void {
		this.events.length = 0;
	}
}

export class InMemoryOrchestrationDeadLetterSink implements ReplayableDeadLetterSink {
	private readonly maxEntries: number;
	private readonly entries: EventSinkDeadLetterEntry[] = [];

	constructor(options: InMemoryDeadLetterSinkOptions = {}) {
		this.maxEntries = validateMaxEntries(options.maxEntries);
	}

	publish(entry: EventSinkDeadLetterEntry): void {
		this.entries.push(entry);
		if (this.entries.length > this.maxEntries) {
			this.entries.splice(0, this.entries.length - this.maxEntries);
		}
	}

	snapshot(limit?: number): EventSinkDeadLetterEntry[] {
		if (typeof limit === "number") {
			if (!Number.isInteger(limit) || limit < 0) {
				throw new Error("dead-letter snapshot limit must be a non-negative integer.");
			}
			return this.entries.slice(Math.max(0, this.entries.length - limit));
		}
		return [...this.entries];
	}

	ack(deadLetterIds: string[]): number {
		const target = new Set(deadLetterIds);
		const before = this.entries.length;
		if (target.size === 0) {
			return 0;
		}
		for (let i = this.entries.length - 1; i >= 0; i -= 1) {
			const current = this.entries[i];
			if (current && target.has(current.deadLetterId)) {
				this.entries.splice(i, 1);
			}
		}
		return before - this.entries.length;
	}

	size(): number {
		return this.entries.length;
	}

	clear(): void {
		this.entries.length = 0;
	}
}

function validateMaxEvents(maxEvents: number | undefined): number {
	if (maxEvents === undefined) {
		return 500;
	}
	if (!Number.isInteger(maxEvents) || maxEvents < 1) {
		throw new Error("maxEvents must be a positive integer.");
	}
	return maxEvents;
}

function validateMaxEntries(maxEntries: number | undefined): number {
	if (maxEntries === undefined) {
		return 500;
	}
	if (!Number.isInteger(maxEntries) || maxEntries < 1) {
		throw new Error("maxEntries must be a positive integer.");
	}
	return maxEntries;
}
