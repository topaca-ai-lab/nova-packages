import { describe, expect, it } from "vitest";
import { InMemoryOrchestrationDeadLetterSink, InMemoryOrchestrationEventSink } from "../src/index.js";
import type { OrchestrationEvent } from "../src/types.js";

function eventAt(at: string, type: OrchestrationEvent["type"], jobId: string): OrchestrationEvent {
	return { at, type, jobId };
}

describe("InMemoryOrchestrationEventSink", () => {
	it("stores and filters event snapshots", () => {
		const sink = new InMemoryOrchestrationEventSink({ maxEvents: 3 });
		sink.publish(eventAt("2026-04-25T10:00:00.000Z", "job_registered", "job-a"));
		sink.publish(eventAt("2026-04-25T10:00:01.000Z", "run_queued", "job-a"));
		sink.publish(eventAt("2026-04-25T10:00:02.000Z", "run_started", "job-b"));
		sink.publish(eventAt("2026-04-25T10:00:03.000Z", "run_succeeded", "job-b"));

		const all = sink.snapshot();
		expect(all).toHaveLength(3);
		expect(all.map((e) => e.type)).toEqual(["run_queued", "run_started", "run_succeeded"]);

		const filtered = sink.snapshot({ jobId: "job-b", types: ["run_started", "run_succeeded"] });
		expect(filtered.map((e) => e.type)).toEqual(["run_started", "run_succeeded"]);

		const limited = sink.snapshot({ limit: 1 });
		expect(limited).toHaveLength(1);
		expect(limited[0]?.type).toBe("run_succeeded");
	});

	it("supports subscriptions and unsubscribe", () => {
		const sink = new InMemoryOrchestrationEventSink();
		const received: OrchestrationEvent[] = [];
		const unsubscribe = sink.subscribe((event) => {
			received.push(event);
		});

		sink.publish(eventAt("2026-04-25T10:00:00.000Z", "run_queued", "job-a"));
		unsubscribe();
		sink.publish(eventAt("2026-04-25T10:00:01.000Z", "run_started", "job-a"));

		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("run_queued");
	});
});

describe("InMemoryOrchestrationDeadLetterSink", () => {
	it("stores and limits dead-letter entries", () => {
		const deadLetterSink = new InMemoryOrchestrationDeadLetterSink({ maxEntries: 2 });
		deadLetterSink.publish({
			deadLetterId: "dlq-1",
			event: eventAt("2026-04-25T10:00:00.000Z", "run_failed", "job-a"),
			sinkIndex: 0,
			attempts: 2,
			failedAt: "2026-04-25T10:00:00.000Z",
			errorMessage: "fail-a",
		});
		deadLetterSink.publish({
			deadLetterId: "dlq-2",
			event: eventAt("2026-04-25T10:00:01.000Z", "run_failed", "job-b"),
			sinkIndex: 1,
			attempts: 3,
			failedAt: "2026-04-25T10:00:01.000Z",
			errorMessage: "fail-b",
		});
		deadLetterSink.publish({
			deadLetterId: "dlq-3",
			event: eventAt("2026-04-25T10:00:02.000Z", "run_failed", "job-c"),
			sinkIndex: 2,
			attempts: 1,
			failedAt: "2026-04-25T10:00:02.000Z",
			errorMessage: "fail-c",
		});

		const entries = deadLetterSink.snapshot();
		expect(entries).toHaveLength(2);
		expect(entries.map((entry) => entry.event.jobId)).toEqual(["job-b", "job-c"]);
		expect(deadLetterSink.snapshot(1)[0]?.event.jobId).toBe("job-c");
		expect(deadLetterSink.size()).toBe(2);
		expect(deadLetterSink.ack(["dlq-3"])).toBe(1);
		expect(deadLetterSink.size()).toBe(1);
	});
});
