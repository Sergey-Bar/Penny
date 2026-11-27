# Contributing to Penny

Thanks for helping. Penny handles people's bank data, so the bar is: correct, private, and tested.

## Set up

```bash
git clone https://github.com/Sergey-Bar/Penny.git
cd Penny
npm install
npm run dev        # http://127.0.0.1:3000
```

Node.js 22 or newer. Before you open a PR:

```bash
npx tsc --noEmit
npm run lint
npm test               # unit tests (Vitest)
npx playwright test    # end-to-end, optional for small changes
```

## Good first places

- **A bank:** add it to `BANK_PROVIDERS` in `src/lib/types.ts` and map it in `src/server/scrapers/index.ts`.
- **An AI provider:** implement `AIProvider` from `src/server/ai/types.ts` and register it in `src/server/ai/factory.ts`.
- **Israeli numbers:** tax brackets, ceilings and rates live in `src/lib/il-defaults.ts`, each with its year and source. Updates with an official source are especially welcome.
- **A language:** add `<locale>.json` under `src/i18n/messages/` with the keys of `en.json`, and register it in `src/i18n/routing.ts`.

## Code map

```
Penny/
├── src/
│   ├── app/              Next.js App Router: pages (home, transactions, budget, fi,
│   │                     investments, calculators, learn, settings, setup, profiles…) and api/
│   ├── components/       UI by area: home, dashboard, transactions, calculators, fi,
│   │                     settings, setup, profiles, a11y, layout, ui (shared primitives)
│   ├── content/          Knowledge-center guides
│   ├── i18n/messages/    he.json and en.json
│   ├── lib/              Pure, tested logic: budgets, pacing, tax, pension, mortgage,
│   │                     Israeli defaults with sources (il-defaults.ts), Pip
│   └── server/
│       ├── ai/           Claude, Ollama and CLI-agent providers
│       ├── bot/          Telegram bot
│       ├── db/           SQLite, numbered migrations, queries
│       ├── scrapers/     Bank and card sync
│       ├── pension/      Pension and savings sync
│       └── lib/          Encryption, dedupe, transfer detection, import folder
├── tests/                Vitest unit tests (and tests/e2e scanners for overlap and contrast)
├── e2e/                  Playwright end-to-end tests
├── desktop/              Electron desktop shell and installer
├── docker/               Egress-proxy add-on for docker-compose.yml
├── docs/                 Longer docs: features, install, importing, MCP, security, testing
├── scripts/              Setup, backup, demo, MCP server, docs/site screenshot capture
│   ├── docker/           Start and update launchers for the Docker install
│   └── service/          Always-on service installers
├── website/              The public site (GitHub Pages)
└── data/                 Database and key (gitignored)
```

## Rules

- TypeScript strict. No `any` without a comment saying why.
- Every new pure function gets a Vitest test.
- UI text goes in both `he.json` and `en.json`. Hebrew text does not use the product name.
- Commits follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Comments explain *why*, not *what*. No em dashes in code, commits or docs.
- UI copy never names competitors.
- Never commit real bank data, passwords, account numbers, or screenshots that show them.

## Anonymity

Research notes often come from named products, advisers, forums or paid reports. Do not copy names, prose or proprietary structures into the repository. Write the finding in your own words, cite the source only in the private research log, and keep the product name out of code, tests, comments, docs, UI copy and commit messages.

The check reads hashed terms from `PENNY_ANON_TERM_HASHES` (or the legacy `PENNY_ANON_SOURCE_HASHES`) and optional plaintext terms from `PENNY_ANON_TERMS`. Hashes are SHA-256 of a normalized one-to-four-word phrase. CI can set the secret; without it the check reports that no source hashes are configured and passes.

```bash
npm run check:anonymity        # scan tracked files, or the tree when git is unavailable
npm run check:anonymity:diff   # scan only added lines when a git diff exists
```

If the check finds a match, rewrite the line. Do not add an allowlist entry to silence a real source name.

## Security

Found a vulnerability? Report it privately as described in [SECURITY.md](SECURITY.md), not in an issue.
