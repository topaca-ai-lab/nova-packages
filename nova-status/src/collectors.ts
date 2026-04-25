import { buildNovaStatusSnapshot } from "./rules.js";
import {
	deriveIssuesFromAgentStatus,
	deriveIssuesFromDependencyStatus,
	deriveIssuesFromDiagnosticsStatus,
	deriveIssuesFromSchedulerStatus,
} from "./integrations.js";
import type {
	AgentStatus,
	DependencyStatus,
	DiagnosticsStatus,
	NovaStatusCollector,
	NovaStatusIssue,
	NovaStatusSeverity,
	NovaStatusSnapshot,
	SchedulerStatus,
} from "./types.js";

export interface NovaStatusCollectors {
	readonly agent?: NovaStatusCollector<AgentStatus>;
	readonly scheduler?: NovaStatusCollector<SchedulerStatus>;
	readonly diagnostics?: NovaStatusCollector<DiagnosticsStatus>;
	readonly dependencies?: NovaStatusCollector<DependencyStatus>;
}

export interface CollectNovaStatusOptions {
	readonly collectors?: NovaStatusCollectors;
	readonly timeoutMs?: number;
	readonly now?: () => Date;
	readonly notes?: readonly string[];
	readonly issues?: readonly NovaStatusIssue[];
}

export interface CreateStaticCollectorOptions<TPayload> {
	readonly issues?: readonly NovaStatusIssue[];
	readonly latencyMs?: number;
	readonly timedOut?: boolean;
	readonly transform?: (payload: TPayload) => TPayload;
}

export interface CreateFailingCollectorOptions {
	readonly code?: string;
	readonly message?: string;
}

export async function collectNovaStatus(options: CollectNovaStatusOptions = {}): Promise<NovaStatusSnapshot> {
	const now = options.now ?? (() => new Date());
	const timeoutMs = normalizeTimeout(options.timeoutMs);

	const [agentResult, schedulerResult, diagnosticsResult, dependenciesResult] = await Promise.all([
		runCollectorForAgent(options.collectors?.agent, timeoutMs, now),
		runCollectorForScheduler(options.collectors?.scheduler, timeoutMs, now),
		runCollectorForDiagnostics(options.collectors?.diagnostics, timeoutMs, now),
		runCollectorForDependencies(options.collectors?.dependencies, timeoutMs, now),
	]);

	return buildNovaStatusSnapshot({
		now,
		agent: agentResult.payload,
		scheduler: schedulerResult.payload,
		diagnostics: diagnosticsResult.payload,
		dependencies: dependenciesResult.payload,
		issues: deduplicateIssues([
			...(options.issues ?? []),
			...agentResult.issues,
			...schedulerResult.issues,
			...diagnosticsResult.issues,
			...dependenciesResult.issues,
			...deriveIssuesFromAgentStatus(agentResult.payload),
			...deriveIssuesFromSchedulerStatus(schedulerResult.payload),
			...deriveIssuesFromDiagnosticsStatus(diagnosticsResult.payload),
			...deriveIssuesFromDependencyStatus(dependenciesResult.payload),
		]),
		notes: options.notes,
	});
}

export function createStaticCollector<TPayload>(
	domain: "agent" | "scheduler" | "diagnostics" | "dependencies",
	payload: TPayload,
	options: CreateStaticCollectorOptions<TPayload> = {},
): NovaStatusCollector<TPayload> {
	return async () => {
		const effectivePayload = options.transform ? options.transform(payload) : payload;
		return {
			domain,
			payload: effectivePayload,
			issues: options.issues ?? [],
			latencyMs: options.latencyMs ?? 0,
			timedOut: options.timedOut ?? false,
		};
	};
}

export function createFailingCollector<TPayload>(
	_domain: "agent" | "scheduler" | "diagnostics" | "dependencies",
	options: CreateFailingCollectorOptions = {},
): NovaStatusCollector<TPayload> {
	return async () => {
		const code = options.code ?? "collector_failed";
		const message = options.message ?? "Collector failed.";
		throw new Error(`${code}: ${message}`);
	};
}

async function runCollectorForAgent(
	collector: NovaStatusCollector<AgentStatus> | undefined,
	timeoutMs: number,
	now: () => Date,
): Promise<{ payload: AgentStatus; issues: readonly NovaStatusIssue[] }> {
	return runCollector<AgentStatus>({
		domain: "agent",
		collector,
		timeoutMs,
		now,
		fallbackPayload: {
			severity: "unknown",
			state: "unknown",
			message: "Agent status is unknown.",
		},
	});
}

