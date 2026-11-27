# Life-stage modes

A life-stage mode is a configuration of emphasis, language and default checks. It does not change the underlying facts, the money arithmetic or the user's control.

## Modes

### Student

- **Focus:** cash buffer, income stability, first long-term product, low-cost banking.
- **Default checks:** cash buffer, income concentration, duplicate subscriptions, fee review.
- **Home cards:** free-to-spend, upcoming charges, small goal.
- **Tone:** practical, no long-term projections presented as certainty.
- **Avoid:** product recommendations and retirement projections with no contribution history.

### Early career

- **Focus:** savings rate, pension fees, insurance basics, expensive debt.
- **Default checks:** savings rate, debt cost, pension product, missing cover.
- **Home cards:** cash flow, goal progress, fee review.
- **Tone:** momentum without pressure.
- **Avoid:** comparing the household to an idealized saver.

### Family

- **Focus:** buffer, protection, housing, childcare, education goals.
- **Default checks:** cash buffer, protection, recurring charges, budget pace.
- **Home cards:** payday runway, family commitments, goal progress.
- **Tone:** calm and concrete; children's data is minimized.
- **Avoid:** shame around spending and one-size-fits-all budgets.

### Business owner

- **Focus:** separated business cash, tax reserve, income concentration, pension contributions.
- **Default checks:** business/personal separation, tax reserve, income stability, debt cost.
- **Home cards:** mixed view with a clear business marker, tax reserve, cash runway.
- **Tone:** operational.
- **Avoid:** mixing business and household totals without a label.

### Pre-retirement

- **Focus:** withdrawal assumptions, pension fees, sequence risk, health cover.
- **Default checks:** retirement gap, fee review, protection, liquidity.
- **Home cards:** projected gap, contribution status, renewals.
- **Tone:** explicit assumptions and ranges.
- **Avoid:** deterministic "you will have X" statements.

### Retired

- **Focus:** income sources, liquidity, renewals, estate documents, health costs.
- **Default checks:** income coverage, cash buffer, renewals, missing documents.
- **Home cards:** income calendar, upcoming renewals, available cash.
- **Tone:** simple and legible.
- **Avoid:** market commentary presented as a directive.

## Switching modes

- A mode is a preference, not a permanent label.
- Switching changes the emphasis and the default briefing, never the stored facts.
- The user can override any suggested check.
- A household can change mode at any time; history remains intact.
- The mode is stored per workspace or profile, never inferred silently from sensitive data.

## Implementation notes

- Phase 1 keeps the mode as a presentation and briefing preference. It is not used to gate tools or to change tax calculations.
- The checkup and briefing read the mode and choose which checks to surface first.
- Every mode must pass the same evidence and numeric-verification rules.
- A mode never weakens the app lock, the consent gate or the read-only tool boundary.
