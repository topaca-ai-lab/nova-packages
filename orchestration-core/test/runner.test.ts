import { describe, expect, it } from "vitest";
import { JobRunCanceledError, JobRunTimeoutError, runJob } from "../src/index.js";
import type { JobDefinition } from "../src/types.js";

function createJob(maxRetries = 0): JobDefinition {
	return {
		id: "job-1",
		name: "example",
		trigger: { kind: "heartbeat", intervalMs: 1000 },
		retry: {
			maxRetries,
			baseDelayMs: 100,
			maxDelayMs: 1000,
		},
	};
}

describe("runJob", () => {
	it("succeeds on first attempt", async () => {
		const result = await runJob(createJob(0), async () => {});
		expect(result.record.status).toBe("succeeded");
		expect(result.record.attempt).toBe(0);
		expect(result.events.map((e) => e.type)).toEqual(["run_queued", "run_started", "run_succeeded"]);
	});

	it("retries on failures and then succeeds", async () => {
		const delays: number[] = [];
		let calls = 0;
		const result = await runJob(
			createJob(2),
			async () => {
				calls += 1;
				if (calls < 3) {
					throw new Error(`fail-${calls}`);
				}
			},
			{
				sleep: async (ms: number) => {
					delays.push(ms);
				},
			},
		);

		expect(result.record.status).toBe("succeeded");
		expect(result.record.attempt).toBe(2);
		expect(calls).toBe(3);
		expect(delays).toEqual([100, 200]);
	});

	it("stops with failed status when retries are exhausted", async () => {
		let calls = 0;
		const result = await runJob(
			createJob(1),
			async () => {
				calls += 1;
				throw new Error("always fails");
			},
			{
				sleep: async () => {},
			},
		);

		expect(result.record.status).toBe("failed");
		expect(result.record.attempt).toBe(1);
		expect(calls).toBe(2);
		expect(result.record.lastError).toContain("always fails");
	});

	it("returns canceled when aborted before execution starts", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await runJob(createJob(0), async () => {}, {
			signal: controller.signal,
		});

		expect(result.record.status).toBe("canceled");
		expect(result.events.map((e) => e.type)).toEqual(["run_queued", "run_canceled"]);
	});

	it("fails with timeout error when handler exceeds timeout", async () => {
		const result = await runJob(
			createJob(0),
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
			},
			{
				timeoutMs: 1,
			},
		);

		expect(result.record.status).toBe("failed");
		expect(result.record.lastError).toContain(new JobRunTimeoutError(1).message);
	});

	it("returns canceled when aborted during execution", async () => {
		const controller = new AbortController();
		const resultPromise = runJob(
			createJob(0),
			async ({ signal }) => {
				await new Promise<void>((_, reject) => {
					const onAbort = (): void => {
						reject(new JobRunCanceledError("aborted"));
					};
					signal.addEventListener("abort", onAbort, { once: true });
				});
			},
			{ signal: controller.signal },
		);

		controller.abort();
		const result = await resultPromise;

		expect(result.record.status).toBe("canceled");
		expect(result.events.map((e) => e.type)).toContain("run_canceled");
	});
});
