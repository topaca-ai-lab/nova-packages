import type { OrchestrationStore, RunRetentionPolicy } from "./store.js";

export interface RetentionCompactionSummary {
	jobsScanned: number;
	jobsPruned: number;
	runsPruned: number;
	at: string;
}

export interface RetentionCompactionWorkerOptions {
	intervalMs?: number;
	now?: () => Date;
	onCycle?: (summary: RetentionCompactionSummary) => void;
}

export class RetentionCompactionWorker {
	private readonly store: OrchestrationStore;
	private readonly retention: Omit<RunRetentionPolicy, "now">;
	private readonly intervalMs: number;
	private readonly now: () => Date;
	private readonly onCycle?: (summary: RetentionCompactionSummary) => void;
	private timer: NodeJS.Timeout | undefined;
	private running = false;

	constructor(
		store: OrchestrationStore,
		retention: Omit<RunRetentionPolicy, "now">,
		options: RetentionCompactionWorkerOptions = {},
	) {
		this.store = store;
		this.retention = retention;
		this.intervalMs = options.intervalMs ?? 5 * 60_000;
		this.now = options.now ?? (() => new Date());
		this.onCycle = options.onCycle;
	}

	async runOnce(): Promise<RetentionCompactionSummary> {
		const jobs = await this.store.listJobs();
		let jobsPruned = 0;
		let runsPruned = 0;

		for (const job of jobs) {
			const deleted = await this.store.pruneRuns(job.id, {
				...this.retention,
				now: this.now(),
			});
			if (deleted > 0) {
				jobsPruned += 1;
				runsPruned += deleted;
			}
		}

		const summary: RetentionCompactionSummary = {
			jobsScanned: jobs.length,
			jobsPruned,
			runsPruned,
			at: this.now().toISOString(),
		};
		this.onCycle?.(summary);
		return summary;
	}

	start(): void {
		if (this.timer) {
			return;
		}

		this.timer = setInterval(() => {
			void this.tick();
		}, this.intervalMs);
	}

	stop(): void {
		if (!this.timer) {
			return;
		}
		clearInterval(this.timer);
		this.timer = undefined;
	}

	private async tick(): Promise<void> {
		if (this.running) {
			return;
		}

		this.running = true;
		try {
			await this.runOnce();
		} finally {
			this.running = false;
		}
	}
}

export async function runRetentionCompactionOnce(
	store: OrchestrationStore,
	retention: Omit<RunRetentionPolicy, "now">,
	now: () => Date = () => new Date(),
): Promise<RetentionCompactionSummary> {
	const worker = new RetentionCompactionWorker(store, retention, { now });
	return worker.runOnce();
}
