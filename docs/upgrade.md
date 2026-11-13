# Upgrade

1. Set `HONEYJAR_ENV=production` and a real `BETTER_AUTH_SECRET`.
2. Back up the `honeyjar-files` volume and the database before the first production start.
3. Re-encryption of existing receipt files and stored secrets (`files:rekey`, `secrets:migrate`) comes with HJ-006 and HJ-012.
