# Security

Penny is designed to run **only on your own machine**. The threat model
below assumes you are not deploying this as a hosted service. If you do
deploy it, almost none of the assumptions hold.

## Assets

| Asset | Location | How it's protected |
|-------|----------|--------------------|
| Bank credentials | `data/penny.db` (`bank_credentials` table) | Encrypted with AES-256-GCM |
| Claude API key | `data/penny.db` (`settings` table) | Encrypted with AES-256-GCM |
| Encryption key | `data/.encryption-key` | File permissions `0o600` (owner read-write only). **Not encrypted itself.** |
| Transaction data | `data/penny.db` (`transactions` table) | Plaintext inside the SQLite file |

## What's protected at rest

Bank credentials and the Claude API key never sit on disk in plaintext.
They're encrypted with a 32-byte random key (`data/.encryption-key`)
using AES-256-GCM with a fresh IV per write. Anyone who reads the DB
file alone cannot decrypt them.

## What's NOT protected at rest

- The encryption key file itself is plaintext (hex). Whoever can read
  `data/.encryption-key` AND `data/penny.db` can decrypt your
  credentials.
- Transaction data (merchant, amount, date, category) is plaintext in
  the SQLite file. Someone with disk access can see all your spending.
- With the app lock on, `.app-lock.json` holds both the PIN hash and the
  PIN-wrapped key. A copied data directory can be attacked offline, so PIN
  length is the whole defence: new locks require 8+ digits and use
  `scrypt` N=2^17 (about a quarter second per guess per CPU core), which
  puts a brute force in the days-to-weeks range on a desktop, not hours.
  A long passphrase is much stronger than the shortest accepted PIN.
- A backup file holds the database and the key to the saved logins, under
  a passphrase the caller picks. With the app lock on, creating or
  restoring one asks for the lock PIN again, so a borrowed session is not
  enough. With the lock off, any program running on the machine can ask
  for one: **on a computer other people use, turn the app lock on.**

- The MCP server (`npm run mcp`, see [docs/mcp.md](docs/mcp.md)) has no browser
  session, so with the app lock on it presents a random 32-byte token that
  the app keeps in `data/mcp-token` (owner-only, like the key file). The
  token grants exactly this: `GET` on the fixed list of read-only routes in
  `MCP_READ_PATHS` (`src/proxy.ts`) — overview, transactions, budgets,
  assets, planned purchases, forecasts, insights, pension, insurance and
  sync state. It does not open any page, write, setting, backup, export or
  saved login, it never starts a session, and the Host and cross-site checks
  still apply. Those routes read only what is plaintext in the database, so
  anyone who can read the data folder to get the token could already read
  the database file. Deleting the file revokes it.
- On Windows the key file and the MCP token are restricted to the current
  user with `icacls` when they are written (the folder's inherited ACL is
  removed). If that fails the app logs one warning and carries on.
- Backup files derive their key with `scrypt` N=2^17 and record the cost
  in the file (format `PENNYBK2`); older `PENNYBK1` files (N=2^15) still
  restore.

The right defense for both is **full-disk encryption on your laptop**
(FileVault on macOS, BitLocker on Windows, LUKS on Linux). Turn it on.

## Network surface

The dev server binds to `127.0.0.1` only. It is not reachable from your
local network or the internet, unless you turn on phone access (see
"Phone access on the home network" below). The library only contacts:

- Your bank's domains (e.g., `digital.isracard.co.il`) — via Puppeteer
- `api.anthropic.com` — only if Claude is your AI provider: redacted
  transaction descriptions and amounts for categorising, aggregated totals
  and merchant names for "ask"
- `localhost:11434` (or the Ollama URL you set) — only if Ollama is your AI
  provider; the same data, on your machine
- `query1.finance.yahoo.com` — prices and exchange rates; receives the
  ticker symbols of your holdings and the currencies you hold, no amounts
- `data.gov.il` — the public pension and provident fund table, only if an
  asset is linked to a fund; nothing about you is sent