async function runCollectorForScheduler(
	collector: NovaStatusCollector<SchedulerStatus> | undefined,
	timeoutMs: number,
	now: () => Date,
): Promise<{ payload: SchedulerStatus; issues: readonly NovaStatusIssue[] }> {
	return runCollector<SchedulerStatus>({
		domain: "scheduler",
		collector,
		timeoutMs,
		now,
		fallbackPayload: {
			severity: "unknown",
			heartbeatRunning: false,
			cronRunning: false,
			missedRuns: 0,
			message: "Scheduler status is unknown.",
		},
	});
}

async function runCollectorForDiagnostics(
	collector: NovaStatusCollector<DiagnosticsStatus> | undefined,
	timeoutMs: number,
	now: () => Date,
): Promise<{ payload: DiagnosticsStatus; issues: readonly NovaStatusIssue[] }> {
	return runCollector<DiagnosticsStatus>({
		domain: "diagnostics",
		collector,
		timeoutMs,
		now,
		fallbackPayload: {
			severity: "unknown",
			internalChecks: "unknown",
			extendedChecks: "unknown",
			message: "Diagnostics status is unknown.",
		},
	});
}

async function runCollectorForDependencies(
	collector: NovaStatusCollector<DependencyStatus> | undefined,
	timeoutMs: number,
	now: () => Date,
): Promise<{ payload: DependencyStatus; issues: readonly NovaStatusIssue[] }> {
	return runCollector<DependencyStatus>({
		domain: "dependencies",
		collector,
		timeoutMs,
		now,
		fallbackPayload: {
			severity: "unknown",
			orchestrationCore: "unknown",
			workflowSkills: "unknown",
			memoryCore: "unknown",
			connectorSkills: "unknown",
			message: "Dependency status is unknown.",
		},
	});
}

interface RunCollectorArgs<TPayload> {
	readonly domain: "agent" | "scheduler" | "diagnostics" | "dependencies";
	readonly collector: NovaStatusCollector<TPayload> | undefined;
	readonly timeoutMs: number;
	readonly now: () => Date;
	readonly fallbackPayload: TPayload;
}

async function runCollector<TPayload>(
	args: RunCollectorArgs<TPayload>,
): Promise<{ payload: TPayload; issues: readonly NovaStatusIssue[] }> {
	if (args.collector === undefined) {
		return {
			payload: args.fallbackPayload,
			issues: [createIssue(args.domain, "unknown_state", "unknown", `No ${args.domain} collector configured.`)],
		};
	}

	try {
		const result = await runWithTimeout(
			args.collector({
				timeoutMs: args.timeoutMs,
				now: args.now,
			}),
			args.timeoutMs,
		);
		return {
			payload: result.payload,
			issues: result.issues,
		};
	} catch (error) {
		if (error instanceof CollectorTimeoutError) {
			return {
				payload: args.fallbackPayload,
				issues: [
					createIssue(
						args.domain,
						"collector_timeout",
						"yellow",
						`${args.domain} collector timed out after ${args.timeoutMs}ms.`,
					),
				],
			};
		}

		const message = error instanceof Error ? error.message : String(error);
		return {
			payload: args.fallbackPayload,
			issues: [createIssue(args.domain, "collector_failed", "yellow", `${args.domain} collector failed: ${message}`)],
		};
	}
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutHandle: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_resolve, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new CollectorTimeoutError(timeoutMs));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutHandle !== undefined) {
			clearTimeout(timeoutHandle);
		}
	}
}

function normalizeTimeout(timeoutMs: number | undefined): number {
	if (timeoutMs === undefined) {
		return 1000;
	}
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
		return 1000;
	}
	return timeoutMs;
}

class CollectorTimeoutError extends Error {
	public constructor(timeoutMs: number) {
		super(`Collector timed out after ${timeoutMs}ms.`);
		this.name = "CollectorTimeoutError";
	}
}

function createIssue(
	domain: "agent" | "scheduler" | "diagnostics" | "dependencies",
	code: NovaStatusIssue["code"],
	severity: NovaStatusSeverity,
	message: string,
): NovaStatusIssue {
	return {
		code,
		domain,
		severity,
		message,
	};
}

function deduplicateIssues(issues: readonly NovaStatusIssue[]): readonly NovaStatusIssue[] {
	const map = new Map<string, NovaStatusIssue>();
	for (const issue of issues) {
		const key = `${issue.domain}::${issue.code}::${issue.message}`;
		if (!map.has(key)) {
			map.set(key, issue);
		}
	}
	return [...map.values()];
}
