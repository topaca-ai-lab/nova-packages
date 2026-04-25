import type { InMemoryWorkflowEventSink } from "./events.js";
import type { WorkflowRunSnapshot, WorkflowStore, WorkflowStoreHealth } from "./store.js";
import type { WorkflowExecutionResult, WorkflowRunStatus, WorkflowStepTrace } from "./types.js";

export interface WorkflowMetricsByWorkflow {
	readonly workflowId: string;
	readonly runCount: number;
	readonly successCount: number;
	readonly failedCount: number;
	readonly canceledCount: number;
	readonly successRate: number;
	readonly failureRate: number;
	readonly cancelRate: number;
}

export interface WorkflowMetricsSnapshot {
	readonly generatedAt: string;
	readonly runCount: number;
	readonly successCount: number;
	readonly failedCount: number;
	readonly canceledCount: number;
	readonly successRate: number;
	readonly failureRate: number;
	readonly cancelRate: number;
	readonly averageRunLatencyMs: number;
	readonly averageStepLatencyMs: number;
	readonly averageStepCount: number;
	readonly runsWithRetries: number;
	readonly byWorkflow: readonly WorkflowMetricsByWorkflow[];
}

export interface WorkflowDiagnosticsOptions {
	readonly store?: WorkflowStore;
	readonly eventSink?: InMemoryWorkflowEventSink;
	readonly workflowId?: string;
	readonly runLimit?: number;
	readonly now?: () => Date;
}

export interface WorkflowHealthSnapshot {
	readonly generatedAt: string;
	readonly ok: boolean;
	readonly store?: WorkflowStoreHealth;
	readonly eventSink?: ReturnType<InMemoryWorkflowEventSink["health"]>;
	readonly metrics: WorkflowMetricsSnapshot;
	readonly warnings: readonly string[];
}

export interface WorkflowFailureStepContext {
	readonly stepId: string;
	readonly status: WorkflowStepTrace["status"];
	readonly attempt: number;
	readonly errorMessage?: string;
	readonly durationMs?: number;
	readonly finishedAt?: string;
}

export interface WorkflowFailureContext {
	readonly runId: string;
	readonly workflowId: string;
	readonly workflowVersion: string;
	readonly status: Extract<WorkflowRunStatus, "failed" | "canceled">;
	readonly lastError?: string;
	readonly failedStep?: WorkflowFailureStepContext;
	readonly timeline: readonly WorkflowFailureStepContext[];
}

export function computeWorkflowMetricsFromSnapshots(
	snapshots: readonly WorkflowRunSnapshot[],
	now: () => Date = () => new Date(),
): WorkflowMetricsSnapshot {
	return computeWorkflowMetrics(
		snapshots.map((snapshot) => snapshot.result),
		now,
	);
}

export function computeWorkflowMetrics(
	results: readonly WorkflowExecutionResult[],
	now: () => Date = () => new Date(),
): WorkflowMetricsSnapshot {
	const runCount = results.length;
	const successCount = countByStatus(results, "succeeded");
	const failedCount = countByStatus(results, "failed");
	const canceledCount = countByStatus(results, "canceled");
	const runsWithRetries = countRunsWithRetries(results);
	const averageRunLatencyMs = averageNumber(results.map(getRunLatencyMs));
	const averageStepLatencyMs = averageNumber(results.flatMap((result) => result.steps.map((step) => step.durationMs)));
	const averageStepCount = averageNumber(results.map((result) => result.steps.length));

	const perWorkflow = new Map<string, WorkflowExecutionResult[]>();
	for (const result of results) {
		const workflowId = result.record.workflowId;
		if (!perWorkflow.has(workflowId)) {
			perWorkflow.set(workflowId, []);
		}
		perWorkflow.get(workflowId)?.push(result);
	}

	const byWorkflow = [...perWorkflow.entries()]
		.map(([workflowId, workflowResults]) => {
			const workflowRunCount = workflowResults.length;
			const workflowSuccessCount = countByStatus(workflowResults, "succeeded");
			const workflowFailedCount = countByStatus(workflowResults, "failed");
			const workflowCanceledCount = countByStatus(workflowResults, "canceled");

			return {
				workflowId,
				runCount: workflowRunCount,
				successCount: workflowSuccessCount,
				failedCount: workflowFailedCount,
				canceledCount: workflowCanceledCount,
				successRate: safeRate(workflowSuccessCount, workflowRunCount),
				failureRate: safeRate(workflowFailedCount, workflowRunCount),
				cancelRate: safeRate(workflowCanceledCount, workflowRunCount),
			};
		})
		.sort((a, b) => a.workflowId.localeCompare(b.workflowId));

	return {
		generatedAt: now().toISOString(),
		runCount,
		successCount,
		failedCount,
		canceledCount,
		successRate: safeRate(successCount, runCount),
		failureRate: safeRate(failedCount, runCount),
		cancelRate: safeRate(canceledCount, runCount),
		averageRunLatencyMs,
		averageStepLatencyMs,
		averageStepCount,
		runsWithRetries,
		byWorkflow,
	};
}

