export interface NovaStatusWatchOptions {
	readonly intervalMs?: number;
	readonly immediate?: boolean;
	readonly maxConsecutiveFailures?: number;
	readonly maxBackoffMultiplier?: number;
}

export interface NovaStatusWatchContract {
	readonly intervalMs: number;
	readonly immediate: boolean;
	readonly maxConsecutiveFailures: number;
	readonly maxBackoffMultiplier: number;
}

export function createNovaStatusWatchContract(options: NovaStatusWatchOptions = {}): NovaStatusWatchContract {
	return {
		intervalMs: normalizeInterval(options.intervalMs),
		immediate: options.immediate ?? true,
		maxConsecutiveFailures: normalizeConsecutiveFailures(options.maxConsecutiveFailures),
		maxBackoffMultiplier: normalizeBackoffMultiplier(options.maxBackoffMultiplier),
	};
}

export function computeNextRefreshAt(
	lastRefreshAt: Date,
	contract: NovaStatusWatchContract,
	consecutiveFailureCount = 0,
): Date {
	const delay = computeRefreshDelay(contract, consecutiveFailureCount);
	return new Date(lastRefreshAt.getTime() + delay);
}

export function computeRefreshDelay(contract: NovaStatusWatchContract, consecutiveFailureCount = 0): number {
	if (!Number.isInteger(consecutiveFailureCount) || consecutiveFailureCount <= 0) {
		return contract.intervalMs;
	}

	const cappedFailures = Math.min(consecutiveFailureCount, contract.maxConsecutiveFailures);
	const multiplier = Math.min(2 ** cappedFailures, contract.maxBackoffMultiplier);
	return contract.intervalMs * multiplier;
}

function normalizeInterval(intervalMs: number | undefined): number {
	if (intervalMs === undefined) {
		return 2000;
	}
	if (!Number.isInteger(intervalMs) || intervalMs < 100) {
		return 2000;
	}
	return intervalMs;
}

function normalizeConsecutiveFailures(value: number | undefined): number {
	if (value === undefined) {
		return 5;
	}
	if (!Number.isInteger(value) || value < 1) {
		return 5;
	}
	return value;
}

function normalizeBackoffMultiplier(value: number | undefined): number {
	if (value === undefined) {
		return 8;
	}
	if (!Number.isInteger(value) || value < 1) {
		return 8;
	}
	return value;
}
