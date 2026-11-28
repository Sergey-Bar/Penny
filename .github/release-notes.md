# Penny v0.7.0

Penny 0.7.0 is a cumulative release. **0.6.0 was not tagged or released separately**, so upgrading
from 0.5.0 brings the import-v2 foundation, the 0.7.0 quality-hardening pass, the durable backend
and Pip v2 together. The detailed history is in
[CHANGELOG.md](https://github.com/Sergey-Bar/Penny/blob/main/CHANGELOG.md).

## Highlights

### Import v2 and account identity

- **Import v2 workbench** (the new-workspace default): CSV, XLSX, HTML, pasted tables and PDF
  statements; header detection; full column remapping; editable grid; deterministic preview;
  per-row duplicate reasons; saved mappings; import history and undo.
- **Accounts are entities.** A statement, a folder file and a sync land on the same account by
  number, alias or label. An ambiguous fuzzy match asks before merging; a currency mismatch or a
  same-numbered account at another provider is never guessed.
- **Dedupe and replay are account-aware.** Stored-row identity includes the provider and account
  row while the legacy hash stays readable. A retry with the same client token returns the committed
  batch even when the file hash would reject a fresh upload. Interrupted post-processing is
  persisted, rerun and reported honestly.
- **Undo is transactional.** Imported rows, receipt records, expense shares and flow matches are
  removed inside the undo transaction; receipt files are removed only after commit, and failed
  unlinks stay in a retry queue.

### Import correctness

- A zero debit no longer hides a credit; debit/credit columns keep their direction through
  normalization; mixed-sign card files keep refunds positive; and a card bill becomes a transfer
  only when a card row or a matching amount explains it.
- Preset exact headers win over loose words, header-only bank presets are not trusted for
  all-positive files, short header aliases no longer match inside longer words, and foreign
  purchases are not classified as bank fees.
- Request bodies are read under a real byte cap (JSON, multipart and chunked), duplicate row indexes
  and non-finite or contradictory signs are rejected, row accounts must match the destination, and
  calendar-invalid dates fail validation.
- XLSX decompression is counted per entry and per workbook against an actual byte cap; HTML
  `colspan`/`rowspan` values are clamped. The batch marker, rows and counts commit together, so a
  failed save cannot leave a half-imported batch.
- The import grid keeps per-row accounts, tags, dropped-row errors and chunked preview/save state;
  a failed chunked save reuses its group and token on retry.

### Accounts, balances and investments

- Account resolution respects currency and never borrows another provider's number; an ambiguous
  result is stored as unresolved instead of being attached to the wrong account. A sync no longer
  overwrites a memo you wrote.
- Linked balances key on the account row, so a balance follows the account and its currency instead
  of the printed provider/number pair.
- Hapoalim securities reconcile stale holdings only within the synced credential and account
  scope; a cleared holding also gets a zero snapshot, fallback capture shares the capture deadline,
  and an incomplete capture returns no result instead of an empty portfolio.
- Provider grouping applies to investments only; account-name prefixes strip in both UI languages,
  and the provider name is escaped before it becomes a regular expression.

### Security and AI

- The container runtime upgrades Debian security packages before installing Chromium, clearing the
  fixable `libpam` HIGH finding (`CVE-2025-6020`) instead of suppressing it, and pins the base
  manifest it was built from.
- The AI setup endpoint validates its body with a strict schema; empty keys, unknown providers and
  extra fields are rejected before any setting is written.
- Both AI providers share one defensive response parser: linear first/last-bracket slicing,
  malformed JSON returns no suggestions, and confidence is range-checked.

### Durable backend, Pip v2 and remote access

- **Durable jobs** behind `backend_v2` (off/shadow/on): critical and maintenance lanes, idempotent
  enqueue, leases and heartbeats, retry backoff, dead letters, admin retry/cancel, startup recovery
  and graceful shutdown. Sync post-processing is enqueued atomically with the save and checkpoints
  each step.
- **Provider health** retries transient failures and applies 24-hour cooldowns for auth, 2FA and
  site-change failures. Money writes accept an `Idempotency-Key` with replay/conflict handling.
- **Integrity and repair**, hourly local snapshots (24 kept) and a restore drill; request IDs, a
  redacted JSON event log, daily metrics, admin ops status and a public readiness probe.
- **Pip v2** behind `pip_v2` (off by default): evidence-first answers from a versioned read-only
  tool registry, a deterministic no-model fallback, a numeric verifier, seeded calculators, a daily
  briefing and recorded agent runs. `PENNY_PIP_KILL=1` disables chat and briefings without deleting
  data.
- **Remote access** is opt-in: a named Cloudflare tunnel with Access JWT verification, or a
  development-only quick tunnel. Both require the app lock and fail closed without a valid token.

## Quality-hardening findings ledger

Every finding from the reviewed provider-grouping, Hapoalim-securities, AI-provider and import-v2
PRs is tracked once in
[docs/reviews/quality-findings-ledger.md](https://github.com/Sergey-Bar/Penny/blob/main/docs/reviews/quality-findings-ledger.md).
No row is open: each `Fixed` finding points at a regression, route or migration test; `Verified`
findings cite the merged behavior that made them obsolete. The pass also found and fixed 15 issues
in an independent review of the release diff, including cleanup-queue path traversal, legacy card
sign inversion, account-merge balance conflicts and one-way migration rollback documentation.

## Migrations and rollback

Upgrading from 0.5.0 applies eight migrations:

| Migration | Purpose |
| --- | --- |
| `081_import_v2` | Accounts, import batches and rows, pending folder files, mapping profiles and the account/origin/source columns. The 0.6.0 migration, included here. |
| `082_backend_jobs` | Durable jobs and attempts, locks, provider health, audit, metrics, idempotency keys, insight snapshots, sync post-processing status, merchant keys and category confidence/reasons. Additive. |
| `083_pip` | Pip threads, messages, tool calls, memory, consent, feedback, briefings, agent runs, approvals and evaluation runs. Additive. |
| `084_pension_sync_logs` | Pension and investment-house sync history. |
| `085_pension_multi_connections` | Multiple labelled connections per investment house. |
| `087_asset_snapshots_details` | Native value, currency and ILS cost basis on asset snapshots. |
| `088_import_dedup_account_identity` | Account-identity dedupe hash with the legacy hash preserved, replay/post-commit status and the pending file-cleanup queue. |
| `089_account_balance_identity` | Rebuilds account balances around one linked row per account and a legacy provider+number row until the account is known. |

**`089` is one-way.** An older image cannot write against its partial unique indexes, so rolling
back the image requires restoring the pre-migration database backup. The app and the Docker updater
keep a backup before applying pending migrations; restore that copy rather than reverse-migrating.
`088` keeps the old hash in `dedup_hash_legacy`, so a code rollback can still read existing rows.

## Validation

Validated on 2026-11-27 against this tree:

- **Vitest:** 1,887 passed, 1 skipped (the Windows run; the Linux image build skips the
  Windows-only key-file ACL test as well, reporting 1,886 passed and 2 skipped).
- **Coverage:** 76.56% statements, 67.39% branches, 74.37% functions, 78.61% lines.
- **Static gates:** `tsc --noEmit`, ESLint, Prettier, knip and the anonymity check.
- **Builds:** Next production build; desktop installers; Docker image build.
- **E2E:** 44 passed, 8 skipped.
- **Image scan:** Trivy reported zero fixable HIGH/CRITICAL findings at validation time. Re-run the
  image scan at tag time because the vulnerability database changes daily.
- **Operations:** restore drill passed; 20,000-row backend benchmark passed.

## Install

Pick one. Your data stays on your computer in every option.

> **Desktop installs of 0.4.0 or older:** updates are signed with a new key since 0.5.0, so download
> this version once by hand. Updates install automatically again after that. Installs of 0.5.0 or
> newer update normally.

### Windows: desktop app

1. Download **`Penny-Setup-0.7.0.exe`** below and run it.
2. Windows SmartScreen may warn that the app is not signed: click **More info → Run anyway** (once).
3. Penny opens from the Start menu. When a new version is out it asks to restart (or installs when
   you close it).

### Mac: desktop app

1. Download the **`.dmg`** for your Mac: `arm64` for Apple Silicon (M1 and newer), `x64` for Intel.
2. Open it and drag Penny to Applications.
3. The app is not notarized by Apple yet, so the first open is blocked. Open
   **System Settings → Privacy & Security** and click **Open Anyway** (once). If macOS says the app
   is damaged, run `xattr -cr /Applications/Penny.app` in Terminal and open it again.
4. Bank sync uses Google Chrome or Microsoft Edge, so install one of them if you have neither.

### Docker: Windows, Mac or Linux

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux).
One command downloads the newest release into `~/Penny`, builds it and starts it:

```bash
# Mac / Linux
curl -fsSL https://raw.githubusercontent.com/Sergey-Bar/Penny/main/install-docker.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/Sergey-Bar/Penny/main/install-docker.ps1 | iex
```

Penny opens at http://127.0.0.1:41234. To update later, run the same command again: it backs up your
data first and rolls back if the new version fails.

Statement files from banks and investment houses go into the import folder (Settings → Data shows
it; in Docker it is `imports/`).