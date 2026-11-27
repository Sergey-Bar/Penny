# North star

Penny is a local-first household finance workspace. It connects the accounts a household already uses, turns them into an honest picture of today, and helps the household make the next decision without surrendering its data.

## The problem

Household finance is fragmented across bank accounts, credit cards, pension and study funds, insurance policies, loans, planned purchases and tax documents. Each provider shows one slice. The household is left to reconcile balances, remember renewals, compare fees and translate a statement into a decision.

Most tools solve the fragmentation by taking custody of the data. Penny takes the opposite route: the data stays on the household's machine, integrations run from that machine, and AI is optional.

## Product principles

1. **Truth before fluency.** A number shown anywhere must come from stored facts. An answer that cannot be traced to a row, a calculation or a cited guide is not an answer.
2. **Local-first, not local-only.** The core works without an internet connection. Remote access is opt-in, authenticated and bounded.
3. **Calm over engagement.** Penny does not gamify spending, shame the user or manufacture urgency. It shows the next useful action and gets out of the way.
4. **One place for the whole picture.** Cash flow, budget, goals, assets, pension, insurance, planned items and rights live in one workspace.
5. **Explain the number.** Every insight has a source, an as-of date, a formula or a citation.
6. **No advice cosplay.** Penny can explain a trade-off and run a calculator. It does not pretend to be a licensed investment, tax or insurance adviser.
7. **The household owns the exit.** Export, wipe and restore are first-class operations. A user can leave with their transactions and their history.
8. **Ship the boring safety.** Backups, migrations, idempotency, audit logs and restore drills are product features, not infrastructure afterthoughts.

## What success looks like

- A household can answer "how much is free until payday?" in under ten seconds, with the bills and salary assumptions visible.
- A household can see the effective fee on its pension and savings products without opening five provider portals.
- A question about spending, fees, renewals or affordability has an evidence card, not just a sentence.
- A bank connection failure is visible before it silently breaks the monthly picture.
- A user can export everything and delete everything without asking support.
- Remote access works from a phone without exposing the database to the public internet.

## Non-goals for the current phase

- Becoming a broker, insurer, lender or tax filing service.
- Storing bank credentials in a hosted service.
- Autonomous money movement.
- Replacing a licensed professional for a regulated decision.
- Supporting every bank and every product before the core household loop is excellent.

## Decision rules

When two options are plausible, choose the one that:

1. keeps the data closer to the user;
2. makes the number easier to verify;
3. degrades gracefully when a provider, model or bank is unavailable;
4. leaves a smaller permanent surface area;
5. can be tested without a live bank or a live model.
