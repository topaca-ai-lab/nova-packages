import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { okResponse, errorResponse } from "../src/envelope.ts";

describe("envelope", () => {
	it("okResponse builds a successful response", () => {
		const res = okResponse("mail", "inbox.list", { count: 5 }, 42, "trace-1");
		assert.equal(res.ok, true);
		assert.equal(res.skillId, "mail");
		assert.equal(res.action, "inbox.list");
		assert.deepStrictEqual(res.result, { count: 5 });
		assert.equal(res.durationMs, 42);
		assert.equal(res.traceId, "trace-1");
		assert.equal(res.error, undefined);
	});

	it("errorResponse builds a failed response", () => {
		const res = errorResponse(
			"calendar",
			"event.create",
			{ code: "AUTH_FAILED", message: "bad token", retryable: false },
			100,
		);
		assert.equal(res.ok, false);
		assert.equal(res.skillId, "calendar");
		assert.equal(res.error?.code, "AUTH_FAILED");
		assert.equal(res.error?.retryable, false);
		assert.equal(res.result, undefined);
	});

	it("okResponse works without optional traceId", () => {
		const res = okResponse("search", "web.search", [], 10);
		assert.equal(res.traceId, undefined);
		assert.equal(res.ok, true);
	});
});
