# Gap register

Each gap is either closed in the current phase or explicitly deferred with a reason and a next step. No row is left as an unowned TODO.

| ID | Gap | Status | Next step |
| --- | --- | --- | --- |
| G1 | Identity and household roles | Covered by existing local users, roles and app lock | Revisit only if a hosted mode is added |
| G2 | Bank and card coverage | Partial | Add providers behind fixtures; never claim universal coverage |
| G3 | Open-banking history depth | Partial | Document per-provider limits and show them in the connection screen |
| G4 | Provider reliability | Covered by health states, retries and alerts | Add more fixtures for site-change failures |
| G5 | Duplicate detection across sync and import | Covered by dedup, integrity checks and review queue | Continue fixture coverage |
| G6 | Merchant normalization | Covered by merchant keys and confidence | Add a reviewed alias list when a new provider is added |
| G7 | Category confidence | Covered by persisted confidence and reasons | Surface reasons in the review queue |
| G8 | Budget rollover | Covered | Add a visual explanation of carry-in |
| G9 | Payday and household month | Covered by the shared period helpers | Keep tests at month boundaries |
| G10 | Card bill timing | Partial | Add card-specific settlement fixtures |
| G11 | Forecast and low point | Covered | Add scenario comparison in a later phase |
| G12 | Recurring and price changes | Covered by the recurring detector and briefing | Add a user confirmation flow |
| G13 | Fees and management costs | Partial | Add product-level fee statements where available |
| G14 | Pension data quality | Partial | Add a guided statement import |
| G15 | Insurance documents | Partial | Add OCR in a later phase; keep manual entry now |
| G16 | Property estimates | Partial | Keep the index method labelled and sourced |
| G17 | Tax and rights knowledge | Covered by a versioned seed with review dates | Add an annual review owner |
| G18 | Free-form questions | Phase 1 complete | Golden suite and verifier gate |
| G19 | Provider tool calling | Deferred | Enable only after the golden suite proves selection quality |
| G20 | Write actions and approvals | Deferred | Add approvals and audit in Phase 2 |
| G21 | Proactive notifications | Phase 1 in-app and optional Telegram | Add quiet hours and per-channel preferences |
| G22 | Memory controls | Phase 1 explicit memory API and UI hooks | Add a memory management screen |
| G23 | Evaluation harness | Phase 1 planner and red-team suite | Add live provider smoke runs on a schedule |
| G24 | Observability for agent runs | Phase 1 runs, tool calls, metrics and ops status | Add per-tool dashboards |
| G25 | Cost visibility | Partial | Record provider cost when the provider exposes usage |
| G26 | Remote access | Deferred to a separate PR | Land the held Cloudflare work with its own live Access smoke test and review |
| G27 | Backup and restore | Covered by hourly local, portable and restore drill | Add a scheduled restore verification |
| G28 | Export and wipe | Covered for Pip and existing data | Add a user-facing export of the full workspace |
| G29 | Accessibility and RTL | Partial; contact channel is filled, keyboard e2e for the dock remains | Run the dock keyboard path in the browser suite |
| G30 | Documentation and anonymity | Phase 1 docs, ADRs and check | Keep the check in CI and review new docs |

## Rules

- A gap may be closed only with a test, a doc or a product surface that a user can reach.
- A deferred gap must say why and what unlocks it.
- A gap that touches money, credentials or remote access needs a second reviewer.
- A gap that is closed in code but not documented is not closed.
