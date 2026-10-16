# Before you share the code

Sharing the repository is not the same as hosting the app. A public repo shows the source and the git history. A host shows whatever households people type in after that.

## Personal data in this repository

There is no bank export, tax return, or real address book in the tree.

- Git history on `main` is committed as `davisjw <2166258+davisjw@users.noreply.github.com>`. That is GitHub's noreply address. It encodes the numeric GitHub user id. It is not a mailbox.
- The sample household is fiction: the Calders, merchants such as PG&E and a studio, `*.example` client emails, and a rental at 418 Maple Street, Portland. Those strings are in `src/lib/honey/seed.ts` and the tests.
- [prompts.md](prompts.md) is the product conversation that shaped version 2. It is not financial data. It is still your writing. Delete it or leave it untracked if you do not want that public.
- `AGENTS.md` and the files under `public/__grok/` and `scripts/grok-*` are instructions and chrome from the Grok app builder. They are not your household. They will confuse someone cloning the repo, and they name that platform.
- Older branches `v0.1`, `v0.5`, and `v1`, and the tags `v0.5` and `v1`, are published with the repo the moment the repo is public. A search of those trees found no personal email address. They are old snapshots, not the app in this README.

A household you typed into a deployed database is not in git. It becomes public only if that database is public, or if you paste an API response into the repo.

## Security before a public repo or a public host

Do these before you flip the repository to public, and again before anyone else can sign in on a server you run.

1. **The preview OAuth secret.** `src/lib/auth/preview.ts` contains a client id and secret used only for Grok live-preview sign-in on `*.grok-sandbox.com`. It is a real secret baked into the source. Rotate it at the broker, or remove the constant, before this tree is public. A self-hosted copy does not need it. Email and password do not use it.
2. **Host secrets stay in the environment.** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `XAI_API_KEY`, and `GROK_AUTH_CLIENT_SECRET` must not be committed. They are not in git today. Keep it that way.
3. **An API key is the whole personal jar.** `/api/v1` allows any origin. The token is a bearer header, not a cookie, so another website cannot read it out of the browser by itself. Anyone you hand the token to can read balances and post transactions. There is no scope, no expiry, and no rate limit. Keys are created and revoked in Customize.
4. **The advisor sends numbers away.** Grok and OpenAI receive the brief described in [features.md](features.md). The OpenAI key is stored on the profile. It is not shown back to the browser. It is not encrypted at rest.
5. **The vault does not cover the books.** Only document bodies saved after a passphrase is set are encrypted. Transactions, balances, and bills are ordinary database rows.
6. **Do not deploy without Postgres and a real auth secret.** With no `DATABASE_URL`, one server process holds every household in memory and drops them on restart. `BETTER_AUTH_SECRET` must be stable across restarts or every session dies. Auth refuses to run disabled when `DATABASE_URL` is set, which is what you want.
7. **There is no password reset and no email verification.** A lost password is a lost household unless you reset it in the database yourself.

## What would help this hold up

- A license. There is no `LICENSE` file. Without one, people cannot tell what they are allowed to do with the code.
- The README and these docs, kept true when a screen changes. [architecture.md](architecture.md) is the note for someone changing the code. Its closing section is older than the business jar and the portfolio. Prefer [features.md](features.md) for what the app does now.
- A hosted instance only after the items above. Source on its own is enough for someone technical to run it.
- A one-line backup story: `pg_dump` of `DATABASE_URL`. There is no full-household export in the app. Taxes can export a schedule. That is not a backup.
- A place to file issues, and a sentence that the tax screen is a planner.

## Not built, and easy to forget

- No bank connection, and no plan to store a bank password.
- The public API does not expose utilities, documents, people, or a business jar.
- MCP cannot pass a date range. See [api.md](api.md).
- No account deletion screen, no data export of the whole household, and no audit log.
- Page budgets in `npm test` catch an expensive screen. They do not catch a hostile API client.
- `package.json` is marked `"private": true`. That only stops `npm publish`. It does not stop GitHub from showing the code.
