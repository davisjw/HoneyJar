# Security

Report a vulnerability through [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-repository-vulnerabilities-privately) on this repository. Do not open a public issue, and do not paste an API key, a database dump, or a household export.

A public repository is the source code. It is not a hosted set of books. Before anyone else can reach an instance, point `DATABASE_URL` at Postgres. If you do not set `BETTER_AUTH_SECRET`, the first start generates one and keeps it in `data/auth`. The checks for a host are in [docs/release.md](docs/release.md).

Pull requests run the test suite and `npm audit --audit-level=high`. CodeQL scans JavaScript and TypeScript. Dependabot opens weekly update requests.
