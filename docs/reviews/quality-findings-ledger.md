# Quality-hardening findings ledger

Source of truth for the 0.7.0 quality pass. Every review finding from the referenced PRs is
listed once. `Fixed` means the merged code changed and a regression test or route test covers it;
`Verified` means the finding no longer applies to the merged implementation (with the evidence);
`Superseded` means a later PR replaced the code or the behavior was intentionally removed.

Baseline: PRs #79, #88, #91 and #93 were reviewed; #93 was closed and its work merged through the
follow-up import PR. IDs below are assigned per finding for this ledger, not CodeRabbit comment IDs.

## PR #79 - investment provider grouping

| ID | Sev | File | Finding | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| QH-079-01 | must | `sidebar-accounts.tsx`, `accounts-overview.tsx`, `account-groups.ts` | Provider grouping applied to every account group, not investments only | Fixed | `groupItemsByProvider(items, enabled)`; both callers pass `g.key === "investments"`; `tests/account-groups.test.ts` |
| QH-079-02 | should | `sidebar-accounts.tsx`, `accounts-overview.tsx` | Prefix stripping hard-coded Hebrew and depended on the UI locale | Fixed | Strips both configured house names (`he` and `en`) with `escapeRegExp` |
| QH-079-03 | must | `sidebar-accounts.tsx` | Provider name interpolated into `RegExp` unescaped | Fixed | `escapeRegExp` applied before building the pattern |
| QH-079-04 | should | `investments-view.tsx` | `?provider=` links not read by the page | Verified | The merged investments view reads `searchParams.provider` and shows the active filter; no further change |

## PR #88 - Hapoalim securities

| ID | Sev | File | Finding | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| QH-088-01 | must | `hapoalim-securities.ts`, `assets.ts` | Stale reconciliation scoped by provider prefix only; another credential's holdings could be zeroed | Fixed | Scope is `{credentialId, accountNumbers}`; keys encode both; legacy keys are adopted only for covered accounts; `tests/hapoalim-securities.test.ts` |
| QH-088-02 | must | `assets.ts` | Stale holding cleared current value but left today's snapshot value | Fixed | `zeroSnapshot` upserts today's `value_ils/value_native/cost_basis_ils` to 0; earlier snapshots untouched; test covers it |
| QH-088-03 | must | `hapoalim-securities.ts` | Fallback `page.evaluate` and body reads had no capture deadline | Fixed | Remaining deadline is passed to an `AbortController` and raced with the evaluate; timeout returns `undefined` |
| QH-088-04 | must | `hapoalim-securities.ts` | Incomplete capture could be saved as an empty portfolio | Fixed | Requires successful `/accounts`, every discovered account validated, and at least one valid view; `[]` only for a confirmed empty portfolio; tests |

## PR #91 - AI providers

| ID | Sev | File | Finding | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| QH-091-01 | must | `src/app/api/setup/ai/route.ts` | Unchecked `body as AppSettings` cast | Fixed | Strict Zod object: provider enum, non-empty optional strings, unknown fields rejected; `tests/setup-ai-route.test.ts` |
| QH-091-02 | must | `openai.ts`, `claude.ts`, new `providers/parse.ts` | Greedy `\[[\s\S]*\]` parse duplicated in both providers | Fixed | Shared parser uses first `[`/last `]`, defensive JSON parse and confidence range; malformed input returns `[]`; `tests/ai-provider-parse.test.ts` |

## PR #93 - import v2, major findings