- `api.cbs.gov.il` — the public dwelling price index, only if a home has a
  purchase price; nothing about you is sent
- `api.telegram.org` — only if you connect the Telegram bot: your bot token
  and the messages the bot sends you (snapshots, merchant names, dates, and
  amounts unless you hide them)
- Cloudflare (the tunnel and Access) — only if you turn on remote access;
  Cloudflare terminates TLS and sees the request content in transit, but not
  the database, the key file or the tunnel token
- `api.github.com` — update check; receives the request only, no data. The
  Windows desktop app also downloads the installer from GitHub. Off in
  Settings -> Privacy & security
- An open banking API — only if you add one, at the address you enter;
  receives the token you gave it

Run with `mitmproxy` or Charles to verify this yourself.

## Phone access on the home network

Settings -> Privacy & security -> phone access is off by default. It is the
one mode where the server binds `0.0.0.0` instead of `127.0.0.1`
(`scripts/serve.mjs`, `desktop/main.cjs`), so a phone on the same Wi-Fi can
open `http://<private-ip>:41234`.

- The app lock must be on, and turning the lock off turns phone access off
  (`src/app/api/lock/route.ts`, `src/app/api/lan/route.ts`).
- Only private addresses are accepted (`10/8`, `172.16/12`, `192.168/16`,
  `fe80::/10`, `*.local`); the Host check still rejects everything else
  (`src/lib/host-guard.ts`).
- **The traffic is plain HTTP.** Penny has no TLS listener, so the lock PIN,
  the access login and the session cookie cross the Wi-Fi in clear text.
  Anyone who can sniff the network (a compromised device, a shared or guest
  Wi-Fi) can take the session and read the financial data behind it. Use it
  only on a network you control, never on public Wi-Fi. The in-app card says
  this too; treat it as a real limit, not a disclaimer.
- With the app lock on, the key on disk is the PIN-wrapped key: see
  "What's NOT protected at rest".

## Remote access

Settings -> Privacy & security -> Remote access is off by default. It uses a
Cloudflare tunnel so a phone can reach the same local app without opening a
port. The app lock must be on.

- Named mode verifies the `Cf-Access-Jwt-Assertion` header against the
  Cloudflare Access JWKS: signature, issuer, audience and expiry. If the key
  cache is empty or stale, the request fails closed.
- The tunnel hostname is added to the host guard only when it is configured;
  wildcards are rejected.
- Quick tunnels are development-only, require the app lock and an explicit
  `PENNY_REMOTE_QUICK_ACK=1`, and must not be left running.
- Cloudflare terminates TLS and sees request content in transit. It does not
  receive the database, the key file or the tunnel token. The tunnel token is
  read by the connector, not by Penny.
- Setup and recovery: [docs/remote-access.md](docs/remote-access.md).

## Chromium sandbox

The scraper launches Chromium via Puppeteer. By default we leave Chromium's
renderer sandbox **on** — if a compromised bank page or a chained Chromium
CVE ever triggers RCE in the renderer, the sandbox contains it instead of
giving an attacker the same OS-user privileges as the Penny process.

The sandbox works out of the box on macOS, Windows, and most Linux installs.
It fails to start in two scenarios:

- Running as root on Linux
- Running inside a Docker container without the kernel capabilities the
  Chromium sandbox needs (most off-the-shelf images)

In those cases set `PENNY_DISABLE_CHROMIUM_SANDBOX=1` in your environment.
Prefer running as a non-root user instead when you can — that keeps the
sandbox on.

## CSRF defense

Next.js middleware (`src/proxy.ts`) rejects any mutating API
request (POST/PUT/PATCH/DELETE) whose `Origin` or `Referer` header
doesn't match the app's own host. This prevents a malicious tab in
your browser from triggering syncs / category changes against your
localhost.

## Browser security headers

Configured in `next.config.ts`:

