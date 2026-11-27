# Israel market research

This note describes the household-finance context Penny designs for. It is a product summary, not legal, tax or investment advice. Rules and thresholds change; the app must show the year and the source for any current parameter.

## Household cash flow

- Salaried households typically receive monthly pay, while card charges settle on a separate billing cycle. The gap between "money in the bank" and "money already committed" is the core cash-flow question.
- Credit cards, bank debits, standing orders and digital wallets create several charge dates. A forecast that treats all outflows as one monthly number is misleading.
- Households often hold accounts at more than one bank and cards from more than one issuer. A single workspace must reconcile them without merging distinct accounts.
- Income can be mixed: salary, freelance income, benefits, rental income, investment income and one-off receipts. Stability and concentration matter as much as the total.

## Credit and debt

- Overdraft, loans, mortgages and card instalments have different interest mechanics. A single "debt" total hides the cost differences.
- Mortgage tracks can be fixed, variable, prime-linked or index-linked. The payment is not a single rate; the mix and the reset schedule matter.
- Early repayment can save interest but may carry a fee. Penny should show the trade-off, not assume repayment is always right.

## Pension and long-term savings

- Employees and self-employed households accumulate pension, provident, study-fund and similar products across several institutions.
- Management fees are charged on deposits and on the accumulated balance. A small annual fee difference compounds over decades.
- Product statements are not uniform. Data quality is often lower than bank data, so confidence and missing-data states are part of the product.
- Retirement planning needs a spending assumption, a withdrawal assumption and a bridge between retirement and pension age. A single "pension balance" is not a plan.

## Insurance

- Households may hold life, health, disability, long-term care, home, car and mortgage-life cover from different providers.
- Duplicate cover and gaps are common, but documents are unstructured. Penny can flag what is missing or duplicated without claiming to recommend a policy.
- A policy has a premium, a renewal date, a deductible, exclusions and a payment account. The renewal and payment data are often more actionable than the coverage text.

## Housing

- A home purchase involves purchase tax, mortgage mix, equity, ongoing ownership costs and a long repayment horizon.
- Property tax, building committee fees, utilities and insurance are recurring ownership costs that a rent-vs-buy comparison must include.
- A property estimate is an estimate. Penny must label the method, the index month and the confidence.

## Tax and rights

- Income tax, national insurance, credit points, study-fund ceilings and reserve-duty benefits change with legislation and personal status.
- Self-employed households need a tax reserve and a cash-flow buffer; accounting profit is not the same as available cash.
- Released soldiers, reservists and families in special periods may have time-limited rights. A generic checklist is not enough; the app should explain eligibility and link to the official process.
- Penny is not a filing service and does not calculate a final tax liability. It can estimate and explain.

## Data access

- Open banking and provider APIs are improving, but coverage, history depth and reliability vary by institution.
- Screen-based sync remains necessary for some providers. It is fragile, so retries, health states and clear errors are core features.
- Credentials must stay on the household machine. A hosted aggregator would change the trust model.
- Transaction descriptions are noisy and inconsistent. Merchant normalization, deduplication and confidence are required before any analysis.

## Design implications

1. Default to the household month, not the calendar month.
2. Show committed money separately from available money.
3. Treat every connector as unreliable and every dataset as incomplete.
4. Store confidence and as-of dates next to facts.
5. Explain official parameters with a year and a source, and never hard-code a rule without a review date.
6. Offer a calculator, not a recommendation.
7. Keep export, wipe and restore available even when a provider or model is down.
