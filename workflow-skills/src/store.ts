import type { WorkflowDefinition, WorkflowExecutionResult } from "./types.js";

export interface WorkflowRunSnapshot {
	readonly runId: string;
	readonly workflowId: string;
	readonly workflowVersion: string;
	readonly result: WorkflowExecutionResult;
	readonly persistedAt: string;
}

export interface WorkflowStoreHealth {
	readonly ok: boolean;
	readonly backend: "in_memory";
	readonly message: string;
}

export interface WorkflowStore {
	readonly backend: "in_memory";

	upsertWorkflowDefinition(definition: WorkflowDefinition): Promise<void>;
	getWorkflowDefinition(workflowId: string): Promise<WorkflowDefinition | undefined>;
	listWorkflowDefinitions(): Promise<readonly WorkflowDefinition[]>;
	deleteWorkflowDefinition(workflowId: string): Promise<boolean>;

	upsertRunSnapshot(snapshot: WorkflowRunSnapshot): Promise<void>;
	getRunSnapshot(runId: string): Promise<WorkflowRunSnapshot | undefined>;
	listRunSnapshots(workflowId?: string): Promise<readonly WorkflowRunSnapshot[]>;
	deleteRunSnapshot(runId: string): Promise<boolean>;

	health(): Promise<WorkflowStoreHealth>;
}

export class InMemoryWorkflowStore implements WorkflowStore {
	public readonly backend = "in_memory" as const;

	private readonly definitions = new Map<string, WorkflowDefinition>();
	private readonly snapshots = new Map<string, WorkflowRunSnapshot>();
	private readonly runIdsByWorkflowId = new Map<string, Set<string>>();

	public async upsertWorkflowDefinition(definition: WorkflowDefinition): Promise<void> {
		this.definitions.set(definition.id, { ...definition });
	}

	public async getWorkflowDefinition(workflowId: string): Promise<WorkflowDefinition | undefined> {
		const definition = this.definitions.get(workflowId);
		return definition ? { ...definition } : undefined;
	}

	public async listWorkflowDefinitions(): Promise<readonly WorkflowDefinition[]> {
		return [...this.definitions.values()].map((definition) => ({ ...definition }));
	}

	public async deleteWorkflowDefinition(workflowId: string): Promise<boolean> {
		return this.definitions.delete(workflowId);
	}

	public async upsertRunSnapshot(snapshot: WorkflowRunSnapshot): Promise<void> {
		this.snapshots.set(snapshot.runId, { ...snapshot });
		if (!this.runIdsByWorkflowId.has(snapshot.workflowId)) {
			this.runIdsByWorkflowId.set(snapshot.workflowId, new Set<string>());
		}
		this.runIdsByWorkflowId.get(snapshot.workflowId)?.add(snapshot.runId);
	}

	public async getRunSnapshot(runId: string): Promise<WorkflowRunSnapshot | undefined> {
		const snapshot = this.snapshots.get(runId);
		return snapshot ? { ...snapshot } : undefined;
	}

	public async listRunSnapshots(workflowId?: string): Promise<readonly WorkflowRunSnapshot[]> {
		if (workflowId === undefined) {
			return [...this.snapshots.values()].map((snapshot) => ({ ...snapshot }));
		}

		const runIds = this.runIdsByWorkflowId.get(workflowId);
		if (runIds === undefined) {
			return [];
		}

		const snapshots: WorkflowRunSnapshot[] = [];
		for (const runId of runIds) {
			const snapshot = this.snapshots.get(runId);
			if (snapshot !== undefined) {
				snapshots.push({ ...snapshot });
			}
		}
		return snapshots;
	}

	public async deleteRunSnapshot(runId: string): Promise<boolean> {
		const snapshot = this.snapshots.get(runId);
		if (snapshot === undefined) {
			return false;
		}
		const deleted = this.snapshots.delete(runId);
		if (!deleted) {
			return false;
		}
		const runIds = this.runIdsByWorkflowId.get(snapshot.workflowId);
		if (runIds !== undefined) {
			runIds.delete(runId);
			if (runIds.size === 0) {
				this.runIdsByWorkflowId.delete(snapshot.workflowId);
			}
		}
		return true;
	}

	public async health(): Promise<WorkflowStoreHealth> {
		return {
			ok: true,
			backend: "in_memory",
			message: "In-memory workflow store is available.",
		};
	}
}

export function createInMemoryWorkflowStore(): WorkflowStore {
	return new InMemoryWorkflowStore();
}
