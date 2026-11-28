# Backend operations

This is the runbook for Penny's durable backend (`backend_v2`): background jobs, sync
post-processing, integrity/repair, backups, observability and the rollout switch.

## Rollout modes

`backend_v2` has three values, resolved in this order:

1. `PENNY_BACKEND_V2=off|shadow|on` (machine-wide override).
2. The workspace setting `backend_v2` (`PATCH /api/workspaces/:id { "backendV2": "on" }`).
3. Off.

- **off** — the original inline path. The worker stays idle.
- **shadow** — the inline path still runs; a shadow post-process job computes and audits what
  the durable path would do. No child jobs and no repairs are applied by shadow.
- **on** — sync saves enqueue `sync.post_process` atomically; the worker (or the manual SSE
  route, under a lease) runs the deterministic passes. AI and intelligence move to
  maintenance-lane child jobs.

New workspaces start `off`. Enabling a workspace queues one `reclassify.workspace`,
`integrity.check` and `intelligence.refresh`; after validation the default can be raised to
`on`. Roll back by setting the workspace to `off` (or the env override).

## Import migrations 088/089 (0.7.0)

- `088_import_dedup_account_identity.sql` adds `transactions.dedup_hash_legacy`, backfills it
  from the old hash, and indexes it. New imports hash the account identity into `dedup_hash`
  while keeping the old hash in the legacy column. It also adds `import_batches.post_commit_status`
  /`post_commit_error` and the `pending_file_cleanup` queue.
- `089_account_balance_identity.sql` rebuilds `account_balances` with one row per linked account
  and a separate legacy row per provider+number until the account is known. Duplicate linked
  rows keep the newest balance. **This migration is one-way:** an image rollback cannot write
  against the new partial indexes, so roll back by restoring the pre-migration database backup
  (the updater keeps the previous backup).
- A batch with `post_commit_status` of `pending`/`running`/`failed` is rerun by a client-token
  retry. `pending_file_cleanup` is swept after every undo; failed unlinks stay queued with an
  attempt count and error.


## Migration 082

`082_backend_jobs.sql` is additive. It creates:

| table | purpose |
| --- | --- |
| `jobs`, `job_attempts` | durable queue, lane/priority, leases, attempts, dead letters |
| `runtime_locks` | worker and sync mutexes, visible in ops status |
| `provider_health` | per-credential failure streak, cooldown, last error code |
| `metrics_daily` | day + name + labels rollups |
| `audit_log` | append-only money/job/admin audit |
| `insight_snapshots` | durable outputs of `intelligence.refresh` |
| `idempotency_keys` | `Idempotency-Key` replay/conflict state |

It also adds `sync_runs.post_processing_status`/`_error_code`,
`transactions.merchant_key`/`merchant_key_version`,
`transactions.category_confidence`/`category_reasons_json`, and the report/ops indexes.

The migration hook (`applyBackendV2`) canonicalizes rounding-level money drift, backfills V2
merchant keys (merging learned-key collisions by hit count and auditing each merge), and marks
historical sync runs as fully post-processed. Everything is idempotent.

## Jobs

- Lanes: `critical` (repair, post-process, sync, integrity) and `maintenance` (backups,
  folder scans, AI, intelligence, cleanup). One job per lane at a time; the lanes are
  independent, so a long AI run cannot block a sync.
- Ordering: `priority`, then `run_after`, then id. `sync.post_process` is priority 20 and
  `sync.run` 30, so a credential's post-process runs before the next credential sync.
- Retries: `sync.run` 15m/1h/4h (3 attempts); `sync.post_process` 1m/5m/30m (5); AI 15s/1m/5m;
  intelligence 5m/30m. A handler can mark an error `noRetry` (auth, 2FA, site change) to
  dead-letter immediately.
- Leases: 150s, heartbeat every 30s. An expired lease is requeued; on startup orphan attempts
  are closed and expired leases requeued. Shutdown releases the current job lease.
- Manual sync creates its post-process job already leased to `manual:<syncRunId>`; the route
  claims it immediately and forwards `post-process-step` events over SSE. If the browser dies,
  the worker resumes the job.
- Admin: `POST /api/ops/jobs/:id/retry` (dead only, resets attempts) and
  `POST /api/ops/jobs/:id/cancel` (queued/leased). Both require an admin when app access is on
  and write an audit row.
- Startup order: `instrumentation.ts` registers handlers, starts the worker, then the periodic
  schedule; the scheduler follows. One process holds `runtime_locks.worker`; another stands by
  and takes over after the lease expires.

## Sync

- The sync mutex is the `runtime_locks.sync` row (SQLite), not process memory, so two app
  processes cannot scrape at once. The manual SSE route heartbeats it while streaming.
- In `on` mode the daily scheduler enqueues one `sync.run` per credential
  (`sync.run:<credentialId>:<date>`). Jobs own retries; the scheduler stores no retry ids.
  In `off`/`shadow` the inline daily run remains.
- A sync run completes when data is saved. `post_processing_status` then moves
  `pending → running → completed|failed`. Sensitive caption data and the whole scrape are
  saved in one transaction; post-process steps checkpoint in `jobs.state_json`
  (`stepsDone`, `counts`) so an interrupted job resumes.
- Provider health: network/timeout/rate-limit failures back off and retry; auth, 2FA and
  site-change failures set a 24h cooldown. Scheduled jobs skip cooling credentials; manual
  sync bypasses the cooldown deliberately.

## Idempotency and money

