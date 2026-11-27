# One-stop-shop requirements

## Product statement

A household should be able to open Penny, connect what it uses, see today's position, review commitments and plan the next step in one place, with the data staying on its own machine.

## Users

- **Household owner:** owns the machine, sets the app lock, connects banks and decides about remote access.
- **Household member:** sees and edits household data within their role, but cannot change security or workspace ownership.
- **Solo business owner:** needs a separated business view and a tax reserve.
- **New user:** has no connected data and needs a useful first session from imports or manual entry.
- **Returning user after a gap:** needs to know what is stale and what is missing before trusting a number.

## Functional requirements

### Accounts and transactions

- Connect bank, card and savings providers from the local machine.
- Import statements and files when a provider is unavailable.
- Deduplicate rows across sync, import and manual entry.
- Reconcile balances and show drift.
- Categorize with confidence, reasons and a review queue.
- Search and filter by period, account, category, merchant, amount and review state.
- Split a transaction, exclude it from totals and record a business share.

### Today and planning

- Show free-to-spend until payday, with card bills, known debits, reserved cash and expected salary separated.
- Forecast the lowest balance and the first negative day.
- Budget by the household month with rollover rules.
- Track goals and planned purchases.
- Show recurring charges, price changes and renewal dates.
- Flag possible duplicates, anomalies and missing commitments.

### Wealth and protection

- Track bank, brokerage, pension, provident, study-fund, property and other assets.
- Track liabilities and the cost of debt.
- Show asset allocation, concentration and liquidity.
- Record insurance policies, premiums, renewals and documents.
- Flag duplicate or missing cover without recommending a product.

### Intelligence

- Answer a free-form question with evidence from the workspace.
- Fall back to a deterministic answer when no model is configured.
- Keep a visible list of the tools and facts used.
- Cite seeded knowledge with a version and review date.
- Run only whitelisted calculators, with assumptions shown.
- Remember only explicit user-approved memory.
- Produce a short proactive briefing with a deep link for each item.

### Trust and control

- App lock with a passphrase, PIN, recovery code or passkey.
- Role-based household access and device tokens.
- Local backups, portable backups and a tested restore.
- Audit of security-relevant and data-changing operations.
- Export everything and wipe everything.
- Redaction of credentials, tokens and account numbers in logs.

### Remote access

- Off by default.
- Named tunnel with Cloudflare Access verification.
- App lock required.
- No wildcard hosts.
- Remote requests fail closed if the Access key set is unavailable.
- Clear setup status and a one-click off switch.

## Non-functional requirements

- Server-rendered pages remain usable without client JavaScript for reading core screens.
- All money is stored and compared at two decimals; display never changes a stored value.
- API mutations are idempotent where a retry could duplicate money movement.
- No provider payload contains credentials, full account numbers or raw transaction tables.
- Every new table has export/wipe coverage and a foreign-key check.
- Every new job has a bounded attempt count, backoff and a dead-letter path.
- Every new route goes through the common error wrapper and request ID.
- Hebrew and English are both first-class; layouts use logical properties.
- Keyboard-only operation works for the main loop.

## Acceptance for the current phase

- A new workspace can import a fixture, see a budget, ask Pip a spending question, open evidence and give feedback.
- Turning `pip_v2` off restores the previous ask experience.
- Turning `PENNY_PIP_KILL` on disables Pip chat and briefings without deleting data.
- A remote request without a valid Access token is refused and logged without the token.
- `npm run test:ops`, `npm run test:security` and the Pip suite pass.
- The restore drill returns a database that passes integrity checks.

## Out of scope

- Money movement, trading, bill payment and credit applications.
- A public social or comparison layer.
- A hosted data warehouse.
- A replacement for a licensed adviser.
