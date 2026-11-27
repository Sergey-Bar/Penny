## What's new since 0.2

Coming from 0.2.x, 0.3 or 0.4? This is everything you get. The full list is in [CHANGELOG.md](https://github.com/Sergey-Bar/Penny/blob/main/CHANGELOG.md).

> **Desktop installs of 0.4.0 or older:** updates are now signed with a new key, so download this version once by hand. Updates install automatically again after that.

### 0.5.0

- **Three more investment houses.** Altshuler Shaham, Phoenix savings and pension, and Excellence Trade sync on their own, each product as its own asset. Thanks to @IsraelShok.
- **Sync you can leave alone.** Missed runs catch up, short outages retry, a bank that hangs gives up after 10 minutes, and a connection that needs you no longer fails every day.
- **Backups that cannot lose data.** Restore swaps the database in one step and rolls back on failure, works over a damaged database, and keeps the key to your saved logins. Stronger backup encryption.
- **More private.** IBANs, phone numbers, long numbers and standing-order names are hidden from cloud AI; the key file is closed to other users of a Windows computer.
- **Open banking** reads long histories to the end and tells you when consent expired. **One Zero** shows the balance.
- **MCP** works read-only with the app lock on, with seven more tools. **Telegram** reminds you when a bank stays down.
- **Docker:** to update, run the install command again.

### 0.4.0

- **Docker keeps your data in a `penny-data` volume**, moved there safely on the first update.
- **A public live demo** with a made-up household, and a new website.

### 0.3.0

- **Statements from PDF and photos**, read on your computer or through your AI provider, into the usual import preview.
- **Import remembers your columns**, with an import history and undo.
- **Quick add from the phone** (iPhone Shortcut or Android automation), a phone-access QR code, and **card texts through Telegram** that merge with the bank's own row.
- **Clean up** duplicates, pending charges that never settled and vague descriptions; build recurring charges by hand.
- **Goals: what if**, budget carry-over on every line, and **bill reminders** in the bell and in Telegram.
- **Passkey unlock** for the app lock, with a recovery code.
- **Docker network lock (optional):** the app reaches only bank sites.

### 0.2.1

- **Safer desktop app:** links can't open other sites in the window or start programs, and updates install only with a valid release signature.
- **Privacy:** cloud AI asks for consent and lists what is sent; exports warn that they are not encrypted; a switch stops the update check.
- **Docker in one command** on Windows, macOS and Linux.

## Install

Pick one. Your data stays on your computer in every option.

### Windows: desktop app

1. Download **`Penny-Setup-<version>.exe`** below and run it.
2. Windows SmartScreen may warn that the app is not signed: click **More info → Run anyway** (once).
3. Penny opens from the Start menu. Coming from 0.1.0, run this installer once over the old one; from 0.2.0 on, Penny updates itself: when a new version is out it asks to restart (or installs when you close it).

### Mac: desktop app

1. Download the **`.dmg`** for your Mac: `arm64` for Apple Silicon (M1 and newer), `x64` for Intel.
2. Open it and drag Penny to Applications.
3. The app is not notarized by Apple yet, so the first open is blocked. Open **System Settings → Privacy & Security** and click **Open Anyway** (once).
   If macOS says the app is damaged, run `xattr -cr /Applications/Penny.app` in Terminal and open it again.
4. Bank sync uses Google Chrome or Microsoft Edge, so install one of them if you have neither.

### Docker: Windows, Mac or Linux

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux). One command downloads the newest release into `~/Penny`, builds it and starts it:

```bash
# Mac / Linux
curl -fsSL https://raw.githubusercontent.com/Sergey-Bar/Penny/main/install-docker.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/Sergey-Bar/Penny/main/install-docker.ps1 | iex
```

Penny opens at http://127.0.0.1:41234. To update later, run the same command again: it backs up your data first and rolls back if the new version fails.

Statement files from banks and investment houses go into the import folder (Settings → Data shows it; in Docker it is `imports/`).