- First-party mutations send `Idempotency-Key`. A replay returns the stored response with
  `Idempotent-Replay: true`; a different body under the same key is
  `409 idempotency_conflict`; a live key is `409 idempotency_in_progress`; abandoned keys are
  retried after 5 minutes and audited. Keys are pruned after 24h.
- `src/lib/money-contract.ts` rejects more than two decimals, non-safe magnitudes and junk at
  the boundary. Migration 082 only rewrites drift below half an agora; larger differences
  stay untouched for integrity suggestions.

## Integrity

`src/server/finance/integrity.ts` checks foreign keys, duplicate dedup groups, split sums,
category-kind mismatches, account mismatches, orphan import rows/jobs and stale pending rows.
`repair.data` applies only safe fixes (missing account id, auto category of the wrong kind,
stale pending flag, orphan job rows) and writes an audit row. Duplicates/merges remain
suggestions. `integrity.check` runs daily per enabled workspace.

## Backups, RPO/RTO

- Local: hourly `VACUUM INTO` snapshots in `<dataDir>/backups/hourly` (`penny-hourly-*.db`,
  owner-only, 24 kept). It skips below 500 MB free disk. `backup.check` runs hourly.
- Portable: the existing passphrase-encrypted offsite backup runs through `backup.check`;
  settings status is shown in ops status.
- Actual RPO: 1 hour local, 24 hours offsite. RTO measured by the drill: a local restore is
  seconds, and the target is under 10 minutes including a portable restore.
- Drill: `npm run restore:drill` builds a snapshot, restores it, exercises the portable
  encrypt/decrypt path and verifies quick_check, foreign keys, migration count and row counts.

## Observability

- `handle()` adds/propagates `X-Request-Id`, records `http_requests_total` and
  `http_request_duration_ms`, and includes `requestId` in error bodies.
- Structured JSON events go to stderr and `<dataDir>/logs/events.log` (1 MB rotation, 7 files,
  owner-only). Keys named password/secret/token/auth/key/cookie/credential are redacted.
  Descriptions and amounts are not logged.
- Metrics: jobs, job duration, sync runs, integrity violations, db busy, metric rollups in
  `metrics_daily` (90-day retention). `GET /api/ops/metrics?days=7` (admin).
- `GET /api/ops/status` (admin): migrations, DB/WAL size, quick_check, foreign keys, worker,
  sync lock, queue and dead letters, scheduler, backup ages, provider health, disk, recent
  error codes. `GET /api/diagnostics` also carries a short operations summary.
- Public readiness: `GET /api/health/ready` — cheap, no secrets, `Cache-Control: no-store`.
  `503` codes: `db_missing`, `db_unavailable`, `db_corrupt`, `migrations_pending`,
  `worker_stale` (only when the durable backend is active). A locked app is `ok` with
  `locked: true`. `/api/health` stays unchanged.

## Intelligence and performance

- Merchant normalization V2 (processor prefixes, legal suffixes, branch/store/date noise,
  Hebrew final forms, punctuation, aliases) is the write key; reads try V2 then V1 during the
  rollout. Rules and generic patterns normalize at comparison time.
- Category decisions return `{ categoryId, source, confidence, reasons, alternatives }`; rows
  below the 0.7 threshold are left for review. `category_origin`, `category_confidence` and
  `category_reasons_json` persist the explanation.
- Gates: `npm run test:intelligence` checks top-1 category accuracy (≥85%), dictionary-covered
  accuracy (≥95%), pairing precision/recall, recurring precision/recall and anomaly FP rate on
  the fixtures in `tests/fixtures/intelligence/rows.json` (608 labeled rows).
- Indexes: date/excluded, account+date, category+date, flow+date and merchant key. Verify with
  `npm run bench:backend` (100k rows, p95 ceiling 2s; prints the query plan).

## Pip (migration 083)

`083_pip.sql` is additive and local to the agent. It adds threads, messages, tool calls, memory, consent, feedback, briefings, agent runs, approvals and evaluation runs. Every table cascades from the workspace; messages and their children cascade from the thread.

- `pip_v2` is off by default. Turn it on per workspace or with `PENNY_PIP_V2=on`. `PENNY_PIP_KILL=1` disables chat and briefings everywhere.
- `POST /api/pip/chat` is a read-only SSE route. The planner may call only the versioned read tools; a write tool is not registered.
- Each tool result is validated by an output schema and stored as evidence with an as-of timestamp. The numeric verifier rejects a provider answer that contains a number not present in the tool results, and the deterministic answer is used instead.
- `pip.briefing` is a maintenance-lane job, queued daily per enabled workspace through the same scheduler. Shadow mode records the item count without persisting a visible briefing.
- `maintenance.cleanup` prunes messages after 90 days, expired or two-year-old memory, and agent runs after 180 days.
- `GET /api/ops/status` exposes seven-day run, fallback and failure counts. `pip_agent_runs` and `pip_tool_calls` carry per-run latency and tool duration.
- Consent is per workspace and provider. A non-local provider receives minimized facts only after consent; deterministic answers work without it.
- Runbook: [docs/pip-operations.md](pip-operations.md). Remote access: [docs/remote-access.md](remote-access.md).

## Routine checks

| cadence | check |
| --- | --- |
| hourly | `backup.check` (local snapshot + portable when due) |
| daily | `integrity.check`, `intelligence.refresh`, `pip.briefing`, `maintenance.cleanup` |
| on enable | reclassify, integrity, intelligence |
| weekly | ops status dead letters, worker lock heartbeat, backup ages |
| release | restore drill, backend bench, full test suite |