| ID | Sev | File | Finding | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| QH-093-M01 | must | `draft.ts` | `debit \|\| credit` treats `"0"` as truthy and hides a credit | Fixed | Chooses the non-zero parsed side; `tests/import-engine.test.ts` |
| QH-093-M02 | must | `draft.ts`, `normalize.ts`, `types.ts` | Debit/credit direction lost when kind is absent | Fixed | Draft carries raw debit/credit; normalizer accepts both; test |
| QH-093-M03 | must | `detect.ts` | Short aliases (`in`, `out`, ...) matched inside longer words | Fixed | Exact/whole-token match for aliases of 3 characters or fewer; regression test |
| QH-093-M04 | must | `classify.ts` | Mixed-sign card file with a negative refund row became an expense charge | Fixed | Card classification uses refund wording plus sign; `tests/import-classify.test.ts` |
| QH-093-M05 | must | `read.ts` | Unbounded HTML `colspan`/`rowspan` expansion | Fixed | Spans parsed as finite integers clamped to 1,000; regression test |
| QH-093-M06 | should | `presets.ts` | A loose word for an earlier alias shadowed a later exact header | Fixed | Two-pass exact-then-loose mapping; regression test |
| QH-093-M07 | must | `parse.ts` | Header-only bank preset forced all-positive files to income | Fixed | Such a preset is ignored for sign detection when no kind/debit/credit column exists |
| QH-093-M08 | must | `xlsx.ts` | Central-directory size was trusted; decompression was unbounded | Fixed | Actual decompressed bytes counted per entry and per workbook; `XlsxLimits`; test with a lying central directory |
| QH-093-M09 | should | `patterns.ts` | CAL Hebrew pattern matched inside longer words | Fixed | Wrapped in Hebrew word boundaries through `he()` |
| QH-093-M10 | must | `normalize.ts` | Card-positive convention forced `Math.abs`, losing a negative credit | Fixed | Raw sign preserved; classification decides refund vs charge |
| QH-093-M11 | must | `normalize.ts` | Credit/debit comparison used an unsigned debit | Fixed | Both sides use `Math.abs` |
| QH-093-M12 | must | `classify.ts` | Card-negative credits (positive rows) were treated as charges | Fixed | `cardNegative` positive rows are refunds; tests |
| QH-093-M13 | must | `reclassify.ts` | Transfer pairing could match the same account | Fixed | Same account id/number excluded from `hasTransferPair` |
| QH-093-M14 | must | `reclassify.ts` | Any card activity was enough to turn a card bill into a transfer | Fixed | Requires a linked row or an amount match within tolerance and the date window; otherwise review |
| QH-093-M15 | should | `preview.ts` | Preview and save applied different kind rules | Fixed | Preview applies the same rule-kind overrides before validation/categorization |
| QH-093-M16 | must | `forget` route | `category_origin` was not set to `user`, so a local pass could overwrite a correction | Fixed | Remaining categorized rows are marked `user`; `ai` is cleared too |
| QH-093-M17 | must | batch reclassify route | Unknown batch id silently reclassified the whole account | Fixed | Route requires a resolvable batch and returns 404 |
| QH-093-M18 | must | `accounts.ts`, migration 089 | Linked balance keyed by provider+number, not account identity | Fixed | Partial unique indexes by account id / legacy pair; `tests/accounts-resolve.test.ts` |
| QH-093-M19 | must | `accounts.ts` | Number-only lookup returned an arbitrary account when two providers shared a number | Fixed | Ambiguous result with candidates; stale provider resolution creates a provider account instead |
| QH-093-M20 | must | `accounts.ts` | Currency ignored in account lookup | Fixed | `getAccountByNumber` and resolution use currency |
| QH-093-M21 | must | `transactions.ts` | Sync adoption overwrote a person's memo | Fixed | `memo_source='user'` memo is preserved during adoption; `tests/sync-adopts-file-rows.test.ts` |
| QH-093-M22 | must | `transactions.ts`, `accounts.ts` | Number-only match could attach a sync to another provider's account | Fixed | Real providers skip cross-provider fallback; a missing account is created |

## PR #93 - import v2, additional major findings

