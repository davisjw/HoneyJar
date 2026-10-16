# Architecture

HoneyJar v2 is a TanStack Start app. The browser talks to server functions. Those functions read and write one SQL database. Almost every screen is a view over one `Workspace` object for the signed-in household.

```text
Browser (React 19, TanStack Router)
  useBook()  ->  getWorkspace / applyAction / askAdvisor
                         |
                    authMiddleware  (user id, then book_access)
                         |
                    data.server.ts  +  calc.ts
                         |
              Postgres, or PGLite when no DATABASE_URL
```

Money math lives in `src/lib/honey/calc.ts` so the UI, the API, and the advisor brief share one set of rules.

## Stack

| Piece | Choice |
| --- | --- |
| App | TanStack Start / Router / Query, React 19 |
| Style | Tailwind v4, honey / clay / sage tokens, Fraunces and Outfit |
| Charts | Recharts |
| Auth | Better Auth: email and password, Google, X |
| Database | `pg` when `DATABASE_URL` is set, otherwise `@electric-sql/pglite` |
| SQL | `getSql()` in `src/lib/db.ts`. Tagged queries. Bigints and dates normalized. |
| Deploy shape | Vite build, then copy PGLite assets, then migrate |

`@tanstack/react-start` must stay on 1.168.60 or newer.

## Routes

Signed-in screens sit under `src/routes/_app/`. The shell in `src/components/honey/shell.tsx` groups them:

| Group | Screens |
| --- | --- |
| Money | Spending, Transactions, Bills, Spending plan, Cash flow |
| Wealth | Net worth, Goals, Milestones, Credit |
| Tax and reports | Reports, Taxes, Watchlists, Reminders |
| Household | People, Documents, Sharing, Accounts, Advisor, Customize |

`nav_hidden` on the profile is a comma-separated list of nav ids. Customize writes it. The shell hides those links.

Server endpoints:

- `POST/GET /api/auth/$` — Better Auth.
- `GET/POST /api/v1/$` — household API. Bearer `hj_…`.
- `POST /api/mcp` — a small JSON-RPC tool list over the same API.

## Request path

`src/lib/honey/fns.ts` exposes three server functions, all behind `authMiddleware`:

- `getWorkspace` loads the books.
- `applyAction` applies one tagged action (`txn.save`, `bill.pay`, `person.save`, …). The full union is `Action` in `src/lib/honey/types.ts`.
- `askAdvisor` builds a brief and calls a model.

The client keeps one query cache of the workspace. A successful action invalidates it. Viewers can read. Mutations check the role. Owner-only actions (invites, API keys, clearing the sample) are refused for everyone else.

`loadWorkspace` scopes every select by `user_id`. A shared book passes the owner’s id after `book_access` says this member may see it. Roles are `owner`, `editor`, `viewer`, and `advisor`.

## Data

Migrations:

| File | What it adds |
| --- | --- |
| `migrations/0001_auth.sql` | Better Auth `user`, `session`, `account`, `verification` |
| `migrations/0002_honey.sql` | Profile, sharing, accounts, categories, rules, transactions, bills, assets, goals, plan, watches, reminders, documents, scores, milestones, reports, API keys, advisor messages |
| `migrations/0003_people.sql` | `people`, plus `person_id` on transactions, bills, and credit scores |
| `migrations/0004_tags.sql` | `transactions.tags` text, default `[]` |

Conventions:

- Primary keys are text ids, up to 80 characters.
- Money is `bigint` cents. A negative transaction is an outflow. A positive transaction is an inflow. Account balances are stored as positive magnitudes. Debt kinds (`credit`, `loan`, `mortgage`) subtract from net worth.
- Dates are `YYYY-MM-DD`.
- Tags are a JSON array in a text column, parsed by `parseTags`.
- Category rules are substring matches, then a built-in merchant dictionary (groceries, utilities, payroll, and so on).
- A month can start on a day other than the 1st (`month_start_day`). Plan, spending, and cash flow all use that.

The Calder sample is `seedHousehold` in `src/lib/honey/seed.ts`. It is idempotent per user. People and tags on older sample rows are backfilled by `ensureSamplePeople` and `ensureSampleTags`.

### Accounts and the bank

