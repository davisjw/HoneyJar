# API and MCP

Another program, including an AI, reads the books with an API key. The same key works for the JSON API and for MCP. A key can read every jar that sign-in owns, and can add a transaction. It cannot read a document body.

## Make a key

Open **Customize** while you are the household owner. **Create key**. Leave the days field blank for a key that does not expire, or enter a number of days. Choose **Read only** or **Can add a transaction**. A new key starts as read only. A key created before this choice can still add a transaction. The token is shown once. It starts with `hj_`. The database keeps a SHA-256 hash, a short prefix, the scope, and the expiry. Copy the token then. There is no way to show it again. Revoke it on the same screen.

Each server process allows 60 requests a minute for a key. A second process counts separately. An expired key is rejected.

Send it on every request:

```http
Authorization: Bearer hj_...
```

Anyone with a write token can read the jars and can add a transaction. A read-only token can read and gets `403` with `{"error":"This key is read-only."}` if it tries to add one. Treat either token like a password. Do not put it in a page, a prompt you paste into a public chat, or a shell history you share.

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
| `GET /people` | People. |
| `GET /documents` | Document names, kind, year, and whether the body is encrypted. The body is not returned. |
| `GET /utilities` | Meters, columns, and readings. |
| `GET /jars` | Each jar's name, kind, and accounts. |
| `GET /jars?id=ID&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50` | That jar's bills and transactions. `limit` caps at 200. |

Amounts on transactions are integer cents. Negative means money out.

Add a transaction:

```bash
curl -s -X POST "$BASE/api/v1/transactions" \
  -H "Authorization: Bearer $HONEYJAR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"accountId":"ACCOUNT_ID","merchant":"Market","amountCents":-4280,"postedOn":"2026-10-16"}'
```

`accountId`, `merchant`, and an integer `amountCents` are required. Optional fields are `postedOn`, `memo`, `categoryId`, `personId`, and `tags` (an array of strings). The transaction is marked `source: "api"`. The account balance moves by the same amount. A read-only key is refused.

A missing or wrong token is `401` with `{"error":"Send Authorization: Bearer hj_…"}`. An unknown path is `404`.

There is no paging beyond `limit`, no webhook, and no filter by person or tag. Pull `/transactions` for a date range and filter on your side.

## MCP

`POST /api/mcp` with the same bearer token. The body is JSON-RPC.

`initialize` and `tools/list` return the tool names the key is allowed to call. A read-only key does not see `add_transaction`. `tools/call` runs one tool and returns the JSON above as a text block.

| Tool | Same as |
| --- | --- |
| `spending_summary` | `GET /summary` |
| `list_accounts` | `GET /accounts` |
| `upcoming_bills` | `GET /bills` |
| `net_worth` | `GET /networth` |
| `portfolio` | `GET /portfolio` |
| `list_goals` | `GET /goals` |
| `list_alerts` | `GET /alerts` |
| `list_people` | `GET /people` |
| `list_documents` | `GET /documents` |
| `list_utilities` | `GET /utilities` |
| `list_jars` | `GET /jars`. Arguments `id`, `from`, `to`, `limit`. |
| `list_transactions` | `GET /transactions`. Arguments `from`, `to`, `limit`. |
| `add_transaction` | `POST /transactions`. Arguments `accountId`, `merchant`, `amountCents`, and optionally `postedOn`, `memo`, `categoryId`, `personId`, `tags`. Write keys only. |

`list_transactions` and `list_jars` pass `from`, `to`, `limit`, and (for jars) `id` through to the JSON API. Other tools ignore arguments.

Point an MCP client at `https://YOUR-HOST/api/mcp` and give it the bearer token as the header. If the client can only send a URL, it cannot authenticate. The header is required.
