# Pip core review

- Date: 2026-11-27
- Scope: Phase 0, Phase 1 and the Phase 5 review for the Pip program
- Decision: merge behind default-off flags, without remote access in this PR

## What was built

- Migration `083_pip` with threads, messages, tool calls, explicit memory, consent, feedback, briefings, agent runs, approvals and evaluation runs.
- A read-only tool registry over existing household queries, with Zod input and output schemas, evidence IDs and as-of timestamps.
- A deterministic bilingual planner, deterministic answer builder and numeric verifier.
- An optional provider path that receives minimized facts only after consent and is rejected when its text contains an unsupported number.
- A global Pip dock, a page mode on `/ask`, evidence cards, "what Pip sees", briefing feedback, chat feedback, consent and memory controls.
- A daily `pip.briefing` maintenance job with in-app persistence, optional Telegram delivery and at-most-once delivery per day.
- Operational status, diagnostics, metrics, retention, export and wipe.
- Strategy docs, the Pip ADR, runbooks, a gap register and an anonymity check.

Remote access is deliberately outside this PR. The prepared Cloudflare work is held outside the app tree for a separate review.

## Evidence

Run on the implementation workspace:

```text
node node_modules/typescript/bin/tsc --noEmit        no output
node node_modules/eslint/bin/eslint.js --max-warnings 0 src tests scripts e2e   no output
node node_modules/knip/bin/knip.js --no-progress     only the existing .css hint
node node_modules/prettier/bin/prettier.cjs --check  all matched files pass
node node_modules/vitest/vitest.mjs run              275 files passed, 1 skipped; 1756 tests passed
node node_modules/next/dist/bin/next build           compiled, typechecked and generated the routes
```

The Pip suite covers:

- migration tables, cascades and uniqueness;
- every whitelisted calculator against the shared helper;
- 35 bilingual planner tasks and red-team prompts;
- numeric verification, including invented amounts and dates;
- every read tool against a real SQLite database;
- a real agent turn, memory, feedback, briefing, export and wipe;
- a mocked provider turn where an invented amount is rejected and a verified amount is accepted;
- the chat SSE route and the kill switch;
- Hebrew and English message parity.

## Findings

### Correctness

- The planner is deterministic and testable. It never plans a write tool, and the red-team prompts pass.
- Tool outputs are schema-validated. The evidence ID is derived from the result, so the same result is stable.
- Scoped spending questions report the filtered amount, not the whole wallet.
- The verifier handles formatted money, small amounts, percentages, dates and years. It rejects an invented amount or percentage.
- The integration test exercises every read tool on an empty but fully migrated database, which caught two SQL alias ambiguities before review.

### Safety and privacy

- Chat cannot write. The only memory tools are explicit and scoped to a workspace and profile.
- A provider is used only for a non-local provider after consent, and its answer is only kept after verification.
- Provider payloads contain tool summaries and minimized facts, not raw transaction descriptions, credentials or full account numbers.
- Account labels in facts are masked to the last four characters.
- Sync error messages are masked before they reach a provider or a log line.
- The log records the verifier rejection reason, not the full answer text.
- Export and wipe cover all Pip tables, including briefings and evaluation runs.

### Accessibility

- The dock is a labelled dialog, the composer has a label, feedback buttons have labels and pressed state, the stream is announced with `aria-live`, and Escape closes the dock.
- The layout uses logical properties for RTL.
- The accessibility statement contact fields no longer contain TODO placeholders; the contact channel is the public issue tracker.

### Performance

- Chat is bounded to six tools per question.
- Facts are aggregate or top-N, not full-table payloads.
- Provider facts are truncated to 12k characters.
- The full test suite runs in about 20 seconds on the review machine.

## Residual risks

1. **No live provider tool calling.** The model phrases answers; it does not choose tools. This is deliberate until the golden suite proves selection quality.
2. **No browser e2e for the dock.** The build compiles and the server routes are covered, but the new dock should get a Playwright keyboard path before a broad release.
3. **No component-render tests.** This matches the existing testing strategy, but the dock is a new interaction surface.
4. **Token cost is estimated.** Provider usage is recorded from character counts; a provider that returns usage should fill the exact numbers later.
5. **Write actions are absent.** Transfers, category changes and approvals are deferred.
6. **Remote access is excluded.** The Cloudflare work is held for a separate PR and must pass its own live Access smoke test before release.

## Files of record

- `src/server/db/migrations/083_pip.sql`
- `src/server/pip/facts.ts`
- `src/server/pip/tools.ts`
- `src/server/pip/planner.ts`
- `src/server/pip/agent.ts`
- `src/server/pip/verifier.ts`
- `src/server/pip/repository.ts`
- `src/server/pip/briefing.ts`
- `src/components/pip/`
- `docs/strategy/`
- `docs/adr/0001-pip-architecture.md`
- `docs/pip-operations.md`

## Release conditions

- Keep `pip_v2` off by default.
- Add the browser keyboard e2e before enabling Pip for a household.
- Keep `npm run test:pip`, `npm run check:anonymity` and the security suite in CI.