There is no Plaid connection and no stored bank password. An account row has a name, an institution, a kind, a mask, and a balance the household typed. `connected` means “we treat this as linked for display,” not “we have a feed.” CSV import parses a loose date / amount / description file and inserts transactions with `source = import`. The public API can also post a transaction with `source = api`.

### Net worth and Zillow

Assets (home, vehicle, other) have a value, an as-of date, and an optional linked loan account so equity is value minus that balance. Valuation history is its own table. The Zillow field is a URL the household can open. Any Zestimate is a number they saved.

### Plan

Each category has a monthly assignment and a rollover flag. `planModel` compares assigned cents with activity for the month and carries leftovers when rollover is on.

### Cash flow

`projectCash` walks from liquid balances forward: bills on their cadence, and the shape of recent spending, out to the horizon the screen asks for (up to a year).

### Tax

`estimateTax` and `taxLines` in `calc.ts`. Federal brackets and the standard deduction are the 2026 figures. Categories can carry a schedule and a line (A through F). The screen is a year-to-date worksheet plus a quarterly planner (withholding, estimates, prior-year safe harbor). It does not file anything.

### People, tags, reports

A person has a name and a relation (`adult`, `child`, …). Transactions and bills store `person_id`. Credit scores do too, so each person has their own series. Reports take a metric, a range, a group (`category`, `person`, or `tag`), and `filters_json`. A transaction with two tags can count in both tag groups. Dashboard charts use the same filters but the headline month totals stay unfiltered.

### Documents and the vault

A document row is a title, a kind, a year, a link to another record (`related_type`, `related_id`), notes, and an optional body. The vault is not the document table.

`src/lib/honey/vault.ts` runs in the browser:

- PBKDF2-SHA256, 120,000 iterations, random salt.
- AES-GCM with a 256-bit key.
- The server stores only `vault_salt` and `vault_verifier` (the ciphertext of a fixed marker). A wrong passphrase fails the marker check.
- The passphrase and the raw key are not written to the database.

### Sharing and API keys

`book_access` holds an invite code, an email, a role, and a status. Accepting an invite attaches `member_user_id`.

API keys are created in Customize. The raw token is shown once, prefixed `hj_`. The database stores a SHA-256 hash and a short prefix. `/api/v1` and `/api/mcp` both require `Authorization: Bearer`.

Public reads: `/summary`, `/accounts`, `/transactions`, `/bills`, `/goals`, `/networth`, `/alerts`. Public writes: `POST /transactions` (account, merchant, amount, optional person and tags).

MCP methods are `initialize`, `tools/list`, and `tools/call`. The tools are the same reads: spending summary, accounts, transactions, bills, net worth, goals, alerts.

### Advisor

`advisorBrief` reduces the household to a few lines: net worth, account balances, this month’s spending, upcoming bills, goals, filing status. The system prompt tells the model not to invent numbers and not to act as a broker or a preparer.

- **Grok** uses `XAI_API_KEY` on the server and `grok-4.5`.
- **OpenAI** uses the key stored on the profile. The profile sent to the client only has `openaiKeySet`, not the key.
- **Ollama** is not called from the server. The server returns the brief and the browser posts it to the household’s Ollama URL.

The last few turns are stored in `ai_messages`.

## UI map

| Path | Module |
| --- | --- |
| `src/components/honey/book.tsx` | Workspace query and `run(action)` |
| `src/components/honey/shell.tsx` | Nav, month label, sign-in |
| `src/components/honey/welcome.tsx` | First-run gate |
| `src/components/honey/screens/dashboard.tsx` | Spending |
| `src/components/honey/screens/money.tsx` | Transactions, bills, plan, cash flow |
| `src/components/honey/screens/wealth.tsx` | Net worth, goals, milestones |
| `src/components/honey/screens/people.tsx` | People |
| `src/components/honey/screens/desk.tsx` | Reports, taxes, watches, reminders, documents, credit, accounts, advisor, settings, sharing |

Transaction and bill editors are mounted only while open and keyed by id, so a new row does not reuse another row’s state.

## What this shape is not ready for

Investments need lots, dated cash flows, and prices. Business books need a second ledger id, not another `if` on the household tables. Both should land as new tables and screens that call the same `applyAction` style, instead of overloading `transactions`.
