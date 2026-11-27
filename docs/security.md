# Penny security and privacy review (2026-11)

Scope: a single-user, local-first app. Next.js 16 server on 127.0.0.1, better-sqlite3 database
and encryption key in `PENNY_DATA_DIR`, bank scraping through Puppeteer, optional Telegram bot and AI.
Attackers considered: a hostile website open in the same browser, another device on the LAN,
malware or a person with read access to the disk or a backup, a cloud provider seeing prompts,
someone looking at the screen. Out of scope: an attacker running code as the same OS user (game over
for any local app without an OS-level secret store).

Legend: **Fixed** = changed in this commit. **OK** = already in place. **Open** = documented, not built.

## 1. Network exposure

| Item | Status |
|---|---|
| Bind address: `next dev/start -H 127.0.0.1`; Docker publishes to `127.0.0.1` | OK |
| Phone access (off by default): binds `0.0.0.0`, requires the app lock, plain HTTP on the home network | **Built**, documented in SECURITY.md |
| DNS rebinding: `src/proxy.ts` rejects any `Host` not in the localhost list (`src/lib/host-guard.ts`, `PENNY_ALLOWED_HOSTS` to extend) | OK |
| CSRF: every POST/PUT/PATCH/DELETE under `/api` needs an `Origin` (or `Referer`) equal to the host; `Origin: null` is rejected | OK, now tested (`tests/proxy.test.ts`) |
| Cross-site reads and side-effect GETs (`<img src=/api/...>`): any `/api` request with `Sec-Fetch-Site: cross-site` or `same-site` is rejected | **Fixed** |
| Host + Origin checks are the boundary when the app lock is off | OK |
| Phone quick-add `POST /api/quick-add`: the one path that skips the session cookie, lock gate and Origin check; needs `Authorization: Bearer` with a per-device token (32 random bytes, stored as SHA-256, shown once, revocable). Host allowlist and cross-site rejection still apply; cookies and `x-workspace-id` are stripped, the token names the workspace. A browser cannot attach the header cross-origin without a preflight, which is never answered | **Built**, tested (`tests/quick-add-route.test.ts`) |
| App lock (optional, off by default) | **Built** |

**App lock** (`src/server/lib/app-lock.ts`, Settings, Privacy & security). Passphrase of 8+ characters
or a PIN of 8+ digits, hashed with `crypto.scrypt` (r=8, p=1, N=2^17 for new locks, N=2^15 for lock
files written before that change, random 16-byte salt) and compared with
`timingSafeEqual`. When on, `src/proxy.ts` lets through only `/lock`, `/api/lock/unlock` and static
assets; pages redirect to `/lock`, `/api` answers 401. The session is a random 32-byte token in an
HttpOnly, SameSite=Strict, Path=/ cookie (Secure over https), kept only in server memory with an idle
expiry of 5, 15 (default) or 60 minutes that each request refreshes. A restart ends every session.
Failed unlocks back off exponentially (1s, 2s, 4s ... up to 15 min, in memory). Changing or turning off
the lock needs the current passphrase. "נעילה עכשיו" in the sidebar footer ends the session at once.

**Recovery code.** Turning the lock on shows a 25-character recovery code once (Crockford base32, 125
bits). It is another wrap of the data key (AES-256-GCM under HKDF-SHA256 of the code, fresh salt); only
the wrap is stored, never the code. It works wherever the passphrase does (lock screen, change, turn off),
so a forgotten passphrase is reset with it. "New recovery code" (needs the current passphrase) replaces
the wrap, which cancels the old code. Wrong codes count toward the same back-off.

**Passkey unlock (WebAuthn + PRF).** With the lock on, Settings can register one or more passkeys after
the current passphrase is checked. The RP id is the host in use (`localhost`, `penny.localhost`); a
passkey works only on the host it was made on. WebAuthn needs a secure context and a domain name, so the
option is hidden, with the reason, on `127.0.0.1` and on plain-http LAN addresses. Each passkey must
support the PRF extension: its PRF output on a random per-passkey input is the HKDF input for a
key-encryption key, and the data key wrapped under it is stored in `.app-lock.json` beside the
passphrase wrap (public key, counter, RP id, PRF input, wrap; no key in the clear). Browsers that report
no PRF support are not offered registration; an authenticator without PRF is refused at registration and
nothing is saved. Registration verifies the attestation (none) and a follow-up assertion that yields the
PRF output. Unlock: the server issues a single-use challenge (5 min), verifies the assertion with
`@simplewebauthn/server` (challenge, origin, RP id, user verification, signature, counter must not go
back), then unwraps with the PRF output; a wrong output fails the GCM tag, so the browser cannot invent
one. Failures share the passphrase back-off. Changing the passphrase keeps passkey and recovery wraps
(same data key); removing a passkey drops its wrap; turning the lock off shreds the whole file with
every wrap in it. The PRF output passes through the browser and the server's memory, like the passphrase.
Trade-offs: the lock is per server, not
per browser; an in-page fetch after idle expiry gets 401 until the next navigation shows the lock screen.
A LAN self-hoster who adds a host to `PENNY_ALLOWED_HOSTS` should turn the lock on. Phone access
(Settings -> Privacy & security) needs the lock by design and is plain HTTP: the PIN, the login and
the session cookie cross the Wi-Fi unencrypted.

