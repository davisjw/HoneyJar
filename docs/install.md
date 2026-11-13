# Install

HoneyJar is one app with two seats. On one machine, leave `DATABASE_URL` unset and the books live in a local file. As a server, point `DATABASE_URL` at Postgres. A packaged app you open without starting a Node process is the direction, and it is not built yet. The screens are a Vite build either way.

You need Node 22 and npm.

## Local setup

```bash
git clone https://github.com/davisjw/HoneyJar.git
cd HoneyJar
npm install
npm run dev
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). Choose **Need an account**. The password has to be at least 8 characters. The next screen asks you to name the household. That name starts a blank set of books. The sample household is loaded only from **Customize**, and only after you confirm.

On Windows, install [Node 22](https://nodejs.org/) and Git, then use PowerShell in the project folder:

```powershell
git clone https://github.com/davisjw/HoneyJar.git
cd HoneyJar
npm install
npm run dev
```

Open the same address. Leave `DATABASE_URL` unset for a first try. The books are stored in `data\pglite`. Ctrl+C stops the server. Docker is not required.

The first sign-in asks for a household name and starts blank. **Load sample household** in Customize puts the Calder books in, and it asks before it erases what is already there.

With no `DATABASE_URL`, the database is a file at `data/pglite` (override the directory with `PGLITE_DATA_DIR`). Restarting the process keeps the book. That directory is gitignored. It is one machine and one process, and deleting it deletes the books. Use Postgres when the data should last, or when more than one machine should see it.

## Asking Grok to install it

[Grok Build](https://x.ai/cli) is a terminal agent that runs on your computer. From this repo, ask it to follow this page. The result is the same app: Node, npm, and either the local file or Postgres. There is no separate Grok edition.

Grok Bot is not an install target. HoneyJar is not a plugin for it, and the bot does not store these books. A bot that can run a shell on a machine you control can run the commands in [Local setup](#local-setup). You still choose the machine, and you still keep the database.

## Advisor

The Advisor screen is in the app after you install it. It is not part of Grok Bot, and installing HoneyJar does not sign you into Grok.

Customize picks the model. The default is Grok. The server sends a short brief, not every transaction: the household name, today's date, net worth, account names and balances, the largest spending categories this period, the next eight bills, goals, a portfolio summary, and the filing status. The last eight advisor messages go along as the conversation. The model is told to use only those figures, and that it is not a broker and not filing a return.

| Provider | When it answers | How to set it up |
| --- | --- | --- |
| Grok | The server process has `XAI_API_KEY`. A Grok chat login is not that key. | Create a key at [console.x.ai](https://console.x.ai) and put it in the environment of the process that serves the app. `npm run dev` reads the variable from the shell. Docker Compose does not pass it through unless you add `XAI_API_KEY` to the app service. The call is `https://api.x.ai/v1/chat/completions` with model `grok-4.5`. Without the key, Advisor says Grok is not available and you can switch providers. |
| OpenAI | A key is saved on the household. | Customize, then **OpenAI**, then paste the key and choose a model. The default model is `gpt-4.1-mini`. The key is stored in the database and is not encrypted at rest. It is not shown again. |
| Ollama | The HoneyJar process can reach the URL in Customize. The browser does not make this call. | The default is `http://127.0.0.1:11434` and model `llama3.1`. That works for `npm run dev` when Ollama is on the same machine. Inside Docker, `127.0.0.1` is the container, not your computer. Point the URL at the host, or run Ollama where the container can reach it. |

Grok is the one to use when the host already has an xAI key and you do not want to store a model key in the household database. Ollama is the one to use when the brief should not leave your machine. OpenAI is the one to use when you have that key and you accept it sitting in the database.

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

App and Postgres together. Compose sets `HONEYJAR_ENV` to `production` and will not start without `BETTER_AUTH_SECRET`. It does not ship a development secret.

```bash
cp .env.example .env
openssl rand -base64 32
```

