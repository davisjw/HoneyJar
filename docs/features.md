# Features

HoneyJar keeps one household, split into jars. The personal jar is home spending. A business jar is a Schedule C. A property jar is a Schedule E rental. The screen you are on shows the open jar. **Jars** creates them. **Summary** adds the jars together without mixing their categories.

Nothing here downloads from a bank. An account balance is whatever you last typed. **Accounts** can import a CSV of date, amount, and description, or an OFX or QFX statement. Transactions that arrive that way are marked `import`.

Money inside the app is integer cents. A negative transaction is money out.

## Money

| Screen | What it does |
| --- | --- |
| Spending | This month's spending and income, by category, person, or tag. Alerts. A short cash chart. |
| Transactions | The register. Search, category, person, tags, and a tax line. The list starts with 200 matches in the loaded window, about the last 24 months. Show more reveals another 200. Load earlier fetches the previous 24 months when older rows exist. |
| Bills | Bills, subscriptions, and utilities, with a next due date. Paying a bill writes a transaction. A utility bill can point at a meter, and a payment can point at one workbook row, so you can see paid against the statement and against the line items. |
| Utilities | A workbook per meter, on the open jar. Columns, formulas, inclining-block rate tiers, and child meters (a charger under the house). Calculated cells are computed when the sheet is shown. They are not stored. Graphs compare one column to last year, and paid amounts to the statement. |
| Spending plan | Assign money to categories. Categories can roll what is left into next month. |
| Cash flow | Liquid accounts, projected out to a year from bills and whatever is planned but not already a bill. |

A rule matches a merchant and sets the category. Rules run when a transaction is saved.

## Wealth

| Screen | What it does |
| --- | --- |
| Net worth | Accounts, assets, and debts. A home can store an address and a Zillow link. The value is what you typed. |
| Portfolio | Lots, prices you type, dividends, and sales. Return is modified Dietz and an IRR. It is not a live quote. Selling writes a Schedule D row. |
| Goals | A target, what you have saved, and a monthly amount. |
| Milestones | Dated notes, with an optional tax estimate. |
| Credit | A score series per person, and one for the household. |

## Tax and reports

| Screen | What it does |
| --- | --- |
| Reports | Spending or income, grouped and filtered. A report can be saved. |
| Taxes | Schedules A through F from categories and from sales. A federal estimate using 2026 brackets, a safe harbor, and voucher dates. Export JSON or CSV. This is a planner, not a return. |
| Watchlists | A balance, a goal, or a category you want called out on Spending. |
| Reminders | A date and a note. |

Business and property jars add invoices, mileage, and a lease. Rent invoices can be generated from the lease. Those screens do not appear on the personal jar.

## Household

| Screen | What it does |
| --- | --- |
| People | Adults and children. Transactions and bills can name one. An adult can store an email and be invited; the password stays on their sign-in. A child has no sign-in. |
| Documents | A title, a kind, a year, and notes. A body can be stored in the vault. A receipt (JPEG, PNG, WebP, GIF, or PDF, up to 8 MB) can be attached to a transaction or a bill. That file is encrypted on disk and is not loaded with the books. |
| Sharing | Invite an email as editor, viewer, or advisor. They see this household after they accept. |
| Accounts | The account list, the CSV, OFX, or QFX import, and the note that there is no bank login. |
| Advisor | A short brief of the books, sent to Grok, OpenAI, or an Ollama server you name. It is told not to invent numbers and not to act as a broker. Setup is in [Install](install.md#advisor). Grok answers only when the server has `XAI_API_KEY`. OpenAI uses a key saved in Customize. Ollama is called by the server, at the URL you set, which defaults to the same machine. |
| Customize | Categories, rules, which nav links are hidden, API keys, the vault, and the sample household. |
| Jars | Open, create, or archive a personal, business, or property jar. |

## Vault

Customize can set a passphrase. Document bodies saved after that are encrypted in the browser with AES-GCM and a 256-bit key. The server stores a salt and a check value, not the passphrase and not the key. A reload locks it. Documents saved before a vault exists stay plaintext.

## What the sample household is

The sample is a made-up family, with made-up merchants, a studio, a rental on Maple Street, and a year of utility reads. It is there so the screens are not empty. It is not a real person's books.
