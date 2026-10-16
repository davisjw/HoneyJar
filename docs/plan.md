# Plan

HoneyJar is three jars of books, built in order. Version 2 finished the personal jar well enough to use. Investments and business are still ahead.

## Order

1. **Personal books (version 2, this tree).** Household spending, bills, a plan, cash flow, net worth, goals, taxes, people, tags, sharing, documents, credit, an advisor, and an API.
2. **Investments.** Retirement what-ifs, a portfolio, time-weighted return, money-weighted return (IRR), dividends, and market data.
3. **Business books.** A separate set of books, invoices, mileage, profit and loss, and Schedule C. Property management can share that shape later: its own books, not a mode switch pasted on top of the household.

Personal, business, and property should stay separate ledgers that one household can open. They should not be one blended transaction list with a label.

## What version 2 includes

| Area | Status |
| --- | --- |
| Spending dashboard, with person and tag filters | Shipped |
| Transactions, CSV import, rules, merchant dictionary | Shipped |
| Bills, subscriptions, utilities, mark paid | Shipped |
| Spending plan with rollover | Shipped |
| Cash flow out to a year | Shipped |
| Net worth, homes, cars, loans, history | Shipped |
| Zillow | A deep link plus a value the household saves. No live Zestimate pull. |
| Goals, contributions, milestones with a simple return | Shipped |
| Watchlists, alerts, reminders | Shipped |
| Custom reports, group by category, person, or tag | Shipped |
| Taxes: 2026 federal estimate, Schedules A–F lines, quarterly safe harbor | Shipped as a planner, not a filed return |
| Documents linked to a record | Metadata and an optional encrypted body. Not a file cabinet of uploads. |
| Credit scores per person | Entered by hand, one series per person |
| People on transactions and bills | Shipped |
| Tags | Shipped |
| Share with partner or advisor | Invite code, roles owner / editor / viewer / advisor |
| API `hj_` keys and MCP | Shipped |
| Advisor: Grok, OpenAI, or Ollama | Shipped. The model sees a short brief, not every row. |
| Vault | Client-side AES-256-GCM. The passphrase is not stored. |
| Customize | Categories, rules, hidden nav, filing facts, advisor, vault, sample data |
| Bank connect | Manual balances and a CSV. No aggregator. |

The sample household is the Calders in Oakland: Jordan, Avery, and Remy. It is deterministic so a new account has something to click. Customize can clear it.

## Explicitly not in version 2

- Live bank, card, or brokerage sync.
- A live Zillow or market-data feed.
- Portfolio lots, TWR, IRR, dividends, and retirement scenarios.
- Business books, invoices, mileage, Schedule C.
- The Excel workbook. It stays out of git.

## Decisions that should stick

- **No silent bank login.** If a connection is added later, it has to be an explicit connector the household turns on, and the app should still work from a CSV.
- **Money is integer cents.** Dates are `YYYY-MM-DD`. A negative transaction amount is money out. A positive amount is money in.
- **One owner’s rows stay that owner’s.** Sharing is a grant in `book_access`, not a copied household.
- **The advisor does not invent figures.** If the brief does not contain a number, the answer should say so.
- **Tax output is a worksheet.** It is not a return and not tax advice. Brackets in code are tax year 2026 (Rev. Proc. 2025-32).

## Next, when personal books stay put

Investments, as their own screens and tables, not columns stuffed into the checking register:

- Holdings and lots, separate from the cash accounts that already exist (`kind = investment` is only a balance today).
- Cash flows into and out of the portfolio so IRR and TWR have dates, not just an end balance.
- Dividends as income that can also land on the tax worksheet.
- A retirement sketch: contribution, a stated return, a target date. The milestone screen already does a straight-line version of this. Do not pretend that is a plan.
- Market data only when a source is named. Until then, the household types the price, the same way they type a Zillow value.

After that, business books: a second profile of books, invoices, mileage, profit and loss, Schedule C. Do not mix those rows into the Calder personal seed.

## Known seams

- The transaction editor must stay keyed to the row it opened. Reusing one mounted editor made every merchant click write the top row.
- Ids are up to 80 characters. A 40-character cap clipped credit-score and category ids.
- Tags live as a JSON text array on `transactions.tags`. Older rows backfill to `[]`.
- Production bundles must copy the PGLite data and wasm files next to the server function. `scripts/copy-pglite-assets.mjs` does that after `vite build`.
