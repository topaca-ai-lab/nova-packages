# @topaca/orchestration-core

Core orchestration package for Nova job scheduling and execution lifecycle.

## Status

Phase 8 (adds health/stats APIs for store and orchestrator runtime).

## Planned Scope

- Cron and heartbeat triggers
- Job state machine
- Retry and backoff policies
- Persistence adapter interface
- Structured orchestration events
- SQLite persistence adapter
- Run-retention compaction (`maxRunsPerJob`, `maxAgeMs`)
- Schema migrations with version tracking
- Periodic retention compaction worker
- Built-in orchestrator metrics counters
- Store stats API (counts, status distribution, last compaction per job)
- Orchestrator health API (runtime + store snapshot)
- Configurable global concurrency limit (`maxConcurrentRuns`)
- Event sink interface (push) with in-memory sink + pull snapshot
- Event sink policy with retry/backoff and optional dead-letter sink
- Dead-letter replay API (`replayDeadLetters`) for controlled redelivery
- Replay guards: `maxReplayPerRun`, `jobId`, `sinkIndex`

## Development

```bash
npm run build
npm run check
```

## Minimal Usage

```ts
import { Orchestrator } from "@topaca/orchestration-core";

const orchestrator = new Orchestrator();

await orchestrator.registerJob(
	{
		id: "heartbeat:demo",
		name: "demo",
		trigger: { kind: "heartbeat", intervalMs: 30_000 },
		retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 2_000 },
	},
	async ({ signal }) => {
		if (signal.aborted) return;
		// execute task
	},
);

orchestrator.onEvent((event) => {
	console.log(event.type, event.jobId, event.runId);
});

await orchestrator.start();
await orchestrator.runNow("heartbeat:demo"); // optional manual run
orchestrator.stop();
```