| ID | Sev | File | Finding | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| QH-093-M23 | must | `transactions.ts` | Ambiguous account result was stored as a match | Fixed | `insertFileImport` stores `account_id = NULL` when ambiguous |
| QH-093-M24 | must | `request.ts` | Duplicate `rowIndex` accepted | Fixed | Duplicate set check; `tests/import-request.test.ts` |
| QH-093-M25 | must | `request.ts`, parse route | Content-Length only; a chunked/actual body was unbounded | Fixed | `readBoundedBytes` counts chunks; JSON and multipart use it; test |
| QH-093-M26 | must | `request.ts` | Non-finite signed amounts and sign/kind contradictions accepted | Fixed | Finite check and kind/refund sign rule; test |
| QH-093-M27 | must | `save.ts` | Sync-run and batch markers were committed before the row transaction | Fixed | Both are created inside the row transaction; trigger test proves rollback |
| QH-093-M28 | must | `save.ts`, save route | File hash gate ran before client-token replay | Fixed | Token is resolved first in both; replay test |
| QH-093-M29 | must | `save.ts` | Row `accountId` could differ from the destination account | Fixed | Request coercion rejects mismatches; `accountMismatch` test |
| QH-093-M30 | must | `save.ts` | Token replay reported success while post-commit work was unfinished | Fixed | Persisted `post_commit_status`; retry reruns; batch learns merchant memory idempotently |
| QH-093-M31 | must | `dedup.ts`, migration 088 | Duplicate key ignored account identity | Fixed | Hash includes `account.id:provider`; legacy hash preserved; two-provider test |
| QH-093-M32 | must | `imports.ts`, `receipts.ts` | Receipt files deleted inside the undo transaction | Fixed | Rows deleted inside; paths queued; files removed after commit with retry |
| QH-093-M33 | must | `imports.ts` | Batch/sync/sheet ids shared one numeric namespace | Fixed | `resolveBatchId` supports `batch-`, `sync-`, `sheet-`; plain numbers are v2 batches only |
| QH-093-M34 | must | `imports.ts` | Legacy NULL `account_id` candidate was treated as account 0 | Fixed | `COALESCE(account_id, ?)` resolves to the searched account |
| QH-093-M35 | must | `imports.ts` | Flow-match delete hit SQLite's bind-variable limit on a large undo | Fixed | 5,000-id chunks inside the same transaction |
| QH-093-M36 | must | `preview.ts` | Preview showed a kind the save would change | Fixed | Same rule-kind overrides as save |
| QH-093-M37 | must | `preview.ts`, `validate.ts` | Invalid calendar dates were accepted | Fixed | `utcDay` round-trip check plus range |
| QH-093-M38 | must | legacy import route | `?batch=` undo used a sync-run id against v2 batches | Fixed | v2 workspaces resolve a v2 batch; legacy workspaces keep `deleteFileImport` |
| QH-093-M39 | should | `parse-store.ts` | Expired parses were only swept when their id was visited | Fixed | `sweepExpired` runs on put/get |
| QH-093-M40 | should | `pending.ts` | Managed subfolders (`ignored/`, ...) were accepted as pending paths | Fixed | `assertInsideImportDir` rejects managed first segments |
| QH-093-M41 | must | `parse.ts` | Path import read the whole file before checking size | Fixed | Opens, stats and reads at most cap+1 bytes |
| QH-093-M42 | must | parse route | Multipart body buffered without the byte cap | Fixed | `readBoundedFormData` parses from bounded bytes |
| QH-093-M43 | must | `import-workbench.tsx` | PDF/document reparse lost its source | Fixed | Retains `sourceText`/`sourceName` and the original display name |
| QH-093-M44 | should | `import-workbench.tsx` | Previous pending source could remain attached | Verified | Pending is cleared on cancel/new save; opening a new source assigns the new pending id |
| QH-093-M45 | should | `import-workbench.tsx` | Add-account form only appeared when no accounts existed | Fixed | Toggle next to the account select; form remains reachable |
| QH-093-M46 | must | `import-workbench.tsx` | Normalization reset every row to the batch account | Fixed | Per-row account context; preview/save group rows by account |
| QH-093-M47 | must | `import-workbench.tsx` | Preview sent an unbounded rows array | Fixed | Chunks of 5,000 per account, merged summary |
| QH-093-M48 | must | `import-workbench.tsx` | Overlapping parse requests could apply an older result | Fixed | Sequence guard in `parseSource`/`applyParse` |
| QH-093-M49 | must | `import-workbench.tsx` | A row dropped by normalization still looked valid | Fixed | Local error preview rows feed the grid and summary |
| QH-093-M50 | must | `import-workbench.tsx` | A failed chunked save generated a new group/token on retry | Fixed | `pendingSave` reuses group/token until success/cancel |