- `X-Frame-Options: DENY` — no embedding in iframes
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` — camera, microphone, geolocation, payment all disabled
- `Content-Security-Policy` — restricts script/style/connect sources

## Dependency hygiene

The credential-touching libraries are pinned to exact versions in
`package.json` (no caret prefix):

- `israeli-bank-scrapers` — scrapes your bank with your password
- `better-sqlite3` — reads/writes the DB file
- `@anthropic-ai/sdk` — sends data to Claude

Run `npm run security:audit` to check for known vulnerabilities, and
`npm run security:outdated` to see if anything is out of date. Re-audit
after every upgrade.

### Known audit findings (checked 2026-11-22)

`npm audit --omit=dev` reports 12 high-severity advisories, all inherited from the
`puppeteer` tree that both bank scraper libraries drive. None of them is on a path Penny
runs:

- `extract-zip`, `basic-ftp`, `get-uri`, `proxy-agent`, `pac-proxy-agent`: reachable only
  from `@puppeteer/browsers`, which downloads and unpacks a browser or reads a proxy
  config. Penny never downloads a browser (`PUPPETEER_SKIP_DOWNLOAD`, system Chromium via
  `PUPPETEER_EXECUTABLE_PATH`) and sets no proxy, so these functions are never called.
- `zod` inside `chromium-bidi`: validates messages from the local browser process over the
  WebDriver BiDi transport. The scrapers speak CDP to a local Chromium, so BiDi is off.

`@sergienko4/israeli-bank-scrapers` is on 10.1.1, which is browserless: it took
`camoufox-js`, `playwright`, `glob` and `minimatch` out of the tree, and the four moderate
advisories with them.

The rest go away only with Puppeteer 25, which both scraper libraries exclude (`^24`) and
which is ESM-only, while `puppeteer-extra` (the pension scraper) patches Puppeteer internals
through CommonJS `require`. Forcing it would put the pension sync at risk for no reachable
gain, so the tree stays on 24 until those libraries ship support.

Do not run `npm audit fix --force`: it downgrades `israeli-bank-scrapers` to 6.7.1. CI fails
on any new **critical** advisory through `npm run security:audit:gate`.

### Container image findings

`trivy-image` fails CI on every fixable HIGH or CRITICAL finding in the built image. The scan runs
on pushes to `main`; the tag release workflow does not depend on it, so a tag release must confirm
the image scan passed for the commit being tagged. A failed base-image package is fixed in the
Dockerfile, never suppressed in
`.trivyignore`: the runtime stage runs `apt-get upgrade -y` before installing Chromium so
Debian security updates (for example `CVE-2025-6020` in `libpam`) replace the versions
shipped by the pinned base tag. `.trivyignore` stays reserved for dependency paths that the
application provably never executes, and each entry is documented above.

## Threats this design accepts

| Threat | Why we accept it |
|--------|------------------|
| Local attacker with file system access | Out of scope for a local app. Use full-disk encryption. |
| Compromised laptop / malware | Out of scope. Don't run untrusted code. |
| Supply chain attack on a transitive dependency | Real, mitigated by pinning + `npm audit`. |
| Bank changes its UI and the scraper breaks | Library updates fix this; we pin so they don't auto-upgrade. |
| Bank blocks/flags automated logins | Possible. Many banks tolerate it; some don't. |
| Memory dump of the Node.js process | If you can do this you've already won. |

## What to do if you're more paranoid

In rough order of effort vs. benefit:

1. **Enable full-disk encryption** on your laptop (highest payoff)
2. **Enable login notifications** at your bank
3. **Use a unique strong password** for the bank account (not reused)
4. **Pin dependency versions** (already done for the sensitive libraries)
5. **Audit `node_modules/israeli-bank-scrapers/lib/` once** to convince
   yourself it only touches bank domains. ~300 lines per scraper.
6. **Use a separate, low-limit credit card** for daily spending and only
   track that one in Penny
7. **Run sync with `Show browser during sync` enabled** the first few
   times so you can watch Puppeteer drive the bank's actual login page
8. **Monitor outbound network traffic** with `mitmproxy` or Little Snitch
9. **Move `data/.encryption-key` into your OS keychain** (macOS Keychain,
   Windows DPAPI, Linux Secret Service). Not implemented yet — see the
   roadmap below.

## Roadmap improvements

These would meaningfully harden the app. None of them are required for
a personal local install; each adds friction in exchange for additional
defense.

- **Master password to unlock the app on startup.** Derive the
  encryption key from the password via Argon2id. Removes
  `data/.encryption-key` from disk entirely.
- **OS keychain integration** for the encryption key (macOS Keychain
  via `node-keytar`, etc.).
- **Whole-DB encryption** with SQLCipher instead of just the credential
  columns. Hides transaction data from anyone with disk access.
- **Per-credential key wrapping** (KEK/DEK pattern) so a compromised
  key only exposes one credential at a time.
- **Audit log** of every API mutation with timestamps.

## Always-on service

If you install Penny as a background service (`npm run service:install`),
the server runs from login to logout (or from boot to shutdown). This
changes how some surfaces look. The guarantees:

**The server still binds only to `127.0.0.1`.** The `npm run start`
script hardcodes `-H 127.0.0.1 -p 41234`, and every per-OS template
(LaunchAgent plist, systemd unit, Task Scheduler XML) invokes it with
those flags. The installer runs a post-install check and refuses to
finish if it detects the server listening on a non-loopback address.
Phone access is the single documented exception: with the app lock set,
the launcher restarts the server on `0.0.0.0`, and `npm run service:status`
reports that listener as non-loopback on purpose.

**No new daemon runs as root or SYSTEM.** The installer refuses to run
as root. The LaunchAgent and systemd user unit run under your user.
The Windows scheduled task uses `LeastPrivilege` and runs as the
installing user, not as `SYSTEM`.

**The hostname is loopback-only.** Penny uses `penny.localhost`, which
RFC 6761 reserves as loopback. macOS and Linux resolve `*.localhost`
to `127.0.0.1` natively through the system resolver, so no hosts file
edit is needed there. On Windows, `npm run service:install` appends
`127.0.0.1 penny.localhost` to the hosts file as a compatibility
fallback (the only step that requires elevation, and it prompts
interactively). The block is bracketed with markers and removed
cleanly by `npm run service:uninstall`. No mDNS / Bonjour service is
ever registered, and the loopback address never resolves from another
device on your network.

**The health endpoint discloses minimum information.** `GET /api/health`
returns `{ok, version, hasDb}` and nothing else. No transaction counts,
no provider names, no setup status. Add to it only if you have thought
carefully about what a local cross-app attacker could learn.

**The macOS menu bar app has no network entitlements beyond loopback.**
`Penny.app` ships with an `NSAppTransportSecurity > NSExceptionDomains`
entry whitelisting `127.0.0.1` and nothing else. It cannot reach the
internet even if its code were modified to try, without re-signing the
bundle with a different Info.plist.

**Logs do not leak credentials.** macOS LaunchAgent stdout/stderr go to
`~/Library/Logs/Penny/{out,err}.log` (directory mode `0700`). Linux
systemd writes to `~/.local/state/penny/log/`. The app itself already
avoids logging credentials (see "What's protected at rest" above);
the always-on service does not change that.

**The encryption key file's permissions are now asserted at startup.**
`src/server/lib/encryption.ts` reads `data/.encryption-key` and refuses
to start if the file mode is not `0600` (POSIX only; Windows relies on
the user profile ACL). If you ever `chmod 644` the key file by accident,
the server will fail loudly with the fix command.

**What the always-on service does not protect against:**

- A local attacker who can already run code as your user. They can read
  the DB and key file with or without the service running.
- A malicious browser tab on your machine doing a CSRF against
  `127.0.0.1:41234`. The same-origin middleware in
  `src/proxy.ts` already blocks this on every mutating request,
  and that protection works the same whether the server runs on demand
  or always-on.

## Reporting a security issue

This is a personal project. If you find a security issue, open an issue
on the repo. There is no bug bounty.
