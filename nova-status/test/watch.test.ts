import assert from "node:assert/strict";
import test from "node:test";

import {
	computeNextRefreshAt,
	computeRefreshDelay,
	createNovaStatusWatchContract,
} from "../src/index.js";

test("createNovaStatusWatchContract normalizes defaults", () => {
	const contract = createNovaStatusWatchContract();
	assert.equal(contract.intervalMs, 2000);
	assert.equal(contract.immediate, true);
	assert.equal(contract.maxConsecutiveFailures, 5);
	assert.equal(contract.maxBackoffMultiplier, 8);
});

test("createNovaStatusWatchContract normalizes invalid inputs", () => {
	const contract = createNovaStatusWatchContract({
		intervalMs: 10,
		maxConsecutiveFailures: 0,
		maxBackoffMultiplier: 0,
	});
	assert.equal(contract.intervalMs, 2000);
	assert.equal(contract.maxConsecutiveFailures, 5);
	assert.equal(contract.maxBackoffMultiplier, 8);
});

test("computeRefreshDelay applies capped exponential backoff", () => {
	const contract = createNovaStatusWatchContract({
		intervalMs: 1000,
		maxConsecutiveFailures: 5,
		maxBackoffMultiplier: 8,
	});

	assert.equal(computeRefreshDelay(contract, 0), 1000);
	assert.equal(computeRefreshDelay(contract, 1), 2000);
	assert.equal(computeRefreshDelay(contract, 2), 4000);
	assert.equal(computeRefreshDelay(contract, 3), 8000);
	assert.equal(computeRefreshDelay(contract, 8), 8000);
});

test("computeNextRefreshAt returns deterministic timestamp", () => {
	const contract = createNovaStatusWatchContract({
		intervalMs: 1500,
		maxConsecutiveFailures: 3,
		maxBackoffMultiplier: 8,
	});
	const lastRefreshAt = new Date("2026-01-01T00:00:00.000Z");

	const nextWithoutFailure = computeNextRefreshAt(lastRefreshAt, contract, 0);
	assert.equal(nextWithoutFailure.toISOString(), "2026-01-01T00:00:01.500Z");

	const nextWithFailure = computeNextRefreshAt(lastRefreshAt, contract, 2);
	assert.equal(nextWithFailure.toISOString(), "2026-01-01T00:00:06.000Z");
});
