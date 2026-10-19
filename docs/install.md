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

## Docker

Postgres only, with the app still on the host:

```bash
docker compose -f compose.postgres.yaml up -d
export DATABASE_URL="postgres://honeyjar:honeyjar@localhost:5432/honeyjar"
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export BETTER_AUTH_URL="http://127.0.0.1:8080"
npm run db:migrate
npm run dev
```

App and Postgres together:

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The container applies migrations, then runs the dev server. The published build is served by `npm run preview` on the host, not inside this image. Set `BETTER_AUTH_SECRET` before `docker compose up` if anyone else can reach the machine. The password in `compose.postgres.yaml` is for a private machine. Change it if port 5432 is open to a network.


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

`BETTER_AUTH_URL` must be the origin users type in the browser, with no path. A mismatch makes sign-in fail with `Invalid origin`.

Put those three variables in the host's environment. Do not commit them. There is no `.env` file in this repo on purpose.

The process has to stay running. A static file host is not enough. `npm run preview` serves the production build on `127.0.0.1:8081` only. That port is fixed. Do not open it on the firewall. Put a reverse proxy on the same machine in front of it.

## Reverse proxy

The browser must use `https://` on a real hostname. The session cookie is `Secure`, so a remote `http://` address can create the account and then look signed out. `http://localhost` is the only plain address that keeps the cookie.

Set `BETTER_AUTH_URL` to that public origin, then restart the app. No port, no path, and no trailing slash when the public site is on 443:

```bash
export BETTER_AUTH_URL="https://books.example.com"
```

Use one name. `https://books.example.com` and `https://203.0.113.10` are different origins, and only the value above is accepted.

Allow ports 80 and 443. Do not allow 8080 or 8081 from outside the machine.

Caddy gets the certificate and proxies the preview server:

```
books.example.com {
	reverse_proxy 127.0.0.1:8081
}
```

Nginx, with the certificate already on disk:

```nginx
server {
	listen 80;
	server_name books.example.com;
	return 301 https://books.example.com$request_uri;
}

server {
	listen 443 ssl;
	server_name books.example.com;
	ssl_certificate /etc/letsencrypt/live/books.example.com/fullchain.pem;
	ssl_certificate_key /etc/letsencrypt/live/books.example.com/privkey.pem;

	location / {
		proxy_pass http://127.0.0.1:8081;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}
```

The app is mounted at `/`. Do not proxy it under a path such as `/honeyjar/`.

While you are still on `npm run dev`, point the proxy at `127.0.0.1:8080` instead, and do not leave that port published. Switch the proxy to `8081` once `npm run preview` is the process you keep running. The dev server is not the production setup.

If the app is the Compose stack, publish its port on localhost only (`127.0.0.1:8080:8080`) and proxy to that. Override `BETTER_AUTH_URL` when you start Compose. The file's default is `http://localhost:8080`, which a public hostname will reject.

## Sign-in

Email and password are on. Google and X appear only when the host sets `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` (and, if you are not using the default broker, `GROK_AUTH_ISSUER`). Those values are not in the source. A copy you run yourself can ignore them and use email and password.

There is no password-reset email unless you set SMTP. Then the sign-in page can email a link. Without SMTP, a signed-in owner can still change the password and can create a recovery code.

| Variable | Why |
| --- | --- |
| `SMTP_HOST` | Mail server. Leave unset to keep email reset off. |
| `SMTP_PORT` | Defaults to 587. Use 465 for implicit TLS. |
| `SMTP_USER` / `SMTP_PASS` | Optional login for that server. |
| `SMTP_FROM` | The From address. Required with `SMTP_HOST`. |

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
