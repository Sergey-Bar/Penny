# Benchmark framework

The benchmark is internal. It measures whether Penny helps a household answer a real question and act on it, without comparing or naming other products.

## Why a benchmark

Feature lists grow without improving outcomes. A benchmark forces the team to define the job, the evidence and the failure modes before shipping. It also gives review a shared vocabulary.

## Dimensions

| Dimension | Question | Evidence |
| --- | --- | --- |
| Coverage | Can the household connect the accounts it actually uses? | Provider list, fixture imports, sync success rate |
| Freshness | Is the picture current? | Last sync time, stale-connection alert, age-of-money checks |
| Accuracy | Do totals, categories and balances reconcile? | Money contract, integrity checks, reconciliation fixtures |
| Explainability | Can the user see why a number exists? | Evidence cards, source ids, as-of dates, calculator assumptions |
| Actionability | Does Penny suggest a next step that is safe and relevant? | Briefing items, deep links, acceptance tests |
| Trust | Can the user verify, export and delete? | Export, wipe, audit log, restore drill |
| Accessibility | Can a keyboard, screen-reader or RTL user complete the loop? | A11y checklist, e2e keyboard path |
| Cost | Does the default path stay cheap and local? | Tokens per answer, provider optionality, no mandatory cloud |

## Household jobs

1. **Today:** what is free until payday, and what is due?
2. **Month:** where did the money go, and is the budget on pace?
3. **Commitments:** which recurring charges, fees and renewals should I review?
4. **Resilience:** how many months can the household absorb a shock?
5. **Future:** what does a goal, mortgage or retirement gap require?
6. **Protection:** which insurance and pension products exist, and what is missing?
7. **Rights:** which benefits, tax credits or reserve-duty rights apply?
8. **Exit:** can I take my data and leave?

## Measurement

- **Task success:** a scripted household question is answered with the expected evidence and no invented number.
- **Time to answer:** median wall time from question to first complete answer, with the provider on and off.
- **Tool selection:** share of golden questions whose planned tools include every required tool and no write tool.
- **Numeric grounding:** share of provider answers accepted by the verifier; rejected answers are a signal, not a failure of the fallback.
- **Data freshness:** share of workspaces with a successful sync in the last 48 hours.
- **Integrity:** zero unresolved duplicate, split or kind mismatches in the integrity report.
- **Recovery:** restore drill passes within the documented RTO.
- **Privacy:** zero raw account numbers, credentials or full transaction rows in provider payloads.

## Gates for a release

- Migration and restore drill pass.
- `npm run test:ops`, `npm run test:security` and the Pip suite pass.
- The golden planner suite has at least 30 tasks and passes 100%.
- No write tool is reachable from chat.
- Provider answers that fail numeric verification fall back deterministically.
- A keyboard-only user can open Pip, ask a question, open evidence and give feedback.
- Export and wipe cover the new tables.
- The anonymity check passes in CI.

## What is not measured

Attribution, engagement time and daily active users are not goals. A household that opens Penny twice a month and gets a correct answer is a success.
