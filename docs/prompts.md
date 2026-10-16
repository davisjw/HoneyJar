# Prompts used to build HoneyJar v2

These are the product requests from the build, in the order they arrived. They are recorded so the next jar (investments, then business) can start from the same brief instead of from memory. Wording is the request as it was given. Where a long first message was a feature list, the list is kept and the surrounding sentence is kept with it.

Nothing here is a hidden system prompt. Excel workbooks were never part of the source that was committed.

## 1. Build personal books first

> We are creating HoneyJar version 2. Starting with the codebase from HoneyJar v1 project. We’ll start by making sure it is fully capable to do personal finances ensuring it has or building the following Personal Finance features.

The v1 tree was not in the workspace. Version 2 was built as a new app against that brief, not as a patch on an older codebase.

Personal finance, requested up front:

- Connect bank and credit accounts and see balances.
- A spending dashboard.
- Bills, subscriptions, and utilities: view, pay, and manage.
- Cash-flow projection out to one year.
- Net worth: assets, debts, homes, cars, loans, history, and a Zillow link.
- A spending plan that can roll leftover money into the next month.
- Goals and milestones, with projections and tax implications.
- Watchlists and alerts tied to real records, plus reminders.
- Automatic categorization.
- Custom reports.
- Tax reports: Schedules A–F, exportable, and a quarterly planner.
- Documents organized and linked to records.
- Credit-score tools.
- An API and MCP so another AI can read the books.
- An AI financial advisor that can use Grok, OpenAI, or a local Ollama.
- 256-bit encryption.
- Sharing with a partner or an advisor.
- A clean UI that can be customized: categories, rules, navigation, reports, the advisor, and the vault.

Then, afterwards, not in the first build:

- Investments: retirement what-ifs, a portfolio, time-weighted and money-weighted return, dividends, and market data.
- Business books: separate books, invoices, mileage, profit and loss, and Schedule C.

The same UI was supposed to be able to hold personal, business, and property finances later. Suggestions were welcome.

## 2. Household people, credit, and the transaction editor

> When looking at Transactions, clicking on any rows Merchant link modifies the top row.

> The ability to manage people for the household and assign expenses and income by or to each person would be good. For example for married couples being able to assign an expense to the husband vs wife or by kid. with the ability to generate reports and track expenses by person.

> it would be good to be able to have each peoples credit scores trackable independently.

> Continue building HoneyJar v2

> how to connect bank accounts

What that turned into:

- The transaction editor was remounted per row. It had been reusing the first opened row, so a click looked like it edited the top merchant.
- People are first-class. Transactions and bills can name a person. Reports and the spending chart can filter by person.
- Credit scores are a series per person (and an unassigned household series).
- Bank connect stays manual. HoneyJar does not log into a bank. The Accounts page says so, and points at a CSV import.

## 3. Tags, then “what is next?”

> It would be good to be able to set custom tags on transactions and be able to filter reports and graphs by tags or by person.

> What is next?

Tags are a list on each transaction. The spending pie, the by-person totals, and reports can filter by tag and by person. A saved report keeps those filters. The answer to “what is next” was investments, after personal books were solid. Business books come after that.

## 4. Put it in a private repo

> I would like to put the HoneyJar projects in my github account in a personal repo named HoneyJar that is not shared publicly at this time. HoneyJar v0 project should be labelled as version 0.5, HoneyJar v1 project should be labelled as version 1, HoneyJar v2 should be labelled as version 2. please do not include the excel document in the github repo. add the excel extensions to the gitignore file.

What landed:

- Private repo `davisjw/HoneyJar`.
- This tree is version 2, release tag `v2`.
- Version 0.5 and version 1 were not added. Their projects were not in the workspace and were not already on the GitHub account.
- Excel extensions are in `.gitignore`. No spreadsheet was committed.
