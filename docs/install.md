# Installing and running Penny

The quick start is in the [README](../README.en.md). This page has every option and the details.

## Requirements

- **Windows 10/11, macOS 13+ or Ubuntu 22+** (with systemd)
- **Node.js 22+**, only when installing from source
- To build the desktop app from source (optional): `npm run desktop:build`. The ready-made installers need no Node.js.
- Bank accounts with **2FA disabled** for automatic sync (One Zero is the exception). Without that, use statement files.

## Desktop app (recommended)

Download, install, open. No Node.js, no terminal. Bank sync uses the Chrome or Edge you already have.

| System | File in the [latest release](https://github.com/Sergey-Bar/Penny/releases/latest) | First launch |
|---|---|---|
| Windows 10/11 | `Penny-Setup-<version>.exe` | If SmartScreen warns about an unsigned app: **More info → Run anyway** |
| Mac with Apple silicon (M1 and newer) | `Penny-<version>-arm64.dmg` | Drag to Applications. First open: **System Settings → Privacy & Security → Open Anyway** |
| Mac with Intel | `Penny-<version>-x64.dmg` | Same as above |

If macOS says the app is damaged, run `xattr -cr /Applications/Penny.app` in Terminal and open it again.

Data lives in `%APPDATA%\Penny\data` (Windows) or `~/Library/Application Support/Penny/data` (Mac). Windows downloads updates itself and asks to restart; on a Mac, Penny shows a banner and you run the new installer over the old one. Your data stays.

## Docker

Runs Penny, its scrapers and Chromium in a container, isolated from your machine. Works on Windows, Mac and Linux with [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux).

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Sergey-Bar/Penny/main/install-docker.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/Sergey-Bar/Penny/main/install-docker.ps1 | iex
```

The installer checks that Docker is installed and running (on Windows it offers to install Docker Desktop with winget, on a Mac with Homebrew), downloads the newest release into `~/Penny` (`PENNY_DIR` to change), builds, starts and opens `http://127.0.0.1:41234`.

**Update:** run the same command again. If a newer release exists it offers to update; otherwise it just starts Penny. An update backs up the database and key, builds the new version (the test suite runs during the build; if it fails, no image is produced), switches, and rolls back to the previous image if the new one isn't healthy.

From inside the Penny folder you can also run the scripts directly:

| | macOS / Linux | Windows |
|---|---|---|
| Start | `scripts/docker/start.sh` | `scripts\docker\start.bat` |
| Update to the newest release | `scripts/docker/update.sh` | `scripts\docker\update.bat` |

or plain `docker compose up -d --build`.

- Published on `127.0.0.1` only. The database and encryption key live in the `penny-data` volume and survive updates. Backups taken before an update are in the volume under `/data/backups` (newest five kept).
- Settings go in `.env` (copy `.env.example`).
- Penny shows a banner (and a Telegram message, if set up) when a newer release exists. Nothing is installed automatically; `PENNY_UPDATE_CHECK=0` turns the check off.
- **Statement files:** drop exports into `imports/` next to `docker-compose.yml`.
- **Ollama on the host:** set `PENNY_ALLOW_REMOTE_OLLAMA=1` and use `http://host.docker.internal:11434`.
- **Egress allowlist (optional):** `docker compose -f docker-compose.yml -f docker/egress/compose.yml up -d --build` lets the container reach only the hosts in `docker/egress/allowlist.txt`. See [security.md](security.md#12a-docker-egress-allowlist-optional-off-by-default).

## From source

```bash
git clone https://github.com/Sergey-Bar/Penny.git
cd Penny
npm install
npm run setup
```

For developers, or if you want an always-on service. `npm run setup` builds the app, installs the always-on service (LaunchAgent on macOS, systemd on Linux, Task Scheduler on Windows), and opens the app. On Windows it also adds `127.0.0.1 penny.localhost` to your hosts file, the only step that asks for Administrator.

Then open **`http://penny.localhost:41234`** and bookmark it.

On Windows, `scripts\start-from-source.bat` builds when needed and runs the app in a window instead of a service.

### Everyday commands

| What you want | Run |
|---|---|
| Use the app | Open `http://penny.localhost:41234` |
| Develop with hot reload | `npm run dev` → `http://127.0.0.1:3000` |
| Apply your edits to the always-on app | `npm run service:reload` |
| Run the tests | `npx vitest run` (unit) · `npx playwright test` (end to end) |
| Connect an AI agent | `npm run mcp` → [mcp.md](mcp.md) |
| Type-check and lint | `npx tsc --noEmit` · `npm run lint` |

### Service commands

| Command | What it does |
|---|---|
| `npm run service:status` | Running? Bound to loopback? |
| `npm run service:start` / `:stop` | Start or stop now |
| `npm run service:reload` | Rebuild and restart |
| `npm run service:logs` | Tail server logs |
| `npm run service:open` | Open the app in your browser |
| `npm run service:uninstall` | Remove auto-start and the hosts entry. `data/` is untouched. |

### Uninstall

```bash
npm run uninstall
```

Stops and removes the service, removes the hosts entry on Windows, and removes earlier desktop-app installs if any are left.

**Kept on purpose:** `data/` (your transactions, budgets and encryption key) and the repository itself. To remove everything: `rm -rf data/ && cd .. && rm -rf Penny/`.

## Demo mode

Want to see Penny without connecting a bank? `npm run demo` creates a made-up household in its own temporary folder (`penny-demo-data` in the system temp directory) and starts the app on it: two bank accounts, two cards, an open-banking connection, three connected investment houses, five months of transactions, budgets, goals, assets, insurance and planned expenses. Every connection screen looks connected, but nothing leaves the computer: sync, bank connection tests, AI, Telegram and the update check are all blocked with the same message. Your own `data/penny.db` is never opened.

The demo is kept between runs so you can change things and try them. `npm run dev:demo` starts it again, and `npm run demo:reset` deletes it and starts over.

## Public demo on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSergey-Bar%2FPenny)

Deploys the full app with a made-up household, so anyone can click through every screen. On Vercel Penny always runs as the demo: the data lives in `/tmp` and starts fresh on each new instance, nothing reaches a bank, an AI provider or Telegram, and nothing can lock, wipe or take over the shared demo. It answers only on the deployment's own Vercel addresses; add a custom domain to `PENNY_ALLOWED_HOSTS`. Not for real data.

## Where your data lives

- `data/penny.db`: transactions, categories, budgets, profiles, settings
- `data/.encryption-key`: the 32-byte AES key, mode `0600`
- `data/*.bak` and `data/backups/`: automatic backups taken before migrations, before a restore, and before every schema change
- `data/backups/*.pennybak`: encrypted backups you create yourself (Settings → Data → Backup and restore, or `npm run backup`)
- Service logs: `~/Library/Logs/Penny/` (macOS), `~/.local/state/penny/log/` (Linux)

(`data/` is the folder for a source install, `PENNY_DATA_DIR` if set; see the desktop and Docker sections above for theirs.)

Back up `data/` like any folder. To move to a new machine, copy `data/` over and run `npm run service:install`.

One backup file holds the database and the bank encryption key, encrypted with a password you choose (AES-256-GCM with scrypt). A restore checks the password and the file's contents before touching anything, keeps a copy of the current database in `backups`, and asks for explicit confirmation.

## Troubleshooting

- **Port 41234 in use:** `netstat -ano | findstr :41234` (Windows) or `lsof -nP -iTCP:41234 -sTCP:LISTEN`. Stop the other process and start again.
- **`penny.localhost` doesn't resolve on Windows:** re-run setup from an elevated terminal, or use `http://127.0.0.1:41234`, which always works.
- **Linux: "systemd user instance not available":** `loginctl enable-linger $USER`.
- **A bank sync fails with a Cloudflare page:** try `PENNY_DISABLE_CHROMIUM_SANDBOX=1`, or import that month's statement file.
- **Docker: "Docker is not running":** start Docker Desktop (on Linux, `sudo systemctl start docker` and make sure you are in the `docker` group), then run the command again.
- **Something looks stale after an update:** hard-refresh the page (Ctrl+F5).
