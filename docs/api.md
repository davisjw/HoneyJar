# API and MCP

Another program, including an AI, reads the personal jar with an API key. The same key works for the JSON API and for MCP.

Utilities, documents, tax lines, people, and the business and property jars are not on this API. Portfolio lots are included. Accounts, transactions, bills, and goals are the personal jar only.

## Make a key

Open **Customize** while you are the household owner. **Create key**. The token is shown once. It starts with `hj_`. The database keeps a SHA-256 hash and a short prefix. Copy the token then. There is no way to show it again. Revoke it on the same screen.

Send it on every request:

```http
Authorization: Bearer hj_...
```

Anyone with the token can read the personal jar and can add a transaction. Treat it like a password. Do not put it in a page, a prompt you paste into a public chat, or a shell history you share.

## JSON API

Base path: `https://YOUR-HOST/api/v1`

`GET /` returns the household name and the list of paths.

| Method and path | Returns |
| --- | --- |
| `GET /summary` | Today's date, currency, net worth in cents and as a formatted string, and this month's spending by category. |
| `GET /accounts` | Accounts that are not archived. Balances are cents. |
| `GET /transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50` | Transactions on the personal jar, newest first in the stored list. `limit` defaults to 50 and caps at 200. |
| `GET /bills` | Bills, subscriptions, and utilities, including the next due date. |
| `GET /goals` | Goals. |
| `GET /networth` | Asset total, debt total, net, and each asset. |
| `GET /portfolio` | Lots, the prices you typed, flows, Dietz, IRR, and retirement sketches. Not a live quote. |
| `GET /alerts` | Open alerts, each with a path inside HoneyJar. |

Amounts on transactions are integer cents. Negative means money out.

Add a transaction:

```bash
curl -s -X POST "$BASE/api/v1/transactions" \
  -H "Authorization: Bearer $HONEYJAR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"accountId":"ACCOUNT_ID","merchant":"Market","amountCents":-4280,"postedOn":"2026-10-16"}'
```

`accountId`, `merchant`, and `amountCents` are required. Optional fields are `memo`, `categoryId`, `personId`, and `tags` (an array of strings). The transaction is marked `source: "api"`. The account balance moves by the same amount.

A missing or wrong token is `401` with `{"error":"Send Authorization: Bearer hj_…"}`. An unknown path is `404`.

There is no paging beyond `limit`, no webhook, and no filter by person or tag. Pull `/transactions` for a date range and filter on your side.

## MCP

`POST /api/mcp` with the same bearer token. The body is JSON-RPC.

`initialize` and `tools/list` return the tool names. `tools/call` runs one tool and returns the JSON above as a text block.

| Tool | Same as |
| --- | --- |
| `spending_summary` | `GET /summary` |
| `list_accounts` | `GET /accounts` |
| `list_transactions` | `GET /transactions` with the defaults |
| `upcoming_bills` | `GET /bills` |
| `net_worth` | `GET /networth` |
| `portfolio` | `GET /portfolio` |
| `list_goals` | `GET /goals` |
| `list_alerts` | `GET /alerts` |

Arguments on `list_transactions` are ignored. The tool always uses the default window (50 transactions, no `from` or `to`). Use the JSON API when the date range matters.

Point an MCP client at `https://YOUR-HOST/api/mcp` and give it the bearer token as the header. If the client can only send a URL, it cannot authenticate. The header is required.
