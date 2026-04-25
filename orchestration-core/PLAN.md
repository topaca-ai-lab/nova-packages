# orchestration-core: Implementation Plan (v0)

## Objective
Build a reusable orchestration package for Nova that manages recurring and event-driven jobs with deterministic execution, retry/backoff, state tracking, and observability.

## Scope for First Package (MVP)
- Job registration and validation
- Two trigger types:
  - `cron` schedule
  - `heartbeat` interval
- Execution lifecycle:
  - `queued -> running -> succeeded | failed | canceled`
- Retry policy:
  - max retries
  - exponential backoff
- Persistence interface (adapter-based)
- In-memory reference adapter
- Structured telemetry/events

## Out of Scope (MVP)
- Distributed orchestration / leader election
- Multi-node locking
- External queue systems
- UI layer
- Deep connector-specific logic (Telegram, Mail, etc.)

---

## Architecture

## 1) Core Modules
1. `scheduler`
- Calculates next run time from trigger definition
- Supports cron + heartbeat

2. `runner`
- Executes job handlers
- Applies timeout, cancellation, retry policy

3. `state-machine`
- Enforces valid status transitions
- Stores attempts, timestamps, last error

4. `store`
- Interface for persistence adapters
- MVP adapter: in-memory

5. `events`
- Emits typed lifecycle events for logs/metrics

## 2) Contracts
- `JobDefinition`
- `Trigger` (`cron` | `heartbeat`)
- `RetryPolicy`
- `ExecutionContext`
- `ExecutionRecord`
- `OrchestrationEvent`

## 3) API Shape (initial)
- `registerJob(definition)`
- `start()`
- `stop()`
- `runNow(jobId)`
- `cancel(jobId, runId)`
- `getJob(jobId)`
- `listJobs()`
- `listRuns(jobId)`

---

## Delivery Phases

## Phase 0 - Package Skeleton
- Create package structure
- Add TypeScript config/build scripts
- Add lint/typecheck integration
- Define public exports

Exit:
- Package builds and is importable

## Phase 1 - Domain Contracts + State Machine
- Implement types and schema guards
- Implement lifecycle transitions with tests

Exit:
- Invalid transitions rejected
- Transition tests green

## Phase 2 - Scheduler (Cron + Heartbeat)
- Implement trigger parsing/validation
- Compute next run timestamps deterministically

Exit:
- Time-based scheduler tests green

## Phase 3 - Runner + Retry/Backoff
- Execute handlers with timeout/cancel support
- Add retry with bounded exponential backoff

Exit:
- Failure/retry scenarios deterministic in tests

## Phase 4 - Store Adapter + In-Memory Backend
- Define persistence interface
- Implement in-memory store for MVP

Exit:
- Restart-safe behavior not required yet
- Store contract tests green

## Phase 5 - Telemetry + API Hardening
- Emit typed lifecycle events
- Add stable error taxonomy
- Document API usage

Exit:
- End-to-end tests for complete job lifecycle

---

## Testing Strategy
- Unit tests for each module
- Deterministic clock mocking for scheduler/runner
- Regression tests for:
  - retry exhaustion
  - cancellation during run
  - missed heartbeat handling
- Contract tests for store adapter compliance

## Initial Success Criteria
- 100% deterministic tests for scheduler and retry logic
- No invalid lifecycle transition possible through public API
- Stable event stream for external observability
- `orchestration-core` can run multiple jobs concurrently with isolation

---

## Integration Path (After MVP)
1. Integrate with `heartbeat-cron-core` skill
2. Add persistent SQL store adapter
3. Add job-level concurrency limits and priorities
4. Add dead-letter queue abstraction
5. Add distributed lock adapter (optional)

---

## Open Decisions
1. Cron parser dependency vs. custom minimal parser
2. Global concurrency limit defaults
3. Retention policy for run history
4. Event sink interface (pull vs push)

