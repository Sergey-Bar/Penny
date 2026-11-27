# Testing

Penny is tested in five layers. Each layer has one job, so a failure points at the layer
that owns it instead of at "something in the app".

```
        e2e/                 real browser, real server, real HTTP   (Playwright)
      ─────────
     security sweeps         every API path through the proxy      (Vitest, real DB)
    ───────────────
   route integration         real handlers, real SQLite, bad input  (Vitest, real DB)
  ─────────────────────
  unit / logic               pure functions, parsers, money maths   (Vitest)
 ───────────────────────
  static policy              headers, CSP, "no secrets in logs"     (Vitest)
```

## Layers

| Layer             | Files                                                                                                                                                                                                       | Proves                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | most of `tests/*.test.ts`                                                                                                                                                                                   | Budget maths, tax and pension rules, CSV/OFX parsing, dedupe, redaction helpers                                                                                         |
| Route integration | `tests/api-contract.test.ts`, `*-route.test.ts`, `api-boundaries.test.ts`                                                                                                                                   | A real handler against a real SQLite database answers 4xx (never 5xx) to bad input                                                                                      |
| Security sweeps   | `tests/security-policy.test.ts`, `tests/security-headers.test.ts`, `tests/proxy.test.ts`, `tests/host-guard.test.ts`, `tests/lan-access.test.ts`, `tests/user-access.test.ts`, `tests/access-route.test.ts` | Every API path is 401 signed out, 403 for a foreign workspace, and only the documented routes are member-reachable; CSP and browser headers cannot be weakened silently |
| Privacy           | `tests/privacy.test.ts`, `tests/backup*.test.ts`, `tests/portable-backup.test.ts`                                                                                                                           | Diagnostics, connected-account lists and exports never carry a secret; backups stay encrypted                                                                           |
| End to end        | `e2e/app.spec.ts`, `e2e/api-security.spec.ts`                                                                                                                                                               | Real production server: headers on real responses, CSRF rejection, 4xx-not-500, and the screens people actually use                                                     |

## Security sweep

`tests/security-policy.test.ts` walks **every** `route.ts` under `src/app/api` through
`src/proxy.ts` three times:

1. **Signed out** - every non-public path is `401`, so a new route cannot be born public
   by accident. Public on purpose: `/api/access` (sign-in), `/api/health` (service and
   Docker probe), `/api/lock/unlock` (lock screen).
2. **Household member** - reads only from the member-safe list, writes only to household
   money data (budgets, transactions, categories, planned), never to settings, backup,
   setup, integrations or the wipe route.
3. **Foreign workspace** - an `x-workspace-id` the member does not belong to is `403` on
   every route that reads workspace data. Admin-owned and workspace-free routes are named
   in the test, not silently skipped.

The contract sweep (`tests/api-contract.test.ts`) calls every route module with an absent
body, broken JSON, `null`, `[]` and `{}`, and fails on any 5xx. It covers 102 of the 118
route modules; the other 16 are the ones that leave the machine or need a Next request
scope (`SKIP` lists each with its reason). Routes that leave the
machine (bank scrapers, AI providers, market quotes) or need a real Next request scope are
listed with the reason in the test's `SKIP` table.

## Pip

```bash
npm run test:pip
npm run check:anonymity
```

The Pip suite has ten files:

- `pip-migration.test.ts` applies 083 to a real database and checks every table, foreign key, cascade and the briefing uniqueness.
- `pip-calculators.test.ts` compares each whitelisted calculator with the shared library helper.
- `pip-planner.test.ts` runs the bilingual golden set and the red-team prompts; a planned write fails the suite.
- `pip-verifier.test.ts` proves that an invented amount or percentage is rejected and that dates and years are not mistaken for amounts.
- `pip-tools.test.ts` checks the read/memory tool boundary, input/output schemas and citations.
- `pip-answers.test.ts` checks the deterministic bilingual answer and briefing text.
- `pip-messages.test.ts` checks Hebrew and English key parity.
- `pip-integration.test.ts` runs a real agent turn against a real SQLite database, then checks memory, feedback, briefing, export, wipe and every read tool.
- `pip-agent-provider.test.ts` mocks the provider: an invented amount is rejected and the deterministic answer is used; a verified amount is recorded with the provider.
- `pip-route.test.ts` calls the chat handler with a real request and checks the SSE events, the thread list and the kill switch.

## Running

```bash
npx vitest run                      # unit + integration + security + privacy
npx vitest run tests/security-policy.test.ts tests/privacy.test.ts
npx vitest run tests/api-contract.test.ts
npx playwright test                 # end to end, builds and serves on port 3100
npm run test:coverage               # same suites + coverage floors, writes coverage/lcov.info
npm run lint && npx tsc --noEmit && npm run format:check
npm run security:audit:gate         # fails on a new critical advisory
```

The Vitest suites use a temporary `PENNY_DATA_DIR` per file, so they never read or write
the database in `data/`. Playwright uses `e2e/.data`, which it deletes and recreates.

## What is not covered

Be honest about the edges:

- No component-render tests. The UI is covered by `e2e/app.spec.ts` and screenshots, not by
  unit tests of React components.
- Bank and pension scraping is not tested against real institutions; the scrapers are
  third-party libraries and network access is stubbed out or skipped.
- Routes that talk to a model provider, Telegram, market data or Chromium are contract-
  exempt for the same reason.
- Coverage is a floor, not a target. `npm run test:coverage` measures `src/lib`, `src/server`
  and `src/proxy.ts` (the layers this suite owns) and fails below 74% statements / 66%
  branches / 71% functions / 75% lines. React components and pages are measured by `e2e/`
  instead, so counting them here would only dilute the number.

## Adding a route

1. Add the handler under `src/app/api/...`; the contract sweep picks it up automatically.
2. If it reads workspace data, `tests/security-policy.test.ts` will already require it to be
   denied for a foreign workspace. If it must be reachable without a workspace, add it to
   the documented `workspaceFree` list with a reason.
3. If it mutates data, add a focused test next to the existing `*-route.test.ts` files.
