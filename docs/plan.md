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
- A live quote feed. Portfolio prices are typed.
- Invoices, mileage, and a property-management ledger.
- The Excel workbook file. It stays out of git. The in-app utility workbook is in, and each jar keeps its own meters.

## Decisions that should stick

- **No silent bank login.** If a connection is added later, it has to be an explicit connector the household turns on, and the app should still work from a CSV.
- **Money is integer cents.** Dates are `YYYY-MM-DD`. A negative transaction amount is money out. A positive amount is money in.
- **One owner’s rows stay that owner’s.** Sharing is a grant in `book_access`, not a copied household.
- **The advisor does not invent figures.** If the brief does not contain a number, the answer should say so.
- **Tax output is a worksheet.** It is not a return and not tax advice. Brackets in code are tax year 2026 (Rev. Proc. 2025-32).

## Investments

The first slice is in. Portfolio holds lots, typed prices, and dated cash flows. Modified Dietz is the time-weighted figure. IRR is the money-weighted figure, treating today’s market value as a sale. A dividend can post cash and a Schedule B line. The retirement card is a straight-line sketch, not a plan. Net worth does not pick up lot value until you copy it onto an account.

Still later, not this slice: a live quote feed, realized-gain lots for Schedule D, and a daily valuation series that would make Dietz more than an inception estimate.

A property jar keeps a lease: tenant, rent, due day, and a deposit that is a liability. Each month opens a rent invoice. A portfolio sale records basis, proceeds, and a short- or long-term gain for Schedule D. The worksheet taxes long-term gain at 15% and limits the ordinary loss to $3,000. Summary is one page, not a jar. This month sits beside the year, one card per open jar. Net worth stays the household figure.

## Business

Each activity is its own ledger (`ledgers.kind` is `personal` or `business`). The first personal jar is the old household rows. More jars are added from Jars and archived rather than deleted. The switcher under the mark, shown when there is more than one open jar, changes the menu and the books. A business jar gets the operating menus: overview, transactions, bills, a spending plan, cash flow, goals, milestones, reports, that jar’s tax schedule, watchlists, reminders, accounts, and documents. People, the house, the portfolio, credit, sharing, and the household tax return stay on a personal jar.

## Known seams

- The transaction editor must stay keyed to the row it opened. Reusing one mounted editor made every merchant click write the top row.
- Ids are up to 80 characters. A 40-character cap clipped credit-score and category ids.
- Tags live as a JSON text array on `transactions.tags`. Older rows backfill to `[]`.
- Production bundles must copy the PGLite data and wasm files next to the server function. `scripts/copy-pglite-assets.mjs` does that after `vite build`.
