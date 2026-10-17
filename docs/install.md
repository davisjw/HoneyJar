# Install

HoneyJar is a server app. The screens are a Vite build. The books live in Postgres. With no `DATABASE_URL` they live in a local file, which is enough to try the app on one machine.

You need Node 22 and npm.

## Try it

```bash
git clone https://github.com/davisjw/HoneyJar.git
cd HoneyJar
npm install
npm run dev
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). Choose **Need an account**. The password has to be at least 8 characters. The display name becomes the household name.

The first sign-in fills the jar with a sample household (the Calders). It is fiction. Edit it, or open **Customize** and choose **Clear books**. **Load sample household** puts it back.

With no `DATABASE_URL`, the database is a file at `data/pglite` (override the directory with `PGLITE_DATA_DIR`). Restarting the server keeps the book. That directory is gitignored. It is one machine and one process, and deleting it deletes the books. Use Postgres when the data should last, or when more than one machine should see it.

## Keep the data

Use any Postgres 15 or newer, including [Neon](https://neon.tech).

```bash
export DATABASE_URL="postgres://USER:PASSWORD@HOST/honeyjar?sslmode=require"
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export BETTER_AUTH_URL="https://books.example.com"
npm run build
npm run preview
```

`npm run build` applies `migrations/*.sql` when `DATABASE_URL` is set. Each file runs once, in order. Run `npm run db:migrate` on its own after you pull a new migration.

`BETTER_AUTH_URL` must be the origin users type in the browser, with no path. A mismatch makes sign-in fail.

Put those three variables in the host's environment. Do not commit them. There is no `.env` file in this repo on purpose.

The process has to stay running. A static file host is not enough. `npm run preview` serves the production build. On a host, use the same command, or `node` against the Vite preview, with `PORT` set if the host requires it.

## Sign-in

Email and password are on. Google and X appear only when the host sets `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` (and, if you are not using the default broker, `GROK_AUTH_ISSUER`). Those values are not in the source. A copy you run yourself can ignore them and use email and password.

There is no password-reset email in this build. Keep the password.

## Advisor keys

These are optional.

| Variable or setting | What it does |
| --- | --- |
| `XAI_API_KEY` | Lets the Advisor call Grok from the server. The browser never sees this key. |
| OpenAI key in Customize | Stored on the household profile. The browser is told only that a key is set. |
| Ollama URL in Customize | The browser sends the brief to that URL. The server does not call Ollama. |

The advisor receives balances, this month's spending, bills, and goals. Do not turn it on if you do not want those numbers sent to that provider.

## Check the build

```bash
npm test
npm run typecheck
```

`npm test` includes the page budgets and a second household load. It does not need `DATABASE_URL`.