export async function getWorkflowHealthSnapshot(options: WorkflowDiagnosticsOptions = {}): Promise<WorkflowHealthSnapshot> {
	const now = options.now ?? (() => new Date());
	const warnings: string[] = [];

	const storeHealth = options.store ? await options.store.health() : undefined;
	if (storeHealth !== undefined && !storeHealth.ok) {
		warnings.push(`Store health check failed: ${storeHealth.message}`);
	}

	const eventSinkHealth = options.eventSink?.health();
	if (eventSinkHealth !== undefined && !eventSinkHealth.ok) {
		warnings.push(`Event sink health check failed: ${eventSinkHealth.message}`);
	}

	let snapshots: readonly WorkflowRunSnapshot[] = [];
	if (options.store !== undefined) {
		snapshots = await options.store.listRunSnapshots(options.workflowId);
	}
	if (options.runLimit !== undefined && Number.isInteger(options.runLimit) && options.runLimit >= 0) {
		snapshots = snapshots.slice(Math.max(0, snapshots.length - options.runLimit));
	}

	const metrics = computeWorkflowMetricsFromSnapshots(snapshots, now);
	const ok = (storeHealth?.ok ?? true) && (eventSinkHealth?.ok ?? true);

	return {
		generatedAt: now().toISOString(),
		ok,
		store: storeHealth,
		eventSink: eventSinkHealth,
		metrics,
		warnings,
	};
}

export function getWorkflowFailureContext(result: WorkflowExecutionResult): WorkflowFailureContext | undefined {
	if (result.record.status !== "failed" && result.record.status !== "canceled") {
		return undefined;
	}

	const timeline: WorkflowFailureStepContext[] = result.steps.map((step) => ({
		stepId: step.stepId,
		status: step.status,
		attempt: step.attempt,
		errorMessage: step.errorMessage,
		durationMs: step.durationMs,
		finishedAt: step.finishedAt,
	}));

	const failedStep = [...result.steps]
		.reverse()
		.find((step) => step.status === "failed" || step.status === "canceled");

	return {
		runId: result.record.runId,
		workflowId: result.record.workflowId,
		workflowVersion: result.record.workflowVersion,
		status: result.record.status,
		lastError: result.record.lastError,
		failedStep:
			failedStep === undefined
				? undefined
				: {
						stepId: failedStep.stepId,
						status: failedStep.status,
						attempt: failedStep.attempt,
						errorMessage: failedStep.errorMessage,
						durationMs: failedStep.durationMs,
						finishedAt: failedStep.finishedAt,
				  },
		timeline,
	};
}

function countByStatus(results: readonly WorkflowExecutionResult[], status: WorkflowRunStatus): number {
	return results.reduce((count, result) => count + (result.record.status === status ? 1 : 0), 0);
}

function getRunLatencyMs(result: WorkflowExecutionResult): number | undefined {
	if (result.record.startedAt === undefined || result.record.finishedAt === undefined) {
		return undefined;
	}
	const duration = Date.parse(result.record.finishedAt) - Date.parse(result.record.startedAt);
	return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

function averageNumber(values: readonly (number | undefined)[]): number {
	const defined = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
	if (defined.length === 0) {
		return 0;
	}
	const sum = defined.reduce((acc, value) => acc + value, 0);
	return sum / defined.length;
}

function countRunsWithRetries(results: readonly WorkflowExecutionResult[]): number {
	return results.reduce((count, result) => {
		const hasRetry = result.steps.some((step) => step.attempt > 0);
		return count + (hasRetry ? 1 : 0);
	}, 0);
}

function safeRate(part: number, total: number): number {
	if (total === 0) {
		return 0;
	}
	return part / total;
}
