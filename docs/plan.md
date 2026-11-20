# Plan

HoneyJar is three jars of books. Version 2 is the personal jar. Investments, business, invoices, mileage, and a property jar are in.

## Order

1. **Personal books (version 2, this tree).** Household spending, bills, a plan, cash flow, net worth, goals, taxes, people, tags, sharing, documents, credit, an advisor, and an API.
2. **Investments.** Retirement what-ifs, a portfolio, time-weighted return, money-weighted return (IRR), dividends, and market data.
3. **Business books.** A separate ledger the household opens from its own section, not a label on personal transactions. This slice has income, expenses, a profit and loss, Schedule C, E, or F lines, and owner draws that post on both books without counting as profit. Invoices, mileage, and property management are later. A second business is another ledger.

Personal, business, and property should stay separate ledgers that one household can open. They should not be one blended transaction list with a label.

## What version 2 includes

| Area | Status |
| --- | --- |
| Spending dashboard, with person and tag filters | Shipped |
| Transactions, CSV, OFX, and QFX import, rules, merchant dictionary | Shipped |
| Bills, subscriptions, utilities, mark paid | Shipped |
| Spending plan with rollover | Shipped |
| Cash flow out to a year | Shipped |
| Net worth, homes, cars, loans, history | Shipped |
| Zillow | A deep link plus a value the household saves. No live Zestimate pull. |
| Goals, contributions, milestones with a simple return | Shipped |
| Watchlists, alerts, reminders | Shipped |
| Custom reports, group by category, person, or tag | Shipped |
| Taxes: 2026 federal estimate, Schedules A–F lines, quarterly safe harbor | Shipped as a planner, not a filed return |
| Documents linked to a record | Metadata and an optional encrypted body. A receipt file can be attached to a transaction or a bill and is encrypted on disk. Not a general file cabinet. |
| Credit scores per person | Entered by hand, one series per person |
| People on transactions and bills | Shipped |
| Tags | Shipped |
| Share with partner or advisor | Invite code, roles owner / editor / viewer / advisor |
| API `hj_` keys and MCP | Shipped |
| Advisor: Grok, OpenAI, or Ollama | Shipped. The model sees a short brief, not every row. |
| Vault | Client-side AES-256-GCM. The passphrase is not stored. |
| Customize | Categories, rules, hidden nav, filing facts, advisor, vault, sample data |
| Bank connect | Manual balances and a CSV, OFX, or QFX file. No aggregator. |

The sample household is the Calders in Oakland: Jordan, Avery, and Remy. It is deterministic so a new account has something to click. Customize can clear it.

## Explicitly not in version 2

- The Excel workbook file. It stays out of git. The in-app utility workbook is in, and each jar keeps its own meters.

Invoices, mileage, and a property jar (leases, rent, deposits) are in. Each is its own ledger, not a label on the personal transactions.

## Decisions that should stick

- **No silent bank login.** If a connection is added later, it has to be an explicit connector the household turns on, and the app should still work from a CSV, OFX, or QFX file.
- **Money is integer cents.** Dates are `YYYY-MM-DD`. A negative transaction amount is money out. A positive amount is money in.
- **One owner’s rows stay that owner’s.** Sharing is a grant in `book_access`, not a copied household.
- **The advisor does not invent figures.** If the brief does not contain a number, the answer should say so.
- **Tax output is a worksheet.** It is not a return and not tax advice. Brackets in code are tax year 2026 (Rev. Proc. 2025-32).

## Investments

The first slice is in. Portfolio holds lots, typed prices, and dated cash flows. Modified Dietz is the time-weighted figure. IRR is the money-weighted figure, treating today’s market value as a sale. A dividend can post cash and a Schedule B line. The retirement card is a straight-line sketch, not a plan. Net worth does not pick up lot value until you copy it onto an account.

A live quote feed and a daily valuation series are approved as opt-in, default-off connectors but are not built (see Amendments, Oct 31, 2026, and Unfinished). Prices stay typed, so Dietz stays an inception estimate.

A property jar keeps a lease: tenant, rent, due day, and a deposit that is a liability. Each month opens a rent invoice. A portfolio sale records basis, proceeds, and a short- or long-term gain for Schedule D. The worksheet taxes long-term gain at 15% and limits the ordinary loss to $3,000. Summary is one page, not a jar. This month sits beside the year, one card per open jar. Net worth stays the household figure.

## Business

Each activity is its own ledger (`ledgers.kind` is `personal` or `business`). The first personal jar is the old household rows. More jars are added from Jars and archived rather than deleted. The switcher under the mark, shown when there is more than one open jar, changes the menu and the books. A business jar gets the operating menus: overview, transactions, bills, a spending plan, cash flow, goals, milestones, reports, that jar’s tax schedule, watchlists, reminders, accounts, and documents. People, the house, the portfolio, credit, sharing, and the household tax return stay on a personal jar.

