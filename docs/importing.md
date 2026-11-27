# Importing statement files

For accounts Penny can't sync, or months the bank no longer shows:

- **Upload:** Settings → Accounts & import → "Import a file", then pick the account.
- **Import folder:** Penny watches a folder (shown on the same page; `./imports` in Docker) with one subfolder per account, such as `max (1234)`. A file dropped there is imported and moved to `imported/`, or to `failed/` with a note saying why. For an account Penny doesn't sync, create a folder with its name.

A transaction that arrives from both sync and a file is stored once (same account and amount, at most a day apart). The synced copy wins and keeps your category, notes and tags.

## Smart sheet import

Settings → Accounts & import → Import files → "Smart sheet import". Paste a table as it is, from Excel or Google Sheets to a bank file or a list you typed. A header row is detected on its own (date, description, amount, type, account, category, tags, owner, business percentage, memo), and without one Penny asks you to map columns. Every cell is editable in place, Enter moves down, Ctrl+D copies the cell above, and you can download a CSV template or copy the header row.

The account you pick per row decides how it is saved: on cash it becomes a manual transaction you can always edit, and on a real account it enters like a file import so the next sync does not duplicate it. A transaction that already exists on that account (same amount, one day apart) is marked and skipped, but you can include it again. Categories are suggested from merchants you have already taught, and after saving you can undo the whole import at once.

## Pension report import

An agent's or advisor's periodic report (pension, study fund, provident and the insurance in it) can be imported as JSON: Settings → Accounts & import → Pension, study funds and investments → "Import pension report". Each product lands in assets with its value from the report date, its management fees and monthly deposit, and each policy lands in insurance. The report is validated against its own total, and importing the same report again updates instead of duplicating. Penny does not read PDFs; any tool that extracts the data to JSON following [the example](../public/pension-report.example.json) works, and the full format is in [pension-report.md](pension-report.md).

## Import v2 (opt-in per workspace)

The new workbench is behind the `import_v2` workspace setting (`PENNY_IMPORT_V2=1` forces it on; new workspaces start with it). It replaces the file card, not the smart sheet.

1. **Choose a source.** Upload CSV/XLSX/HTML or a real `.xls` that is actually HTML, paste statement text, or send a PDF/photo through the AI-assisted document route. Uploads parse in the browser when possible and fall back to the server; folder files are read only from the import folder.
2. **Map once.** The header row is detected, but every column can be remapped: date, processed date, description, amount, debit/credit, kind, memo, balance, reference, original amount/currency and installments. A card file gets the original amount from "???? ????" and the charged amount from "???? ????"; a bank file can be day-first, month-first or ISO, and the direction can be flipped before saving. A mapping is stored per workspace, not per browser, keyed by format + sheet + header fingerprint.
3. **Check the grid.** Every cell is editable: include, kind (expense/income/transfer/refund), account, category, memo. Transfers get no category. A category of the wrong kind is rejected. The status column explains why a row is ready, a duplicate, a possible duplicate or an error.
4. **Preview.** Duplicates are matched one-to-one by account, amount, date �1, description similarity and reference; a possible duplicate is never skipped silently. Categories come from your own choice, rules, merchant memory, the file's category column, the built-in dictionary (through a stable category key) and patterns, in that order. A generic description like "?????" is not guessed.
5. **Save.** The server validates and re-classifies again, then writes the batch and its per-row outcomes. The same file hash returns 409 with the previous batch id unless you force it; the same client token is idempotent. A card bill becomes a transfer only when a card account explains it, and a loan deposit is never income.
6. **Undo.** Undo one batch or every chunk of a large file. Rows a bank sync has adopted are kept (with your category, notes and tags); imported rows and their receipts are removed, and foreign-key checks stay clean.

Folder files that cannot be parsed appear in the pending inbox, where you can open them in the workbench, retry or ignore. The review inbox now lets you add a memo and mark a row as an internal transfer.
