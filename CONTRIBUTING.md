# Contributing

HoneyJar is the household books: spending, bills, utilities, a plan, and a tax worksheet. You type the numbers. It does not log into a bank.

By submitting a change you agree that your contribution is under the [Apache License 2.0](LICENSE), as that license describes. Keep [NOTICE](NOTICE) when you distribute a work based on HoneyJar. There is no separate contributor agreement.

Questions about how to run it belong in [docs/install.md](docs/install.md). A vulnerability belongs in the private process in [SECURITY.md](SECURITY.md), not in an issue or a pull request. People working together follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## What a change should respect

- Do not add a bank, card, or brokerage login, and do not add live price quotes. Balances and portfolio prices are typed. A CSV import is the other way in.
- The tax screen is a planner for tax year 2026. It is not a return and it is not tax advice.
- Do not commit `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `XAI_API_KEY`, `GROK_AUTH_CLIENT_SECRET`, or a household export.
- Money math lives in `src/lib/honey/calc.ts`. Server functions live in `src/lib/honey/fns.ts`. A new screen action is a member of `Action` in `src/lib/honey/types.ts`. [docs/architecture.md](docs/architecture.md) is the map. Prefer [docs/features.md](docs/features.md) when it disagrees with the older closing section of the architecture note.
- Schema changes are new files in `migrations/`. Do not edit a migration that has already shipped.
- `@tanstack/react-start` stays on 1.168.60 or newer.

## Set up

You need [Node 22](https://nodejs.org/) and npm.

```bash
git clone https://github.com/davisjw/HoneyJar.git
cd HoneyJar
npm install
npm run dev
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). Leave `DATABASE_URL` unset. The books sit in `data/pglite`. Deleting that directory deletes the books.

Docker is optional. `docker compose up --build` starts the app and Postgres. The Compose file binds the app to localhost. The database password in that file is `honeyjar`.

## Checks

Pull requests and pushes to `main` run [.github/workflows/ci.yml](.github/workflows/ci.yml) on Node 22:

```bash
npm ci
npm run test:app
npm run typecheck
npm audit --audit-level=high
```

`npm test` also runs `scripts/**/*.test.mjs`. Those checks expect the Grok builder tree, including `.grok/`, and that directory is not in this repository. CI does not run them. `npm run lint` exists and CI does not run it.

Changes land through a pull request. The `test` check is required.

## Pull requests

Use a branch. Describe what changed and how you checked it. Fill in the pull request template. A household export does not belong in the description or the diff.

Keep the change to the problem you are solving. A drive-by rewrite of an unrelated screen is harder to review than a second pull request.