## 2. XSS and browser hardening (`next.config.ts`)

| Item | Status |
|---|---|
| CSP `default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` | OK |
| `object-src 'none'`; dropped `fonts.googleapis.com`/`gstatic` (next/font self-hosts) and `api.anthropic.com`/`:11434` from `connect-src` (only the server calls them) | **Fixed** |
| `'unsafe-eval'` only in development | **Fixed** |
| `script-src 'unsafe-inline'` remains. Next 16 supports per-request nonces via the proxy, but that makes every page dynamic. Inline-script XSS still needs an injection point; React escapes output and the app uses no `dangerouslySetInnerHTML` on data. | Open (accepted) |
| `Referrer-Policy: no-referrer` (was `strict-origin-when-cross-origin`) | **Fixed** |
| `Permissions-Policy` extended (usb, serial, hid, bluetooth, midi, display-capture, topics) | **Fixed** |
| `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-DNS-Prefetch-Control: off` | **Fixed** |
| `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` | OK |

## 3. Secrets at rest (`src/server/lib/encryption.ts`)

Bank credentials, the AI API key and the Telegram token are AES-256-GCM encrypted with a random 32-byte
key in `<data>/.encryption-key` (mode 600 enforced on POSIX; Windows relies on profile ACLs).
The key sits next to the database, so a copy of the data folder (backup, synced folder, stolen disk)
decrypts everything. Status: OK for a casual disk reader, weak for backups.

**Key wrapping: Built.** With the app lock on, the data key is wrapped with AES-256-GCM under a key
derived from the passphrase (scrypt, N=2^15, its own salt, separate from the hash salt) and stored in
`<data>/.app-lock.json`; the plaintext `.encryption-key` (and a legacy `./data` copy) is overwritten
with random bytes and deleted. Unlocking unwraps the key into process memory only. Changing the
passphrase re-wraps with fresh salts; turning the lock off writes the plaintext key file back, so the
app behaves exactly as before. Users who never turn the lock on see no change.
Trade-off: **scheduled sync and the bot need one unlock after every restart.** Until then nothing
decrypts: the scheduler skips the slot and tries the next one, a sync reports
"האפליקציה נעולה — פתחו אותה כדי לסנכרן", AI with a cloud key is skipped, a bot token saved in settings
cannot be read so the bot starts on unlock (a bot from `TELEGRAM_BOT_TOKEN` answers that the app is
locked). "Lock now" keeps the key in memory so scheduled sync keeps working; only a restart forgets it.
Overwriting before unlink is best effort on SSDs and copy-on-write file systems; disk encryption still
matters. Older backups of the data folder still hold the old plaintext key.

**Open:** store the key in the OS keychain (Windows DPAPI/Credential Manager, macOS Keychain, libsecret)
as an alternative for users who do not want a passphrase.

## 4. Database at rest

Transactions, balances, merchants and notes are plaintext SQLite. Column encryption would break
search, sorting and aggregation in SQL; SQLCipher (`better-sqlite3-multiple-ciphers`) is the clean
route and pairs with the key work above. **Open.** Until then the privacy page tells users to enable
BitLocker/FileVault.

## 5. Logs

