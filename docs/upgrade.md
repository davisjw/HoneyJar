# Upgrade

## Production secret (Docker and any host)

Compose no longer fills in a development secret, and it sets `HONEYJAR_ENV` to `production` unless you set something else. A production process stops unless `BETTER_AUTH_SECRET` is set, at least 32 bytes, and not `honeyjar-dev-secret-change-me`.

Generate a secret with:

```bash
openssl rand -base64 32
```

Put it in `.env` next to `compose.yaml` (see `.env.example`) or in the host environment, then start again:

```bash
docker compose up --build -d
```

The refusal names `BETTER_AUTH_SECRET`, shows the `openssl` command, and points at [install.md](install.md).

**If you already set `BETTER_AUTH_SECRET`, keep that exact value.** Sessions and receipt files were encrypted and signed with it. Replacing it signs everyone out, and receipts written under the old value will not open.

**If you never set one,** Compose used the public value `honeyjar-dev-secret-change-me`. That value is rejected in production mode, so `docker compose up` now stops until you set a real secret. Sessions from the old default end. Receipts written under that default will not open with the new secret. Keep a backup of the `honeyjar-files` volume and the database before you change anything. Do not put the old public value back into `BETTER_AUTH_SECRET`.

A host that is not Compose follows the same rule once `HONEYJAR_ENV=production`. Outside production mode the server still starts and logs a warning.