## PR #93 - minor findings

| ID | Sev | File | Finding | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| QH-093-m01 | should | `text.ts` | `DR` marker dropped | Fixed | Marker parsed as debit; regression test |
| QH-093-m02 | should | `text.ts` | Sign derived from markers instead of the parsed amount | Fixed | Parsed sign plus DR/CR override |
| QH-093-m03 | should | `extract.ts` | Optional quantifier inside a repeated group not rejected | Fixed | `?` added to the nested-quantifier guard |
| QH-093-m04 | should | `generic.ts` | Hebrew PayBox/Bit not generic | Fixed | Hebrew matcher includes `ביט`/`פייבוקס` with boundaries |
| QH-093-m05 | should | `patterns.ts` | `rent\b` matched inside "different" | Fixed | `\brent\b` |
| QH-093-m06 | should | `validate.ts` | Calendar-invalid dates (e.g. 2024-02-31) accepted | Fixed | Round-trip validation |
| QH-093-m07 | should | `validate.ts` | Non-finite/oversized/contradictory signed amount accepted | Fixed | Fatal `amountInvalid`/`amountRange` reasons |
| QH-093-m08 | should | `merchant-dictionary.ts` | Foreign purchase classified as a bank fee | Fixed | Only the conversion fee line matches Bank Fees; test |
| QH-093-m09 | should | `merchant-dictionary.ts` | Mortgage insurance matched Life Insurance | Fixed | Insurance entry precedes the generic Mortgage entry; test |
| QH-093-m10 | should | `categorize.ts` | Merchant memory skipped refund rows | Fixed | Refund eligibility uses `wantedKind` |
| QH-093-m11 | should | `categorize.ts` | Fallback suggestions could be the wrong kind | Fixed | Suggestions filtered by `wantedKind` |
| QH-093-m12 | should | `categorize.ts` | Name lookup ignored kind | Fixed | Kind-matching name lookup first |
| QH-093-m13 | should | `categorize.ts` | File category ran before rules | Fixed | Rule is applied first |
| QH-093-m14 | should | forget route | `ai` origin not cleared | Fixed | `ai` added to the clear set |
| QH-093-m15 | should | forget route | Merchant and transaction ids not validated | Fixed | Strict Zod schema |
| QH-093-m16 | should | suggest route | Mode/rows/duplicate indexes not validated | Fixed | Strict Zod schema plus duplicate check |
| QH-093-m17 | should | `categorize-local.ts` | Learned parent category silently lost | Fixed | Parent ids resolved against the full tree; tests |
| QH-093-m18 | should | `reclassify.ts` | Transfer pair skipped too late / no same-account guard | Fixed | Same-account exclusion in the query |
| QH-093-m19 | should | `import-v2-backfill.ts` | Alias normalization differed from lookup normalization | Fixed | Same punctuation/BiDi normalization |
| QH-093-m20 | should | `preview.ts` | Refund increased expenses instead of netting them | Fixed | Refund subtracts from expenses |
| QH-093-m21 | should | `preview.ts` | Missing-account preview reported zero errors | Fixed | Summary errors set to row count |
| QH-093-m22 | should | `imports.ts` | Pending-to-posted hash change not reflected in batch row | Verified | Import batches have no pending row status in the merged schema; pending states live on sync rows and post-commit status is rerun |
| QH-093-m23 | should | `imports.ts` | Finalize/list rows not workspace-scoped | Fixed | Both queries include `workspace_id` |
| QH-093-m24 | should | accounts route | `created: true` even when an account was reused | Fixed | `createAccountResult` reports the actual outcome |
| QH-093-m25 | should | accounts route | Account fields not validated | Fixed | Strict Zod schema |
| QH-093-m26 | should | `request.ts` | `kind` coerced with `String()` | Fixed | Requires a string in the known set |
| QH-093-m27 | should | `save.ts` | `possibleDuplicate` reason not stored | Fixed | Row reason code is `possibleDuplicate` when applicable |
| QH-093-m28 | should | legacy import route | Dry run persisted an account | Fixed | `create: body.dryRun !== true` |
| QH-093-m29 | should | `pending.ts` | Rename failure ignored | Fixed | Throws `moveFailed` and does not mark ignored |
| QH-093-m30 | should | profiles route | Profile body only version-checked | Fixed | `isImportProfileV2` validates format, mapping, enums and arrays |
| QH-093-m31 | should | `import-grid.tsx` | Page could exceed the last page after deletions | Fixed | `currentPage` clamped |
| QH-093-m32 | should | `import-grid.tsx` | Tag input parsed on every keystroke | Fixed | Local buffer commits on blur/Enter |
| QH-093-m33 | should | `summary-bar.tsx` | Net total hid its sign | Fixed | Negative values render with a leading `-` |
| QH-093-m34 | should | `manual-import.tsx` | Flag error silently showed the legacy importer | Fixed | Loading, error/retry and enabled branches |
| QH-093-m35 | should | `docs/importing.md` | Broken UTF-8/Hebrew examples | Fixed | Arrows and Hebrew column examples corrected |
| QH-093-m36 | should | `review-inbox.tsx` | Concurrent memo saves could land out of order | Fixed | Per-row promise queue |

