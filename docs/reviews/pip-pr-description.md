# Pip v2: grounded household agent

## Summary

This PR adds Pip, an evidence-first household finance agent.

Pip is off by default. When `pip_v2` is on, `/ask` and a global dock answer questions from a versioned read-only tool registry. Every answer carries evidence, an as-of timestamp and a deterministic fallback. A configured provider may phrase the answer only after consent and only if every number matches the tool results.

Remote access is not part of this PR.

## What changed

### Data and safety

- Additive migration `083_pip` with threads, messages, tool calls, explicit memory, consent, feedback, briefings, agent runs, approvals and evaluation runs.
- Export, wipe, retention and foreign-key checks cover the new tables.
- Read-only tool registry with Zod input/output schemas; no write action is registered.

### Agent

- Deterministic bilingual planner over cash, spending, income, budgets, forecast, goals, recurring, fees, net worth, pension, insurance, planned, insights, sync, categories, rules, transactions, knowledge and whitelisted calculators.
- Deterministic answer builder and numeric verifier.
- Optional provider path with minimized facts, per-workspace consent and a fallback on any failure or unverified number.
- SSE chat with `meta`, `tool`, `evidence`, `token`, `done` and `error` events.

### Briefing and operations

- `pip.briefing` daily maintenance job, in-app persistence, optional Telegram delivery and at-most-once delivery per day.
- `/api/ops/status` and `/api/diagnostics` include Pip mode, kill switch, runs, fallbacks and failures.
- Ops-only planner/red-team evaluation and kill switch.

### UI

- Global Pip dock with a keyboard shortcut, history, suggested questions, evidence cards, "what Pip sees", consent, chat feedback, memory view/delete, briefing feedback and a daily briefing.
- `/ask` uses Pip when enabled and keeps the old deterministic box when off.
- Hebrew and English copy.

### Docs and review

- Strategy docs, the Pip ADR, Pip operations and testing runbooks, gap register, review and this description.
- Anonymity check (`npm run check:anonymity`).
- Pip suite (`npm run test:pip`).

## Validation

```text
tsc --noEmit                              pass
eslint --max-warnings 0 src tests scripts e2e   pass
knip                                      only the existing .css hint
prettier --check                          pass
vitest run                                275 files passed, 1 skipped; 1756 tests passed
next build                                compiled, typechecked and generated the routes
```

The Pip suite includes migration/cascade, calculators, 35 planner tasks and red-team prompts, numeric verification, every read tool against SQLite, a real agent turn, a mocked provider rejection/acceptance, chat SSE and translation parity.

## Rollout

1. Merge with `pip_v2` off.
2. Run the migration on a copy and confirm the restore drill.
3. Enable `pip_v2` for one workspace and ask the golden questions.
4. Watch `/api/ops/status` for fallbacks and failures before a broader enablement.

## Rollback

- `pip_v2=off` or `PENNY_PIP_V2=off` returns `/ask` to the old deterministic box and removes the dock.
- `PENNY_PIP_KILL=1` or the admin kill-switch route disables chat and briefings without deleting data.
- The migration is additive; no backfill is required.

## Residual risk

- No live provider tool selection; the model phrases, the deterministic planner chooses.
- No browser e2e for the dock yet.
- Token cost is estimated until a provider returns usage.
- Memory management is view/delete plus explicit remember; broader memory editing is deferred.
- Write actions remain deferred.

## Checklist

- [x] Migration and cascade test
- [x] Money uses two-decimal storage and formatted display
- [x] No write tool reachable from chat
- [x] Provider consent and minimized facts
- [x] Numeric verifier with deterministic fallback
- [x] Export, wipe and retention
- [x] Ops metrics and kill switch
- [x] Hebrew and English copy
- [x] Docs, ADR, anonymity check and review