New `src/server/lib/redact.ts` scrubs API keys, Telegram tokens, bearer values, `password/otp/id/...`
pairs, emails, card-number groups and any 5+ digit run (IDs, accounts, cards). Dates and short amounts stay; an amount of 5+ digits written inside a description is hidden too (the transaction's own amount field is not touched).
Applied to scraper errors (replaces the older narrower `sanitizeError` rules), sync route and
orchestrator errors, AI batch failures (previously logged the raw error object, which can include
the provider response), the scheduler, and the bot. **Fixed** (`tests/redact.test.ts`).
Errors are logged as `name: message` only, no stacks.

## 6. Telegram bot (`src/server/bot`)

| Item | Status |
|---|---|
| Linking: one-time 48-bit random code, compared with `timingSafeEqual`, deleted after use | OK |
| Only the linked chat gets answers (`handleCommand` returns null for others) | OK |
| Token encrypted in settings | OK |
| Rate limit: Telegram itself rate-limits; non-owner chats get no reply, so there is nothing to brute force once linked | OK |
| "הסתרת סכומים בטלגרם" (Settings, Telegram, off by default) replaces every amount in bot replies with "•••"; messages sit on Telegram's servers | **Built** |
| While the app is locked after a restart, the bot answers only that the app is locked | **Built** |

## 7. AI providers (`src/server/ai`)

Local Ollama is the default. With a cloud provider, the categorisation prompt sends, per transaction,
the merchant description, currency, absolute amount and memo, plus category names. Now the description
and memo pass through `redact()`, so account, card and ID digits and emails never leave (they do not
help categorisation). **Fixed.** Names in transfer descriptions (for example a person's name in a bank
transfer) no longer go out: a cloud prompt keeps only the transfer's kind ("העברה", "bit") and drops the name. Turning on a
cloud provider needs a consent checkbox that lists exactly what is sent. **Fixed.** The "ask" feature sends aggregates; review it in the same pass.

## 8. Screen privacy

New privacy mode: an eye button in the sidebar footer and a switch on Settings, Privacy & security
blur every tabular number, figure and chart label. State is in a cookie so the server renders it and
numbers never flash on load. Screen readers still read the values (blur is visual only). **Fixed.**

## 9. Backups and exports

CSV/XLSX exports and copies of the data folder are plaintext and the folder copy includes the key.
**Built:** password-protected backup (AES-GCM with an scrypt-derived key, `.pennybak` file, Settings → Data).
The export card warns that CSV/OFX files are plaintext and points to the encrypted backup. **Fixed.** The privacy page already warns that a folder backup contains the key.

## 10. Deletion

Settings, Data has "delete everything" for transactions, sync history and category memory; bank
connections are removed per bank. The new Privacy & security page links to it.
**Full wipe: Built.** "מחיקת כל הנתונים" on Privacy & security (type "מחיקה", plus the passphrase when
locked) stops the bot, closes and deletes the database files (`penny.db`, `-wal`, `-shm`: every table,
including credentials, settings, AI keys and Telegram), the key file or wrapped key, and `*.log` /
`logs/` in the data folder, then returns to first run (migrations recreate an empty database).
Files are overwritten before unlink, best effort as above.

## 11. Dependencies (`npm audit --omit=dev`, 2026-11-22)

12 findings, all high, all transitive under the `puppeteer` tree that
`israeli-bank-scrapers` and `israeli-pension-scrapers` drive (extract-zip, basic-ftp, get-uri,
proxy-agent, pac-proxy-agent, and zod inside chromium-bidi). The download-and-unpack path is
dead in Penny: no browser is downloaded (`PUPPETEER_SKIP_DOWNLOAD`, system Chromium), no proxy is
configured, and the scrapers speak CDP rather than BiDi, so chromium-bidi's zod validation never
runs. **Triage documented, not fixable in range**: see SECURITY.md, "Known audit findings".
`@sergienko4/israeli-bank-scrapers` is on 10.1.1 (browserless), which removed camoufox-js,
playwright, glob and minimatch and the four moderate advisories that came with them. CI fails on
any new critical advisory (`npm run security:audit:gate`).

## 12. Update check

`src/server/update/check.ts` calls `api.github.com` for the latest commit on the branch. It sends no
user data; GitHub sees the IP and a request per check. Settings > Privacy has a switch that turns it off (banner,
bot notice and the Windows self-update). **Fixed.**

## 12a. Docker egress allowlist (optional, off by default)

`docker/egress/compose.yml` puts the app container on an internal-only network: it has no route and no
DNS to the internet. Its only way out is the `egress` container (tinyproxy, `docker/egress/`), which
allows CONNECT to port 443 only for the domains in `docker/egress/allowlist.txt` (a domain admits its
subdomains): the banks, card companies and pension funds the scrapers use, plus `api.github.com` for the
update check. Everything else gets 403 from the proxy, and anything that ignores the proxy fails closed.
The egress container also publishes the app's port on `127.0.0.1` (an internal network cannot).
Node's `fetch`/`http(s)` use the proxy via `HTTP(S)_PROXY` + `NODE_USE_ENV_PROXY=1`; the bank scraper's
Chromium gets `--proxy-server`, and Chromium launched by the pension scraper reads the same variables.

    docker compose -f docker-compose.yml -f docker/egress/compose.yml up -d --build

**Adding a domain:** add a line to `docker/egress/allowlist.txt` (for example your AI provider's API
host, or the optional market-data hosts listed there commented out), then
`docker compose -f docker-compose.yml -f docker/egress/compose.yml restart egress`. Or set
`PENNY_EGRESS_EXTRA=host1,host2` in `.env` and run the `up -d` command again. Refused hosts show in
`docker compose ... logs egress` as "Proxying refused on filtered domain". Features whose host is not
listed (market prices, public datasets, an AI provider) fail until it is added.
Verified with `docker compose`: an allowed host (api.github.com, a bank) answers through the proxy; a
host not listed (example.com, a look-alike `evil<bank>.co.il`) is refused; a direct connection has no DNS.

## 13. Desktop self-update

The Windows app installs an update only when the installer's SHA-256 is in the release's `SHA256SUMS.txt`
**and** that list carries a valid Ed25519 signature (`SHA256SUMS.txt.sig`) by the release key. The private key
lives only in the `PENNY_UPDATE_SIGNING_KEY` GitHub secret (and the maintainer's offline copy); the public key is
built into `desktop/update.cjs`. A release published without the key (a stolen token, a hijacked workflow) is
never installed silently. The release workflow fails when the secret is missing. **Fixed.**
