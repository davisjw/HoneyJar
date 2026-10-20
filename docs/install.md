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

Open [http://localhost:8080](http://localhost:8080). The container applies migrations, then runs the dev server. The published build is served by `npm run preview` on the host, not inside this image. Set `BETTER_AUTH_SECRET` before `docker compose up` if anyone else can reach the machine. The database port is bound to `127.0.0.1` only. On a remote host, follow [Nginx on a different machine from Docker](#nginx-on-a-different-machine-from-docker) instead of opening port 8080.


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
