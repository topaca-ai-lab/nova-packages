/**
 * Base error for all connector skill failures.
 */
export class ConnectorSkillError extends Error {
	readonly code: string;
	readonly retryable: boolean;
	readonly details?: Record<string, unknown>;

	constructor(code: string, message: string, retryable: boolean, details?: Record<string, unknown>) {
		super(message);
		this.name = "ConnectorSkillError";
		this.code = code;
		this.retryable = retryable;
		this.details = details;
	}
}

/**
 * Authentication or authorization failure.
 */
export class ConnectorAuthError extends ConnectorSkillError {
	constructor(message: string, details?: Record<string, unknown>) {
		super("AUTH_FAILED", message, false, details);
		this.name = "ConnectorAuthError";
	}
}

/**
 * Operation timed out.
 */
export class ConnectorTimeoutError extends ConnectorSkillError {
	readonly timeoutMs: number;

	constructor(timeoutMs: number, message?: string, details?: Record<string, unknown>) {
		super("TIMEOUT", message ?? `Operation timed out after ${timeoutMs}ms`, true, details);
		this.name = "ConnectorTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}

/**
 * Backend or service not available.
 */
export class ConnectorNotAvailableError extends ConnectorSkillError {
	readonly backend: string;

	constructor(backend: string, message?: string, details?: Record<string, unknown>) {
		super("NOT_AVAILABLE", message ?? `Backend not available: ${backend}`, true, details);
		this.name = "ConnectorNotAvailableError";
		this.backend = backend;
	}
}

/**
 * Invalid request parameters.
 */
export class ConnectorValidationError extends ConnectorSkillError {
	readonly field?: string;

	constructor(message: string, field?: string, details?: Record<string, unknown>) {
		super("VALIDATION_FAILED", message, false, details);
		this.name = "ConnectorValidationError";
		this.field = field;
	}
}