## Known seams

- The transaction editor must stay keyed to the row it opened. Reusing one mounted editor made every merchant click write the top row.
- Ids are up to 80 characters. A 40-character cap clipped credit-score and category ids.
- Tags live as a JSON text array on `transactions.tags`. Older rows backfill to `[]`.
- Production bundles must copy the PGLite data and wasm files next to the server function. `scripts/copy-pglite-assets.mjs` does that after `vite build`.

## Amendments (Oct 31, 2026)

Approved Oct 31, 2026. This records a plan change. The connectors below are not in the app.

Two lines used to sit under "Explicitly not in version 2":

- Live bank, card, or brokerage sync.
- A live quote feed. Portfolio prices are typed.

They are no longer exclusions. Each is an opt-in connector, off by default, under the decision "No silent bank login": an explicit connector the household turns on, and the app still works from a file.

- SimpleFIN is the optional bank, card, or brokerage connector. A household that never turns it on keeps typed balances and a CSV, OFX, or QFX import.
- The live quote feed is optional and off by default. Portfolio prices stay typed until a household turns the feed on. The daily valuation series that would make Dietz more than an inception estimate belongs to that same feed and stays off with it.

The Excel workbook file stays out of version 2.

## Unfinished

Recorded Nov 11, 2026. These items are approved and not built. Take one. Leave the app working from a CSV, OFX, or QFX file when every connector stays off.

### Decisions

| Question | Decision |
| --- | --- |
| SimpleFIN and the quote feed | Approved as opt-in connectors. See Amendments. |
| Where it runs | Docker is the production target. The same build should also run on Vercel. |
| Who pays SimpleFIN | The person running that HoneyJar. The fee is theirs only if they turn the connector on. HoneyJar does not pay it and does not hold a shared token. |
| Receipt reading | Local first (Ollama, the URL already in Customize). Grok and OpenAI are allowed when that household turns them on. |
| Price provider | Tiingo end-of-day is the first adapter. See below. |
| Property jar | One property per property jar. |
| Webhook body | `transaction.created` only, signed. See below. |
| Connector rows | Always stop in review. Nothing from SimpleFIN posts until someone accepts the row. |

### Host

Docker (`compose.yaml`) is the host to test against. A long-running Node process with `DATABASE_URL` is the same shape.

Vercel is in scope only where the process can live without a writable disk. `data/auth` and `data/files` are correct on Docker and on `npm run dev`. They are not durable on a serverless disk. A Vercel deploy must keep the auth secret and receipt bytes in Postgres or object storage, or those features stay off and the install page says so. Do not put a public fallback secret back.

### 1. Docs that are already wrong

`docs/features.md` still says the register shows the first 200 matches. `docs/api.md` still says there is no paging past `limit`, no webhook, and no person or tag filter. Refresh both against the code before writing the new behavior, and again when items 2 and 3 land. Outdated docs are how the last audit went wrong.

### 2. QIF import and FITID

OFX and QFX already import (`money.tsx` accept list, `parseOfx` in `calc.ts`). Two gaps:

- The file picker accepts `.csv`, `.ofx`, and `.qfx`. Add `.qif`.
- `parseOfx` never reads `FITID`. `txn.match` in `data.server.ts` finds duplicates by account plus a ±7 day window.

Store `FITID` on the imported row when the file has one. Use it as the first dedupe key, on that account. Fall back to the window only when there is no id.

QIF has no FITID. Parse it beside `parseOfx` (`!Type`, `D`, `T`, `P`, `M`, `N`, `^`) and send it through the same review screen. Dedupe QIF with the window, amount, and merchant.

### 3. API paging, then a webhook

The screen already filters and pages. The public API does not. `GET /api/v1/transactions` and `/jars` still take `from`, `to`, and `limit` (cap 200) and filter the loaded book in memory (`public-api.server.ts`). MCP forwards only those fields (`handleMcp`).

The shape already exists and is unused by those handlers:

- `txn-query.ts` normalizes `accountId`, `categoryId`, `personId`, `tag`, `source`, and a cursor.
- `txn-cursor.ts` is the opaque keyset.
- `txn-store.ts` is the page adapter. The SQL store is still the open piece (called HJ-034 in those files). HJ-036 is the MCP schema.

Finish that path. Do not add a second paging design. The handler must query SQL. It must not load every transaction and slice.

Then an optional outbound webhook, off until a household sets a URL.

**Payload.** One event: `transaction.created`. Fire it after the row is saved, including an accepted import and a successful `POST /transactions`. Do not fire for a row still waiting in review.

