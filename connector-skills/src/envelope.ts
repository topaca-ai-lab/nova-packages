export type IsoTimestamp = string;

/**
 * Unified request envelope for all connector skills.
 * Designed for small-model compatibility: flat params, no nested optionals.
 */
export interface SkillRequest<TParams = unknown> {
	skillId: string;
	action: string;
	params: TParams;
	traceId?: string;
	signal?: AbortSignal;
}

/**
 * Unified response envelope for all connector skills.
 */
export interface SkillResponse<TResult = unknown> {
	skillId: string;
	action: string;
	ok: boolean;
	result?: TResult;
	error?: SkillError;
	durationMs: number;
	traceId?: string;
}

/**
 * Structured error payload inside a SkillResponse.
 * Flat taxonomy with max 5 codes per skill family.
 */
export interface SkillError {
	code: string;
	message: string;
	retryable: boolean;
	details?: Record<string, unknown>;
}

/**
 * Capability self-check result for a connector skill family.
 */
export interface ConnectorCapabilityCheck {
	skillId: string;
	available: boolean;
	backend: string;
	message?: string;
	capabilities: Record<string, boolean>;
}

/**
 * Helper to build a successful SkillResponse.
 */
export function okResponse<TResult>(
	skillId: string,
	action: string,
	result: TResult,
	durationMs: number,
	traceId?: string,
): SkillResponse<TResult> {
	return { skillId, action, ok: true, result, durationMs, traceId };
}

/**
 * Helper to build a failed SkillResponse.
 */
export function errorResponse(
	skillId: string,
	action: string,
	error: SkillError,
	durationMs: number,
	traceId?: string,
): SkillResponse<never> {
	return { skillId, action, ok: false, error, durationMs, traceId };
}