## PR #93 - nitpicks

| ID | Sev | File | Finding | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| QH-093-N01 | optional | `dedupe.ts` | Candidate matching was O(rows x stored) | Fixed | Indexed by account/amount/direction |
| QH-093-N02 | optional | `forget` route | Transaction kept in the route | Fixed | Moved to `src/server/lib/import/forget.ts`; the route only validates and calls it |
| QH-093-N03 | optional | suggest route | AI batching kept in the route | Verified | Route is server-only and never called from the client bundle; request schema is tested |
| QH-093-N04 | optional | migration tests | No upgrade fixture for the new migration | Fixed | `tests/import-dedup-migration.test.ts` runs 088 against a pre-088 schema |
| QH-093-N05 | optional | legacy import route | `legacyRow` kept in the route | Fixed | Moved to `src/server/lib/import/legacy-row.ts`; route imports the pure mapper |
| QH-093-N06 | optional | route tests | Workspace isolation test intent unclear | Verified | Existing route tests create separate workspaces and assert foreign ids fail; no behavior gap |

## PR #110 review findings

CodeRabbit review of `release/v0.7.0` (PR #110), 2026-11-28. The review posted 12 inline major
comments, 1 outside-diff major comment, 18 minor findings and 1 nitpick (trivial) — 32 findings in
total. Each was verified against the final code; all were still valid and are fixed, none rejected.

| ID        | Sev    | File:line                                     | Finding                                                                 | Status | Evidence                                                                                       |
| --------- | ------ | --------------------------------------------- | ----------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| CR110-01  | major  | `src/app/api/import/route.ts:122-129`          | History undo sent a sync-run id that v2 read as a batch id              | Fixed  | `listFileImports` returns `sync-<id>` as `ref`/`undoRef`; the route resolves namespaced refs and falls back to the legacy parser for bare ids; `tests/import-undo-ref.test.ts`, `tests/import-route.test.ts` |
| CR110-02  | major  | `import-workbench.tsx:425`                     | Reparse stamp overrode a changed account selector                       | Fixed  | `clearDefaultAccountStamp` treats the server stamp as a default; `tests/import-engine.test.ts`, `tests/import-workbench-helpers.test.ts`  |
| CR110-03  | major  | `import-workbench.tsx:595`                     | Statement balance attached to the first chunk regardless of account     | Fixed  | `statementBalanceAccount` picks the balance row's account; only that group's first chunk sends it; `tests/import-workbench-helpers.test.ts` |
| CR110-04  | major  | `src/lib/import/draft.ts:142-144`              | Mapped amount overridden by debit/credit values                         | Fixed  | Amount-mapped drafts no longer copy debit/credit; normalizer keeps the amount; regression test  |
| CR110-05  | major  | `src/server/db/queries/accounts.ts:223-250`    | Exact same-number match across currencies not flagged ambiguous         | Fixed  | Exact lookup returns every currency match and flags multiple; `tests/accounts-resolve.test.ts`  |
| CR110-06  | major  | `src/server/db/queries/assets.ts:252-262`      | Unlinked balance left behind when a linked balance is written           | Fixed  | Linked branch deletes the same provider/number unlinked row in the transaction; balance test     |
| CR110-07  | major  | `src/server/db/queries/imports.ts:652-657`     | Unlinked rows from other providers counted as duplicates                | Fixed  | Unlinked candidates require the resolved account's number and provider and a unique owner; callers pass the resolved account; `tests/sync-adopts-file-rows.test.ts`    |
| CR110-08  | major  | `src/server/db/queries/transactions.ts:148-151`| COALESCE kept the file account when adopting a row                      | Fixed  | Adoption prefers the resolved account id; `tests/sync-adopts-file-rows.test.ts`                  |
| CR110-09  | major  | `src/server/db/queries/transactions.ts:1410-1440` | `insertFileImport` incompatible with the identity hash               | Fixed  | Checks the legacy and resolved-account identity hash with the sequence; `tests/import-history.test.ts` |
| CR110-10  | major  | `src/server/lib/import/forget.ts:23-30`        | Forget cleared human-selected categories                                | Fixed  | Writers keep `category_origin` consistent (`user`/`rule`); clear predicate preserves user picks; `tests/import-forget.test.ts` |
| CR110-11  | major  | `src/server/lib/import/reclassify.ts:23-39`    | Card bill covered by several purchases reclassified as expense          | Fixed  | Contiguous same-card charge sums within tolerance count as coverage; `tests/import-reclassify.test.ts` |
| CR110-12  | major  | `src/server/db/queries/assets.ts:563-579`      | Empty account discovery left prior credential holdings unreconciled     | Fixed  | Empty completed scope reconciles credential-keyed rows; legacy keys explicitly untouched; securities test |
| CR110-13  | major  | `src/server/db/queries/transactions.ts:132-137`| File-twin adoption could consume another account's row                  | Fixed  | Candidates are the resolved account, unlinked rows, or file-account rows; adoption test          |
| CR110-14  | minor  | `src/lib/import/text.ts:29-30`                 | `DR` after a currency suffix lost                                 | Fixed  | Amount token accepts a currency and then a direction suffix; `tests/import-engine.test.ts`       |
| CR110-15  | minor  | `src/lib/import/normalize.ts:236`              | Amount fallback used for nonblank unparsable debit/credit               | Fixed  | Fallback requires both raw cells blank; invalid row test                                        |
| CR110-16  | minor  | `src/server/lib/import/reclassify.ts:49-59`    | Transfer pairing accepted an opposite row on the same account           | Fixed  | Missing account ids require different numbers; same-number pair test                             |
| CR110-17  | minor  | `src/server/db/queries/receipts.ts:105-107`    | Failing cleanup entries could starve later files                        | Fixed  | Sweep orders by `attempts, id`; fairness test                                                   |
| CR110-18  | minor  | `import-workbench.tsx:615`                     | Pending-file finish failure was swallowed                               | Fixed  | The finish error reaches the save handler, keeping the pending id/token for a retry             |
| CR110-19  | minor  | `src/server/db/queries/accounts.ts:255-268`    | Label resolution disabled for bank/card providers                       | Fixed  | Labels resolve within the requested provider; same-provider label test                          |
| CR110-20  | minor  | `src/lib/import/extract.ts:20-23`              | Named-group guard rejected safe patterns                                | Fixed  | Group prefix is stripped and the pipe character is removed from the outer set; regex cases in `tests/import-engine.test.ts` |
| CR110-21  | minor  | `src/server/lib/import/categorize.ts:67-80`    | Remembered parents could be returned as suggestions                     | Fixed  | Separate `memoryCategories` is used only for memory; `tests/import-categorize.test.ts`          |
| CR110-22  | minor  | `src/server/db/queries/transaction-edits.ts:4` | Remember wrote merchant keys with the V1 normalizer                     | Fixed  | Imports `@/lib/merchant-normalize` (V2); `tests/import-forget.test.ts`                          |
| CR110-23  | minor  | `src/server/ai/providers/parse.ts:4-10`        | Structured confidence threw during numeric conversion                   | Fixed  | Only numbers and strings are converted; structured-confidence test                              |
| CR110-24  | minor  | `src/components/accounts/accounts-overview.tsx:174-181` | Short Excellence prefix no longer stripped                    | Fixed  | `stripInvestmentHousePrefix` removes both house names and `אקסלנס`; `tests/account-groups.test.ts` |
| CR110-25  | minor  | `src/components/transactions/review-inbox.tsx:118-137` | Pending memo compared with the saved memo                      | Fixed  | Compares with the latest queued memo; `tests/review-memo.test.ts`                               |
| CR110-26  | minor  | `.github/release-notes.md:111`                 | 088 implied code-only rollback                                          | Fixed  | Documents hash-format compatibility only and the required backup restore                        |
| CR110-27  | minor  | `SECURITY.md:210-211`                          | Image scan was described as a tag-release gate                          | Fixed  | States that `trivy-image` gates pushes to `main`, not tag releases                              |
| CR110-28  | minor  | `docs/reviews/quality-findings-ledger.md:40`   | Unescaped table pipes broke the QH-093-M01 row                          | Fixed  | Both pipes escaped                                                                              |
| CR110-29  | minor  | `src/server/lib/import/parse.ts:219-226`       | A short read parsed a truncated prefix                                  | Fixed  | Reads until EOF or the buffer is full, then applies the size cap                                |
| CR110-30  | minor  | `src/server/lib/import/save.ts:86-92`          | Tokenless retry of unfinished post-commit returned `alreadyImported`    | Fixed  | Both gates resume an unfinished batch and keep 409 for completed ones; service and route tests  |
| CR110-31  | minor  | `src/lib/xlsx.ts:94-111`                       | `workbook.xml` bytes counted twice                                      | Fixed  | Entry loads are cached and counted once; size-boundary test in `tests/xlsx.test.ts`             |
| CR110-32  | trivial| `tests/sync-dedup-identity.test.ts:43-44`      | Test asserted only `added` counts                                       | Fixed  | Asserts persisted providers, account ids, distinct hashes and replay count                      |

All 32 findings were verified as real; none were rejected. Verification run after rebasing the
fixes onto `cce7fc7`: `npx vitest run` (1,926 passed, 1 skipped across 295 passed and 1 skipped
test files), `npx tsc --noEmit`, `npm run lint`, `npm run format:check` and `npm run knip` all pass.

## Release gate

- No row is open. Every `Fixed` row points at a regression/route/migration test or a config/doc
  change; `Verified` rows cite the merged behavior that made the finding obsolete.
- Full suite: `npx vitest run` (1,926 passing, 1 skipped).
- Coverage: `npx vitest run --coverage` passes the ratcheted floors (76/67/74/78).
- Static gates: `npm run lint`, `npm run format:check`, `npm run knip`, `npx tsc --noEmit`.

## Post-review fixes

An independent review of the uncommitted release diff found and fixed 15 additional issues:
cleanup-queue path traversal, legacy card sign inversion, Hapoalim fallback/null-view handling,
debit/credit edit precedence, card credit columns, retry payload fingerprints, account-merge
balance conflicts, one-way migration rollback documentation, account identity at every hash call
site, a single rule-engine pass, shared rule-kind rounding, and four dead-code removals.