```json
{
  "id": "evt_…",
  "type": "transaction.created",
  "createdAt": "2026-11-11T18:00:00Z",
  "data": {
    "id": "txn id",
    "ledgerId": "jar id",
    "accountId": "account id",
    "postedOn": "2026-11-11",
    "amountCents": -4280,
    "merchant": "Market",
    "memo": "",
    "categoryId": "category id or null",
    "personId": "person id or null",
    "tags": ["groceries"],
    "source": "manual",
    "fitId": null
  }
}
```

`amountCents` is integer cents, negative for money out. `source` is `manual`, `import`, `api`, or `simplefin`. No receipt bytes, no account number, no document body, no balances of other accounts.

Sign the raw body with HMAC-SHA256 and the household's webhook secret. Send `X-HoneyJar-Signature: sha256=<hex>` and `X-HoneyJar-Delivery: <id>`. The secret is shown once. Retry a non-2xx with backoff. The same `id` may arrive twice. The receiver treats `id` as the idempotency key.

`transaction.updated` and `transaction.deleted` wait.

### 4. SimpleFIN

Opt-in, off by default. The household turns it on per bank connection, not per click at a bank's site inside HoneyJar.

SimpleFIN Bridge gives one access URL for the connection. That URL lists every account the bank returned. "Per account" means mapping each of those accounts onto one HoneyJar account. Store the access URL encrypted, the same way a receipt is sealed, not in plaintext next to the OpenAI key. The OpenAI key in Customize is still plaintext (`docs/install.md`). Encrypt that in the same change.

The person running this instance pays Bridge if they enable it. Document the signup link. Do not embed a project-wide token.

Pull on a schedule the household can turn off. New rows are `source: simplefin`. They go through import review. Review state today lives in the browser (`ImportReview`). A background pull needs a server staging table. `txn.import` also moves the account balance, so a staged row must not move it until it is accepted, or a replay will double-count.

The app still imports a file when SimpleFIN is off, or when Bridge is down.

### 5. Receipt reading

A receipt already attaches to a transaction or a bill and is sealed on disk. Nothing reads the image. `package.json` has no OCR library.

Opt-in. Extract merchant, date, and total. Propose a match to an existing row, or fill blank fields. A person accepts the proposal. Do not write the transaction from the model alone.

Default path is local: the Ollama URL already in Customize. The server makes the call, not the browser. Grok (`XAI_API_KEY` on the server) and OpenAI (household key) are allowed when that household picks them. Same rule as Advisor: the model sees the receipt, not the whole book.

### 6. Schedule E pack

A property jar is one rental. It already has a lease and rent invoices. It does not have residential depreciation, capital improvements, or a per-property Schedule E export.

Add a 27.5-year straight-line schedule for the building only. Land is not depreciated. Improvements are their own lines, with their own placed-in-service date. Check the percentages against the current IRS Publication 946 and Publication 527 before the export ships. Do not copy a remembered table.

Taxes on that jar exports CSV and PDF for that one property. The household tax worksheet stays a planner, not a filed return.

### 7. Price feed and a daily valuation

Opt-in, off by default. Typed prices stay the default, so Dietz stays an inception estimate until a household turns this on.

**Provider.** First adapter is Tiingo end-of-day (`https://api.tiingo.com`). Checked Nov 11, 2026: the free plan is on the order of 50 requests an hour, 1,000 a day, and 500 symbols a month, which covers one close per holding per day for a household book. The operator creates the key and pays if they outgrow it. Tiingo's terms are internal use. Do not republish the quotes.

Do not use an unofficial Yahoo or Stooq client as the supported adapter. It breaks, and the terms do not fit a shared app.

Alpha Vantage is a reasonable second adapter, not the default. Its free plan is about 25 requests a day, which is too small once the book has more than a handful of symbols and a backfill.

The interface is a function: symbol in, one close out, plus the provider name. A later adapter should not change the valuation row.

Write one valuation per symbol per calendar day, the prior close, not a live tick. Time-weighted return uses those points. If the call fails, keep the last point and say the feed missed a day. Never invent a price.

### 8. Multi-year forecast

Cash flow is 12 months (`netWorthSeries` defaults to 12, and the cash-flow screen follows bills and the plan). Extend it to a multi-year net-worth projection.

Editable assumptions (return, inflation, savings). Dated events: a home purchase, retirement, a child. Two scenarios side by side. This can ship against typed balances. It gets better after item 7, and it should not wait on it.

### What not to redo

- Receipt sealing and the auth secret. A missing or public `BETTER_AUTH_SECRET` is rejected. The first start writes `data/auth/secret` and rewrites receipts (`auth-secret.server.ts`). Do not put the public dev string back.
- The in-app utility workbook. It is in. The Excel file stays out.
- A second transaction list that blends personal, business, and property.