Paste that value into `BETTER_AUTH_SECRET` in `.env`, then:

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The container applies migrations, then runs the dev server. The published build is served by `npm run preview` on the host, not inside this image. An install that already had its own secret must keep that same value. See [upgrade.md](upgrade.md). Outside Compose, leaving `BETTER_AUTH_SECRET` unset makes the first start generate one and store it in the `honeyjar-auth` volume. Set it yourself if you want to choose the key. Receipts sealed with an older key are rewritten before that older key is dropped. The database port is bound to `127.0.0.1` only. On a remote host, follow [Nginx on a different machine from Docker](#nginx-on-a-different-machine-from-docker) instead of opening port 8080.

Local Compose changes belong in `compose.override.yaml`, copied from [compose.override.example.yaml](../compose.override.example.yaml). `docker compose up` loads that file when it is present and does not fail when it is absent. It is gitignored, so a pull does not replace it. An `include` cannot do this: Compose stops if an included path is missing, and an include is not allowed to override a service defined in the included file. If you pass `-f` yourself, Compose no longer looks for the override. Add `-f compose.override.yaml` last, and only when the file exists.

## Keep the data

Use any Postgres 15 or newer, including [Neon](https://neon.tech).

```bash
export DATABASE_URL="postgres://USER:PASSWORD@HOST/honeyjar?sslmode=require"
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export BETTER_AUTH_URL="https://books.example.com"
export HONEYJAR_ENV=production
npm run build
npm run preview
```

`npm run build` applies `migrations/*.sql` when `DATABASE_URL` is set. Each file runs once, in order. Run `npm run db:migrate` on its own after you pull a new migration.

`BETTER_AUTH_URL` must be the origin users type in the browser, with no path. A mismatch makes sign-in fail with `Invalid origin`.

## Production mode

`HONEYJAR_ENV=production` means this install is a real one, on any host. Docker Compose sets that by default. Unset, `development`, and `preview` are not production. `NODE_ENV` does not select it.

In production mode the server refuses to start when `BETTER_AUTH_SECRET` is missing, shorter than 32 bytes, or still `honeyjar-dev-secret-change-me`. The process exits on Node. A serverless host answers the first request with 500 and that same text, and does not sign or encrypt with a fallback secret. Generate a secret with:

```bash
openssl rand -base64 32
```

Keep that value. Sessions and receipt files are tied to it. The refusal points back to this page.

Outside production mode, including `npm run dev` with `HONEYJAR_ENV` unset, the server still starts, logs a warning, and uses a development fallback. Do not expose that to anyone else.

Put the variables in the host's environment or in `.env` for Compose. Do not commit them. `.env` is gitignored. [`.env.example`](../.env.example) lists the names.

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

## Remote host that already has nginx

Do this on the server, not on your laptop. Replace `books.example.com` with the hostname you will type in the browser. That name needs a DNS record pointing at the server before the certificate step.

Install Node 22, then create the database. Postgres on the same machine does not need `sslmode=require`. Add that only for a host such as Neon.

```bash
sudo -u postgres createuser --pwprompt honeyjar
sudo -u postgres createdb --owner=honeyjar honeyjar
sudo mkdir -p /opt/honeyjar
sudo chown "$USER" /opt/honeyjar
git clone https://github.com/davisjw/HoneyJar.git /opt/honeyjar
cd /opt/honeyjar
npm install
```

Put the secrets in a root-only file. The auth URL is the public `https` origin, even though nginx will talk to the app over plain HTTP on localhost.

```bash
sudo tee /etc/honeyjar.env >/dev/null <<'EOF'
DATABASE_URL=postgres://honeyjar:PASSWORD@127.0.0.1:5432/honeyjar
BETTER_AUTH_SECRET=PASTE_A_LONG_RANDOM_VALUE
BETTER_AUTH_URL=https://books.example.com
HONEYJAR_ENV=production
EOF
sudo chmod 600 /etc/honeyjar.env
```

Generate the secret with `openssl rand -base64 32`. Then build and migrate:

```bash
set -a
. /etc/honeyjar.env
set +a
npm run build
```

Keep the preview server running as a service. It listens on `127.0.0.1:8081` and must not be opened in the firewall.

```bash
sudo tee /etc/systemd/system/honeyjar.service >/dev/null <<'EOF'
[Unit]
Description=HoneyJar
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/honeyjar
EnvironmentFile=/etc/honeyjar.env
ExecStart=/usr/bin/npm run preview
Restart=on-failure
User=REPLACE_WITH_YOUR_LOGIN

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now honeyjar
```

`User=` is the account that owns `/opt/honeyjar`. Check `systemctl status honeyjar` and `curl -sI http://127.0.0.1:8081/` before touching nginx. A failure here is the app, not the proxy.

Proxy that local port. This block is HTTP only so Certbot can attach the certificate.

```bash
sudo tee /etc/nginx/sites-available/honeyjar >/dev/null <<'EOF'
server {
	listen 80;
	server_name books.example.com;

	location / {
		proxy_pass http://127.0.0.1:8081;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}
EOF
sudo ln -s /etc/nginx/sites-available/honeyjar /etc/nginx/sites-enabled/honeyjar
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d books.example.com
```

Certbot adds the `443` server and the redirect from port 80. If the site file already exists, edit `server_name` and `proxy_pass` instead of writing a second one. Do not proxy under a path.

Open 80 and 443 only:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Sign up at `https://books.example.com`, not at `http://THE_IP:8080` and not through an SSH tunnel. Those are different origins, and the app rejects them. After a change to `/etc/honeyjar.env`, run `sudo systemctl restart honeyjar`.

Skip this section when HoneyJar is already a container. Do not also install the systemd service.

## Nginx on a different machine from Docker

HoneyJar and nginx do not share localhost. The browser still talks only to nginx. Nginx reaches HoneyJar over a private address. Postgres stays on the Docker machine and is not part of the proxy.

On the HoneyJar machine, `10.0.0.5` is that machine's private address and `10.0.0.4` is the nginx machine. Use your own addresses.

```bash
export HONEYJAR_PUBLISH="10.0.0.5:8080"
export BETTER_AUTH_URL="https://books.example.com"
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
docker compose up --build -d
curl -sI http://10.0.0.5:8080/
```

`BETTER_AUTH_URL` is the public site, not `http://10.0.0.5:8080`. The dev server allows that public hostname, and no others, so the image has to be rebuilt after this setting changes. Allow port 8080 only from the nginx machine:

```bash
sudo ufw allow from 10.0.0.4 to any port 8080 proto tcp
```

Do not allow port 5432 from anywhere. The database publish is `127.0.0.1:5432` on the HoneyJar machine.

On the nginx machine, proxy to the private address. The `Host` header stays the public name. The upgrade lines are for the dev server inside the container.

```bash
sudo tee /etc/nginx/sites-available/honeyjar >/dev/null <<'EOF'
server {
	listen 80;
	server_name books.example.com;

	location / {
		proxy_pass http://10.0.0.5:8080;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "upgrade";
	}
}
EOF
sudo ln -sf /etc/nginx/sites-available/honeyjar /etc/nginx/sites-enabled/honeyjar
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d books.example.com
```

From the nginx machine, `curl -sI http://10.0.0.5:8080/` must succeed before Certbot. Sign up only at `https://books.example.com`. After the exports change, run `docker compose up -d` again on the HoneyJar machine.

If nginx is on the same machine as Docker, skip `HONEYJAR_PUBLISH` and use `proxy_pass http://127.0.0.1:8080`. The default publish is already localhost.

## Sign-in

Email and password are on. Google and X appear only when the host sets `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` (and, if you are not using the default broker, `GROK_AUTH_ISSUER`). Those values are not in the source. A copy you run yourself can ignore them and use email and password.

The broker has to allow these redirect URLs, with the origin people type in the browser:

```text
https://books.example.com/api/auth/callback/grok-google
https://books.example.com/api/auth/callback/grok-x
```

Better Auth 1.7 does not serve `/api/auth/oauth2/callback/grok-google` or `/api/auth/oauth2/callback/grok-x`. A broker app still registered on those old paths has to be updated.

## OpenID Connect

Email and password stay on the sign-in page. Google and X stay too, and they still appear only when the broker client is set. A directory adds one more button. Leave the `OIDC_` variables unset and that button is not shown.

Any OpenID Connect directory works. The steps below use Authentik. Okta, Microsoft Entra, Google Workspace, Keycloak, and Auth0 use the same four variables. The redirect URL HoneyJar gives the directory is always:

```text
https://books.example.com/api/auth/callback/oidc
```

Use the origin people type in the browser. No trailing slash on the origin. The path is fixed. A directory that was pointed at `/api/auth/oauth2/callback/oidc` has to be changed to this path. Better Auth 1.7 no longer serves the old one.

### Authentik

1. In the Authentik admin interface, open **Applications**, then **Providers**, then **Create**. Choose **OAuth2/OpenID Provider**.
2. Name it HoneyJar. Authorization flow can stay the default. Client type is **Confidential**.
3. Copy the client id and client secret. Authentik shows the secret once.
4. Under Redirect URIs, add the URL above as a strict redirect. Scopes must include `openid`, `email`, and `profile`.
5. Set PKCE to **S256**.
6. Create an **Application**. The slug becomes part of the issuer, so `honeyjar` is a good slug. Select the provider you just made. Assign the users or group who may sign in. An application with no policy binding lets nobody through.
7. Open the provider again and copy the **Issuer** URL. It looks like `https://auth.example/application/o/honeyjar/`. Do not paste the discovery document. If the page only shows a URL ending in `/.well-known/openid-configuration`, delete that suffix and use what remains.

### HoneyJar

On the machine that runs HoneyJar, set the variables and restart. `OIDC_LABEL` is the button text.

```bash
export OIDC_ISSUER="https://auth.example/application/o/honeyjar/"
export OIDC_CLIENT_ID="the-client-id"
export OIDC_CLIENT_SECRET="the-client-secret"
export OIDC_LABEL="Acme"
```

With Docker, those exports have to be in the environment of `docker compose`. Pull first so the image contains this sign-in, then recreate:

```bash
git pull
docker compose up --build -d
```

A host that uses `/etc/honeyjar.env` and systemd adds the same four lines to that file, then runs `sudo systemctl restart honeyjar`.

`OIDC_ISSUER` has to open from the browser and from the HoneyJar process. Inside the container, `localhost` is the container, not Authentik. Use a hostname both sides can resolve. A trailing slash on the issuer is fine.

If the container log says `unable to verify the first certificate`, Authentik's certificate is not signed by a public authority. Prefer the public Authentik address that nginx already serves with a real certificate. Point `OIDC_ISSUER` at that address. The container has to resolve that name.

When the only address is a private certificate, save the issuer certificate on the HoneyJar machine as `oidc-ca.pem` next to `compose.yaml`. From a machine that can reach Authentik:

```bash
openssl s_client -connect auth.example:443 -servername auth.example -showcerts </dev/null
```

Copy the issuer certificate, the block after the site certificate. If the site certificate is self-signed, copy that block instead. The file should start with `-----BEGIN CERTIFICATE-----`. Then start HoneyJar with the extra Compose file:

```bash
docker compose -f compose.yaml -f compose.oidc-ca.yaml up -d
```

Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`. That turns certificate checks off for every connection the app makes.

The sign-in page then shows **Continue with Acme** under the email form. The email form is still there. An Authentik email that already has a HoneyJar account signs into that account. A new email creates a household.

Set `OIDC_PKCE=false` only when the provider rejects the code challenge. Leave it unset when Authentik is on S256.

| Variable             | Why                                                        |
| -------------------- | ---------------------------------------------------------- |
| `OIDC_ISSUER`        | Issuer URL from the directory. Not the discovery document. |
| `OIDC_CLIENT_ID`     | Client id of the confidential client.                      |
| `OIDC_CLIENT_SECRET` | Client secret. Keep it in the environment, not in git.     |
| `OIDC_LABEL`         | Button text. Defaults to "OpenID Connect".                 |
| `OIDC_PKCE`          | Optional. `false` turns the code challenge off.            |

## Password reset

There is no password-reset email unless you set SMTP. Then the sign-in page can email a link. Without SMTP, a signed-in owner can still change the password and can create a recovery code.

| Variable                  | Why                                               |
| ------------------------- | ------------------------------------------------- |
| `SMTP_HOST`               | Mail server. Leave unset to keep email reset off. |
| `SMTP_PORT`               | Defaults to 587. Use 465 for implicit TLS.        |
| `SMTP_USER` / `SMTP_PASS` | Optional login for that server.                   |
| `SMTP_FROM`               | The From address. Required with `SMTP_HOST`.      |

## Advisor keys

These are optional.

| Variable or setting     | What it does                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| `XAI_API_KEY`           | Lets the Advisor call Grok from the server. The browser never sees this key. |
| OpenAI key in Customize | Stored on the household profile. The browser is told only that a key is set. |
| Ollama URL in Customize | The HoneyJar server posts the brief and your question to that URL. The address has to be one the server can open; 127.0.0.1 works only when Ollama runs on the same machine. The browser does not call Ollama. |

The advisor receives balances, this month's spending, bills, and goals. Do not turn it on if you do not want those numbers sent to that provider.

## Check the build

```bash
npm test
npm run typecheck
```

`npm test` includes the page budgets and a second household load. It does not need `DATABASE_URL`.
