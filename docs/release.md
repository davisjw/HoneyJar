# Before you share the code

Sharing the repository is not the same as hosting the app. A public repo shows the source and the git history. A host shows whatever households people type in after that.

## Personal data in this repository

There is no bank export, tax return, or real address book in the tree.

- Git history on `main` is committed as `davisjw <2166258+davisjw@users.noreply.github.com>`. That is GitHub's noreply address. It encodes the numeric GitHub user id. It is not a mailbox.
- The sample household is fiction: the Calders, merchants such as PG&E and a studio, `*.example` client emails, and a rental at 418 Maple Street, Portland. Those strings are in `src/lib/honey/seed.ts` and the tests.
- The product conversation that shaped version 2 is not in this tree.
- `AGENTS.md` and the files under `public/__grok/` and `scripts/grok-*` are instructions and chrome from the Grok app builder. They are not your household. They will confuse someone cloning the repo, and they name that platform.
- Older branches `v0.1`, `v0.5`, and `v1`, and the tags `v0.5`, `v1`, and `v2`, are published with the repo the moment the repo is public. A search of those trees found no personal email address. They are old snapshots, not the app in this README.
- These branches also exist and will be public: `release-docs`, `scale`, `share-ready`, and every `cursor/*` branch. A pattern search of those trees found no private key and no `XAI_API_KEY` value. Several of them still have commits that are not on `main`, including unfinished secret-storage work. They were left in place so that work is not thrown away. Delete a branch on GitHub if you do not want it seen.

A household you typed into a deployed database is not in git. It becomes public only if that database is public, or if you paste an API response into the repo.

## Security before a public repo or a public host

Do these before you flip the repository to public, and again before anyone else can sign in on a server you run.

1. **No OAuth client is baked in.** Google and X run only when `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` are set on the host. Email and password do not use them. Do not put a broker secret back into `src/lib/auth/preview.ts`.
2. **Host secrets stay in the environment.** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `XAI_API_KEY`, and `GROK_AUTH_CLIENT_SECRET` must not be committed. They are not in git today. Keep it that way. `compose.yaml` still defaults `BETTER_AUTH_SECRET` to `honeyjar-dev-secret-change-me`, and `compose.postgres.yaml` uses the database password `honeyjar`. Both are fine on `127.0.0.1`. Both are public the moment this repo is. Set your own before the app port or the database port can be reached by anyone else. Receipt files are encrypted with a key derived from `BETTER_AUTH_SECRET`. Changing that secret later makes old receipts unreadable.
3. **An API key is the whole set of jars.** `/api/v1` allows any origin. The token is a bearer header. A write key can read the books and post a transaction. A read-only key can read and cannot post. There are no finer scopes. A key can expire, and each server process allows 60 requests a minute. Keys are created and revoked in Customize. MCP lists `add_transaction` only for a write key.
4. **The advisor sends numbers away.** Grok and OpenAI receive the brief described in [features.md](features.md). The OpenAI key is stored on the profile. It is not shown back to the browser. It is not encrypted at rest.
5. **The vault does not cover the books.** Only document bodies saved after a passphrase is set are encrypted. Transactions, balances, and bills are ordinary database rows.
6. **Do not deploy without Postgres and a real auth secret.** With no `DATABASE_URL`, every household sits in `data/pglite` on that one machine. Deleting the directory, or starting a second copy, does not share those books. `BETTER_AUTH_SECRET` must be stable across restarts or every session dies. Auth refuses to run disabled when `DATABASE_URL` is set, which is what you want.
7. **A lost password has three ways back.** Change it while signed in. Or use the recovery code from Customize (shown once, then only the hash is stored). Or, if `SMTP_HOST` and `SMTP_FROM` are set, email a reset link. There is still no email verification.

## What would help this hold up

- A license. [LICENSE](../LICENSE) is Apache 2.0. [NOTICE](../NOTICE) is the attribution a derived app has to keep where its users can read it. That is not a requirement to publish the source of a hosted fork.
- Pull requests run [the test workflow](../.github/workflows/ci.yml) and [CodeQL](../.github/workflows/codeql.yml). Report a vulnerability the way [SECURITY.md](../SECURITY.md) says, not in a public issue.
- The README and these docs, kept true when a screen changes. [architecture.md](architecture.md) is the note for someone changing the code. Its closing section is older than the business jar and the portfolio. Prefer [features.md](features.md) for what the app does now.
- A hosted instance only after the items above. Source on its own is enough for someone technical to run it.
- A one-line backup story: `pg_dump` of `DATABASE_URL`. There is no full-household export in the app. Taxes can export a schedule. That is not a backup.
- A place to file issues, and a sentence that the tax screen is a planner.

## Not built, and easy to forget

- No bank connection, and no plan to store a bank password.
- The public API reads people, utility meters and readings, document names (not bodies), and each jar. It still does not return vault bodies.
- MCP `list_transactions` and `list_jars` take `from`, `to`, and `limit`. `list_jars` also takes `id`.
- Customize can export the owned jars as JSON, and can delete the sign-in after the household name is typed. There is still no audit of every edit. The activity list covers sign-in, password changes, recovery codes, export, delete, API keys, and invites.
- Page budgets in `npm test` catch an expensive screen. They do not catch a hostile API client.
- `package.json` is marked `"private": true`. That only stops `npm publish`. It does not stop GitHub from showing the code.
