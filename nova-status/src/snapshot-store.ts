import type { NovaStatusSeverity, NovaStatusSnapshot } from "./types.js";

export interface NovaStatusSnapshotStoreHealth {
	readonly ok: boolean;
	readonly backend: "in_memory";
	readonly snapshotCount: number;
	readonly maxSnapshots: number;
	readonly message: string;
}

export interface NovaStatusSnapshotStore {
	readonly backend: "in_memory";
	upsert(snapshot: NovaStatusSnapshot): Promise<void>;
	getByGeneratedAt(generatedAt: string): Promise<NovaStatusSnapshot | undefined>;
	list(options?: {
		readonly overall?: NovaStatusSeverity;
		readonly limit?: number;
	}): Promise<readonly NovaStatusSnapshot[]>;
	prune(maxSnapshots: number): Promise<number>;
	health(): Promise<NovaStatusSnapshotStoreHealth>;
}

export interface InMemoryNovaStatusSnapshotStoreOptions {
	readonly maxSnapshots?: number;
}

export class InMemoryNovaStatusSnapshotStore implements NovaStatusSnapshotStore {
	public readonly backend = "in_memory" as const;

	private readonly snapshots = new Map<string, NovaStatusSnapshot>();
	private readonly order: string[] = [];
	private readonly maxSnapshots: number;

	public constructor(options: InMemoryNovaStatusSnapshotStoreOptions = {}) {
		this.maxSnapshots = normalizeMaxSnapshots(options.maxSnapshots);
	}

	public async upsert(snapshot: NovaStatusSnapshot): Promise<void> {
		if (!this.snapshots.has(snapshot.generatedAt)) {
			this.order.push(snapshot.generatedAt);
		}
		this.snapshots.set(snapshot.generatedAt, snapshot);
		await this.prune(this.maxSnapshots);
	}

	public async getByGeneratedAt(generatedAt: string): Promise<NovaStatusSnapshot | undefined> {
		const snapshot = this.snapshots.get(generatedAt);
		return snapshot === undefined ? undefined : cloneSnapshot(snapshot);
	}

	public async list(options: { readonly overall?: NovaStatusSeverity; readonly limit?: number } = {}): Promise<readonly NovaStatusSnapshot[]> {
		const values = this.order
			.map((key) => this.snapshots.get(key))
			.filter((value): value is NovaStatusSnapshot => value !== undefined);

		const filtered =
			options.overall === undefined ? values : values.filter((snapshot) => snapshot.overall === options.overall);
		const limited =
			options.limit === undefined ? filtered : filtered.slice(Math.max(0, filtered.length - normalizeLimit(options.limit)));

		return limited.map(cloneSnapshot);
	}

	public async prune(maxSnapshots: number): Promise<number> {
		const safeMaxSnapshots = normalizeMaxSnapshots(maxSnapshots);
		const excess = this.order.length - safeMaxSnapshots;
		if (excess <= 0) {
			return 0;
		}

		const removed = this.order.splice(0, excess);
		for (const key of removed) {
			this.snapshots.delete(key);
		}
		return removed.length;
	}

	public async health(): Promise<NovaStatusSnapshotStoreHealth> {
		return {
			ok: true,
			backend: "in_memory",
			snapshotCount: this.order.length,
			maxSnapshots: this.maxSnapshots,
			message: "In-memory nova-status snapshot store is available.",
		};
	}
}

export function createInMemoryNovaStatusSnapshotStore(
	options: InMemoryNovaStatusSnapshotStoreOptions = {},
): NovaStatusSnapshotStore {
	return new InMemoryNovaStatusSnapshotStore(options);
}

function normalizeMaxSnapshots(value: number | undefined): number {
	if (value === undefined) {
		return 500;
	}
	if (!Number.isInteger(value) || value < 1) {
		return 500;
	}
	return value;
}

function normalizeLimit(value: number): number {
	if (!Number.isInteger(value) || value < 1) {
		return 1;
	}
	return value;
}

function cloneSnapshot(snapshot: NovaStatusSnapshot): NovaStatusSnapshot {
	return {
		...snapshot,
		issues: [...snapshot.issues],
		notes: snapshot.notes ? [...snapshot.notes] : undefined,
		agent: { ...snapshot.agent },
		scheduler: { ...snapshot.scheduler },
		diagnostics: { ...snapshot.diagnostics },
		dependencies: { ...snapshot.dependencies },
	};
}
