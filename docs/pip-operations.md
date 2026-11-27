# Pip operations

Pip is the evidence-first household agent. This page is the runbook for enabling, observing, evaluating and disabling it.

## Flags

| Flag | Where | Effect |
| --- | --- | --- |
| `pip_v2` | workspace setting or `PENNY_PIP_V2` | `off` keeps the old ask box; `on` enables Pip chat, briefing and the dock |
| `pip_kill_switch` | global setting or `PENNY_PIP_KILL=1` | Disables chat and briefings without deleting data |
| provider consent | `pip_consents` | Allows a non-local provider to receive minimized facts |

Precedence: environment, workspace setting, global setting. The kill switch always wins.

## Data

Migration `083_pip` adds:

- `pip_threads`, `pip_messages`, `pip_tool_calls`
- `pip_memory`, `pip_consents`, `pip_feedback`
- `pip_briefings`, `pip_agent_runs`, `pip_approvals`, `pip_eval_runs`

All tables cascade from the workspace. Messages cascade from the thread. Tool calls and feedback cascade from the message or thread.

Retention is applied by `maintenance.cleanup`:

- messages older than 90 days;
- expired memory and memory untouched for two years;
- agent runs older than 180 days;
- briefings and evaluation runs older than 365 days.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/pip/status` | flag, provider, consent and scopes |
| POST | `/api/pip/chat` | SSE chat; events `meta`, `tool`, `evidence`, `token`, `done`, `error` |
| GET/POST | `/api/pip/threads` | list and create threads |
| GET/DELETE | `/api/pip/threads/:id` | messages or delete |
| POST | `/api/pip/threads/:id/feedback` | helpful or not helpful |
| GET/POST/PUT | `/api/pip/briefing` | latest, generate now, or record helpful/not-helpful feedback |
| GET/PUT | `/api/pip/consent` | provider consent |
| GET/POST/DELETE | `/api/pip/memory` | explicit memory |
| POST | `/api/pip/what-sees` | planned tools and provider payload policy |
| GET | `/api/pip/data` | export Pip data |
| DELETE | `/api/pip/data` | wipe Pip data with the confirmation phrase |
| POST | `/api/pip/eval` | admin planner and red-team suite |
| GET/POST | `/api/pip/kill` | admin kill switch |
| GET/PUT/DELETE | `/api/remote-access` | remote access settings |

Chat is read-only. A write tool is not registered in Phase 1, and the golden suite fails if a write tool is ever planned.

## Observability

- `pip_agent_runs` stores provider, model, status, steps, tool calls, token estimate, cost and latency.
- `pip_tool_calls` stores the tool, risk tier, arguments, result, evidence ID, status and duration.
- `/api/ops/status` exposes seven-day runs, fallbacks, failures and the last run.
- `/api/diagnostics` exposes the mode and kill switch.
- Provider answers rejected by the numeric verifier log `pip.verifier_rejected` with the unsupported numbers.

## Briefing

`pip.briefing` runs daily per enabled workspace. It builds a top-three list from cash, budget, recurring, fees, insights, sync, categorization, pension, insurance and planned facts. In-app briefing is always stored. Telegram is attempted when a bot is linked and the app is unlocked.

Shadow backend mode records the briefing size and does not persist a user-visible briefing.

## Evaluation

```bash
npm run test:pip
```

The suite includes:

- a migration and cascade test;
- calculator fixtures against the shared helpers;
- a planner golden set of at least 30 questions in Hebrew and English;
- red-team prompts that must not plan a write;
- numeric verifier tests;
- tool schema tests;
- remote access JWT and normalization tests;
- translation parity.

`POST /api/pip/eval` runs the planner suite in the current workspace and stores the report. It requires an ops admin.

## Runbook

### Pip is slow

1. Check `/api/ops/status` for the last run and provider.
2. If the provider is remote, check its latency; the deterministic answer still works.
3. If the latency is in tools, check `pip_tool_calls.duration_ms` for the slow tool.

### Answers are rejected

1. Check `pip.verifier_rejected` in the log.
2. Compare the unsupported numbers with the evidence record.
3. If the model is paraphrasing amounts, keep the deterministic fallback and tighten the prompt.

### Briefings are wrong

1. Open the latest `pip_briefings` row for the workspace.
2. Check the `asOf` date and the underlying facts.
3. Reproduce with `POST /api/pip/briefing`.

### Disable immediately

1. Set `PENNY_PIP_KILL=1` in the environment and restart, or
2. use `POST /api/pip/kill` with `{ "on": true }` as an ops admin.
3. Data remains. Turning the switch off restores the feature.

### Consent was withdrawn

1. `PUT /api/pip/consent` with `granted: false`.
2. Chat continues with deterministic answers; no facts are sent to the provider.
3. Existing stored messages remain until the user deletes the thread or the retention job prunes them.

## Cost

- The default provider is local Ollama. It has no per-token charge.
- A cloud provider is used only after explicit consent.
- Token counts are estimated from characters in Phase 1. Cost is recorded as zero unless a provider returns usage.
- The deterministic path uses no provider.
