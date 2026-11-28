# HoneyJar task board

As of Nov 27, 2026 (ET)

This file is the source of truth for HoneyJar tracking and replaces the Grok Pages Master Task Board. Update only the rows that change, ideally in the same PR as the code. The project has been paused since Nov 27 until Jeremy says go.

## Summary

| Status | Count |
|---|---:|
| Backlog | 20 |
| In Progress (Dev) | 0 |
| Testing (QA) | 7 |
| Docs | 0 |
| Deployment (DevOps) | 2 |
| Done | 21 |
| Blocked | 2 |
| **Total** | **52** |

On hold: 9 (7 Testing, 2 Blocked). The two Deployment tickets are awaiting Jeremy's merge approval, not marked on hold.

## Tickets

| ID | Phase | Feature | Title | Owner | Status | Depends on | PR |
|---|---|---|---|---|---|---|---|
| HJ-049 | P0 | Shared (§4 test baseline) | `npm test` fails on main | - | Done | — | [#16](https://github.com/davisjw/HoneyJar/pull/16) |
| HJ-001 | P0 | F4a (§4.1 production mode) | Add `isProductionMode()` helper driven by `HONEYJAR_ENV` | - | Done | — | [#7](https://github.com/davisjw/HoneyJar/pull/7) |
| HJ-002 | P0 | Secret box (§3, shared; used by F4a + F4c) | Build the secret box: versioned envelope with HKDF per-purpose keys and key rotation | - | Done | — | [#7](https://github.com/davisjw/HoneyJar/pull/7) |
| HJ-003 | P0 | F4a | Fail fast on a missing, short or dev-default `BETTER_AUTH_SECRET` in production mode | - | Done | HJ-001 | [#13](https://github.com/davisjw/HoneyJar/pull/13) |
| HJ-004 | P0 | F4a (§4.1 production mode) | Not-in-production-mode safety net: startup warning, Customize banner, read-only mode display | - | Done | HJ-001 | [#14](https://github.com/davisjw/HoneyJar/pull/14) |
| HJ-005 | P0 | F4a | HJF1 receipt file format with legacy read fallback | - | Done | HJ-002 | [#14](https://github.com/davisjw/HoneyJar/pull/14) |
| HJ-006 | P0 | F4a | `npm run files:rekey` migration command | - | Done | HJ-005 | [#15](https://github.com/davisjw/HoneyJar/pull/15) |
| HJ-007 | P0 | F4a | `compose.yaml` defaults to production mode with no built-in dev secret | - | Done | HJ-003 | [#13](https://github.com/davisjw/HoneyJar/pull/13) |
| HJ-008 | P0 | F4a | F4a test suite: file format, rekey, production-mode guard matrix | DevOps | Deployment (DevOps) | HJ-003, HJ-004, HJ-005, HJ-006 | [#37](https://github.com/davisjw/HoneyJar/pull/37) |
| HJ-009 | P0 | F4a | QA: review and verify F4a | - | Done | HJ-001, HJ-003, HJ-004, HJ-005, HJ-006, HJ-007, HJ-008, HJ-019 | [#37](https://github.com/davisjw/HoneyJar/pull/37) |
| HJ-010 | P0 | F4c | Encrypt `profiles.openai_key` on write in `profile.update` | - | Done | HJ-002 | [#15](https://github.com/davisjw/HoneyJar/pull/15) |
| HJ-011 | P0 | F4c | Decrypt the OpenAI key just before the advisor call; handle legacy and failure | - | Done | HJ-002 | [#15](https://github.com/davisjw/HoneyJar/pull/15) |
| HJ-012 | P0 | F4c | `npm run secrets:migrate` and production-mode startup migration | DevOps | Deployment (DevOps) | HJ-001, HJ-002, HJ-010 | [#17](https://github.com/davisjw/HoneyJar/pull/17) |
| HJ-013 | P0 | F4c | F4c test suite: secret-box migration, carry-through, rotation, Bearer mock | - | Backlog | HJ-010, HJ-011, HJ-012 | - |
| HJ-014 | P0 | F4c | QA: review and verify F4c | - | Backlog | HJ-010, HJ-011, HJ-012, HJ-013 | - |
| HJ-015 | P0 | F5a | Correct `docs/features.md` mismatches | - | Done | — | [#6](https://github.com/davisjw/HoneyJar/pull/6) |
| HJ-016 | P0 | F5a | Correct `docs/plan.md` and write the approved plan amendment | - | Done | — | [#6](https://github.com/davisjw/HoneyJar/pull/6) |
| HJ-017 | P0 | F5a | Correct Ollama docs: the server calls Ollama, not the browser | - | Done | — | [#6](https://github.com/davisjw/HoneyJar/pull/6) |
| HJ-041 | P0 | F5a | Correct remaining "CSV import" mentions in `docs/architecture.md` | - | Done | — | [#6](https://github.com/davisjw/HoneyJar/pull/6) |
| HJ-018 | P0 | F5a | `docs/install.md`: production mode, secret rules, secret migration | - | Backlog | HJ-003, HJ-006, HJ-007, HJ-012 | - |
| HJ-019 | P0 | F4a + F4c (deployment) | Upgrade note for existing Docker installs and release note for the secret requirement and key migrations | - | Done | HJ-003, HJ-006, HJ-007, HJ-012 | [#13](https://github.com/davisjw/HoneyJar/pull/13) |
| HJ-020 | P0 | F5a | QA: verify all F5a doc corrections against cited code | - | Backlog | HJ-015, HJ-016, HJ-017, HJ-018, HJ-041 | - |
| HJ-050 | P0 | F5b | Docs refresh at end of P0 | - | Backlog | HJ-049, HJ-001, HJ-002, HJ-003, HJ-004, HJ-005, HJ-006, HJ-007, HJ-008, HJ-009, HJ-010, HJ-011, HJ-012, HJ-013, HJ-014, HJ-015, HJ-016, HJ-017, HJ-041, HJ-018, HJ-019, HJ-020 | - |
| HJ-042 | P1 | F2 | Statement-parser adapter interface and registry | Lead Developer | Blocked · on hold | — | [#11](https://github.com/davisjw/HoneyJar/pull/11) |
| HJ-021 | P1 | F2 (shared with F1) | Migration `0025_external_ids.sql`: external id columns + partial unique index | Lead Reviewer | Testing (QA) · on hold | — | [#10](https://github.com/davisjw/HoneyJar/pull/10) |
| HJ-022 | P1 | F2 | OFX/QFX statement-parser adapter: extract FITID into `externalId` | Lead Reviewer | Testing (QA) · on hold | — | [#10](https://github.com/davisjw/HoneyJar/pull/10) |
| HJ-023 | P1 | F2 | QIF statement-parser adapter (`parseQif`) | Lead Developer | Blocked · on hold | — | [#12](https://github.com/davisjw/HoneyJar/pull/12) |
| HJ-024 | P1 | F2 | Types and data mapping for `externalSource` / `externalId` | - | Backlog | HJ-021, HJ-042 | - |
| HJ-025 | P1 | F2 | Registry dispatch in `parseStatement`; accept list and labels from adapters | - | Backlog | HJ-042, HJ-023 | - |
| HJ-026 | P1 | F2 | `txn.import` persists external ids and skips unique-index conflicts | - | Backlog | HJ-021, HJ-024, HJ-042 | - |
| HJ-027 | P1 | F2 | Exact bank-ID dedupe before fuzzy matching in import review | - | Backlog | HJ-021, HJ-022, HJ-024, HJ-042 | - |
| HJ-028 | P1 | F2 | F2 test suite: parser cases, fuzz, integration, UI smoke | - | Backlog | HJ-022, HJ-023, HJ-025, HJ-026, HJ-027, HJ-042 | - |
| HJ-029 | P1 | F2 | QA: review and verify F2 | - | Backlog | HJ-021, HJ-022, HJ-023, HJ-024, HJ-025, HJ-026, HJ-027, HJ-028, HJ-042 | - |
| HJ-048 | P1 | F3a | Storage-agnostic filter spec and `TransactionStore` adapter interface | - | Done | — | [#9](https://github.com/davisjw/HoneyJar/pull/9) |
| HJ-030 | P1 | F3a | Migration: transactions index `(user_id, posted_on desc, id desc)` | - | Done | — | [#9](https://github.com/davisjw/HoneyJar/pull/9) |
| HJ-031 | P1 | F3a | Investigate `packTags` and define the tag filter predicate | - | Done | — | [#9](https://github.com/davisjw/HoneyJar/pull/9) |
| HJ-032 | P1 | F3a | Opaque cursor codec with filter hash | - | Done | — | [#9](https://github.com/davisjw/HoneyJar/pull/9) |
| HJ-033 | P1 | F3a | MCP: JSON Schema `inputSchema` for every existing tool | - | Done | — | [#9](https://github.com/davisjw/HoneyJar/pull/9) |
| HJ-034 | P1 | F3a | SQL `TransactionStore` adapter (Postgres + PGLite): keyset paging and filters | - | Backlog | HJ-030, HJ-031, HJ-032, HJ-048 | - |
| HJ-035 | P1 | F3a | Wire `GET /transactions` and `GET /jars?id=` to paging and filters | - | Backlog | HJ-034, HJ-048 | - |
| HJ-036 | P1 | F3a | MCP: declare new parameters, forward all declared keys, return `nextCursor` | - | Backlog | HJ-033, HJ-035, HJ-048 | - |
| HJ-037 | P1 | F3a | F3a test suite: cursor, integration parity, regression, MCP contract | - | Backlog | HJ-032, HJ-035, HJ-036, HJ-048 | - |
| HJ-038 | P1 | F3a | 100k-row benchmark for `/transactions?limit=200` | - | Backlog | HJ-035 | - |
| HJ-039 | P1 | F3a | Update `docs/api.md` for paging, filters and MCP schemas | - | Backlog | HJ-035, HJ-036 | - |
| HJ-040 | P1 | F3a | QA: review and verify F3a | - | Backlog | HJ-030, HJ-031, HJ-032, HJ-033, HJ-034, HJ-035, HJ-036, HJ-037, HJ-038, HJ-039, HJ-048 | - |
| HJ-043 | P1 | F5b | Write `docs/connectors.md` (F5 FR2) | Lead Reviewer | Testing (QA) · on hold | — | [#8](https://github.com/davisjw/HoneyJar/pull/8) |
| HJ-044 | P1 | F5b | Add the "docs updated in this PR" checklist item (F5 FR3) | Lead Reviewer | Testing (QA) · on hold | — | [#8](https://github.com/davisjw/HoneyJar/pull/8) |
| HJ-045 | P1 | F5b | Doc-drift check script (F5 FR4) | Lead Reviewer | Testing (QA) · on hold | — | [#8](https://github.com/davisjw/HoneyJar/pull/8) |
| HJ-046 | P1 | F5b | Relative-link checker over `docs/*.md` | Lead Reviewer | Testing (QA) · on hold | — | [#8](https://github.com/davisjw/HoneyJar/pull/8) |
| HJ-047 | P1 | F5b | QA: review and verify F5b | Lead Reviewer | Testing (QA) · on hold | HJ-043, HJ-044, HJ-045, HJ-046 | [#8](https://github.com/davisjw/HoneyJar/pull/8) |
| HJ-051 | P1 | F5b | Docs refresh at end of P1 | - | Backlog | HJ-042, HJ-021, HJ-022, HJ-023, HJ-024, HJ-025, HJ-026, HJ-027, HJ-028, HJ-029, HJ-048, HJ-030, HJ-031, HJ-032, HJ-033, HJ-034, HJ-035, HJ-036, HJ-037, HJ-038, HJ-039, HJ-040, HJ-043, HJ-044, HJ-045, HJ-046, HJ-047 | - |
| HJ-052 | P2 | F5b | Docs accuracy nits (architecture.md, api.md) | - | Backlog | — | - |

## Awaiting Jeremy's merge approval

Recorded Nov 20; live PR state was not re-verified on Nov 27.

- [PR #17](https://github.com/davisjw/HoneyJar/pull/17) (HJ-012): QA passed at `4bc8ba98`; dependabot check was queued; merge was queued for Jeremy after #15 (which merged Nov 20, `d3a8feb8`).
- [PR #37](https://github.com/davisjw/HoneyJar/pull/37) (HJ-008): QA passed at `340864f4`, CI green. The Docker AC1 gap was accepted (no Docker available; the production build was verified). Merge queued for Jeremy.

## What's next

- After those merges, mark HJ-012 and HJ-008 Done.
- Then the remaining P0 backlog, in ledger order: HJ-013 (F4c test suite), HJ-014 (F4c QA), HJ-018 (`docs/install.md`), HJ-020 (F5a QA), HJ-050 (P0 docs refresh). Finish P0 before any new P1 work, with about 3 tickets in dev at most.
- P1/F2 work stays on hold: [PR #8](https://github.com/davisjw/HoneyJar/pull/8) (HJ-043–047), [PR #10](https://github.com/davisjw/HoneyJar/pull/10) (HJ-021, HJ-022), [PR #11](https://github.com/davisjw/HoneyJar/pull/11) (HJ-042), [PR #12](https://github.com/davisjw/HoneyJar/pull/12) (HJ-023).
- The phase docs-refresh tickets are HJ-050 (end of P0) and HJ-051 (end of P1).
- P2 nit (non-blocking, logged Nov 20 with HJ-008): assert the non-production warnings in `production-secret.test.ts:387-406`.

## Ticket details

### P0

**HJ-049 — `npm test` fails on main.** `npm test` exits 0 on a clean `main` (scripts 196/196, app 135/135, `household-load` passes). The migration-plan list is derived from `migrations/*.sql`, which covers the `0025` AC. Merged in [#16](https://github.com/davisjw/HoneyJar/pull/16) on Nov 13 (merge `11595302`).

**HJ-001 — `isProductionMode()`.** `HONEYJAR_ENV=production` is the only switch that turns production mode on (any host); unset/`development`/`preview` are false; `NODE_ENV`, Vite mode, and `GROK_PROJECT_ID` alone do not change the result. An unrecognised value throws `HoneyJarEnvError`. Merged in [#7](https://github.com/davisjw/HoneyJar/pull/7) on Nov 13 (main `5ba3440a`).

**HJ-002 — Secret box.** Versioned envelope with HKDF per-purpose keys and rotation (`HONEYJAR_OLD_SECRETS`); purpose separation (`openai-key` vs `files`). Implementation: salt `honeyjar-secret-box-v1`, purpose in HKDF info and AEAD AAD, `kid` is the first 16 hex chars of a SHA-256. Same PR and merge as HJ-001 ([#7](https://github.com/davisjw/HoneyJar/pull/7)).

**HJ-003 — Production secret hard-stop.** In production, a missing, short, or dev-default `BETTER_AUTH_SECRET` fails startup with an actionable error (names the variable, the 32-byte rule, how to generate a value, and `docs/install.md`). Node exits 1; serverless returns 500 and serves no request with a fallback. Development still starts, with a warning. Merged in [#13](https://github.com/davisjw/HoneyJar/pull/13) on Nov 13 (main `5ba3440a`).

**HJ-004 — Not-in-production-mode safety net.** Exact banner text: "This instance is not in production mode. Set HONEYJAR_ENV=production." Owners only, and only when `HONEYJAR_ENV` is unset and the instance looks deployed (local = `localhost`, `*.localhost`, `127.0.0.1`, `::1`, or `0.0.0.0`; unparseable auth URL counts as non-local). Customize shows the mode read-only. Merged in [#14](https://github.com/davisjw/HoneyJar/pull/14) on Nov 20 (`4e134c3f`).

**HJ-005 — HJF1 receipts.** HJF1 layout is magic + kid hint + iv + tag + ciphertext; legacy files try the current secret and then the dev default, never old secrets. A GCM-auth failure returns a typed error and does not crash; export zip still contains decrypted receipts. Same PR and merge as HJ-004 ([#14](https://github.com/davisjw/HoneyJar/pull/14)).

**HJ-006 — `files:rekey`.** Rekeys 100 legacy receipts to HJF1 under a new secret, byte-identical; idempotent, resumable via temp-file + rename, supports `--dry-run`, exits non-zero on failure; logs counts only, no file names. Merged in [#15](https://github.com/davisjw/HoneyJar/pull/15) on Nov 20 (`d3a8feb8`).

**HJ-007 — Compose production default.** `compose.yaml` has no built-in dev secret and defaults `HONEYJAR_ENV` to `production`. `docker compose up` without `BETTER_AUTH_SECRET` hard-stops with the HJ-003 message. Same PR and merge as HJ-003 ([#13](https://github.com/davisjw/HoneyJar/pull/13)).

**HJ-008 — F4a test suite.** F4a file-format, rekey, and production-mode guard matrix; new tests listed in `package.json` `test`. QA passed Nov 20 on [#37](https://github.com/davisjw/HoneyJar/pull/37) at `340864f4`, CI green. Docker AC1 gap accepted: no Docker was available, so AC1 was not verified on the Docker image; the production build was verified. Merge queued for Jeremy. P2 nit: assert the non-production warnings in `production-secret.test.ts:387-406`. The ledger has no `- **PR:**` field for this ticket; #37 is taken from the Status line.

**HJ-009 — F4a QA.** F4a AC1–AC3 and the compose hard-stop / upgrade note, verified via the [#37](https://github.com/davisjw/HoneyJar/pull/37) review on Nov 20. Note: `docker compose up` has not been run (dev VM has no Docker), which is the accepted HJ-008 Docker AC1 gap. No `- **PR:**` field in the ledger.

**HJ-010 — Encrypt OpenAI key on write.** `profile.update` stores a new key only as an `hjs1:` envelope, after trim and a 300-char cap; saving any other profile field leaves the stored envelope byte-identical. Merged in [#15](https://github.com/davisjw/HoneyJar/pull/15) on Nov 20.

**HJ-011 — Decrypt just in time.** The advisor decrypts immediately before the Bearer call; legacy plaintext passes through; decrypt failure shows "Re-enter your OpenAI key in Customize" and sends nothing; the key never appears in logs. Same PR and merge as HJ-010 ([#15](https://github.com/davisjw/HoneyJar/pull/15)).

**HJ-012 — `secrets:migrate`.** Idempotent encryption of legacy `openai_key` values (and re-wrap on rotation); also runs at startup in production mode. After migration, `select openai_key from profiles` shows only `hjs1:` envelopes. QA passed Nov 20 at `4bc8ba98` on [#17](https://github.com/davisjw/HoneyJar/pull/17); merge queued for Jeremy. Live state not re-verified.

**HJ-013 — F4c test suite.** Automated coverage of AC4/AC5, migration, carry-through, rotation, and a mock OpenAI Bearer assertion; tests listed in `package.json` `test`. Backlog; unblocked after HJ-012 merges.

**HJ-014 — F4c QA.** Confirm AC4/AC5 and that the key never appears in logs or client payloads. Depends on HJ-013.

**HJ-015 / HJ-016 / HJ-017 / HJ-041 — F5a doc corrections.** Features, plan amendment (SimpleFIN and the quote feed moved out of "Explicitly not in version 2"), Ollama (server, not browser), and remaining "CSV import" wording in `docs/architecture.md`. Docs-only; merged together in [#6](https://github.com/davisjw/HoneyJar/pull/6) (`a625e70f`).

**HJ-018 — `docs/install.md`.** Document `HONEYJAR_ENV`, the F4a secret rule, and `secrets:migrate`, with Docker and serverless examples. Job-runner variables are deferred to P2. Backlog; depends on HJ-012.

**HJ-019 — Docker upgrade note.** Ships in `docs/upgrade.md` with [#13](https://github.com/davisjw/HoneyJar/pull/13) (merged Nov 13). AC amended (PM authority, Nov 13): ordered steps are (1) set `HONEYJAR_ENV=production` and a real `BETTER_AUTH_SECRET`, (2) back up the `honeyjar-files` volume and the database, (3) run the re-encryption commands from HJ-006 (`files:rekey`, #15) and HJ-012 (`secrets:migrate`, #17). The note states that compose intentionally stops without a secret.

**HJ-020 — F5a QA.** Re-verify every corrected claim against a cited `path:line` (AC1, AC3 without job-runner variables, AC4). Depends on HJ-018 and the already-merged F5a doc tickets.

**HJ-050 — P0 docs refresh.** End-of-phase refresh so every doc touched by P0 matches the merged code (production mode, secret rules, secret box, OpenAI key encryption, rekey/migrate, F5a corrections, `docs/upgrade.md`). Depends on all P0 tickets.

### P1

**HJ-042 — Statement-parser adapter interface.** Registry so a new format is a registered adapter only; CSV is a frozen, built-in, always-last adapter with a catch-all `detect`, no `parser ?? csvStatementParser` fallback, and tests that it is present, last, and can't be removed. `contract.ts` re-export must be test-only. QA failed on [#11](https://github.com/davisjw/HoneyJar/pull/11); back with Lead Developer. Blocked and on hold. Stacked merge order: #11 → #10 → #12.

**HJ-021 — Migration `0025_external_ids.sql`.** Additive `external_source` / `external_id` columns (default `''`) and a partial unique index that ignores blank ids. The `0025` index is not built `CONCURRENTLY` (migrations run in a transaction; PGLite doesn't support it). QA passed on PGLite; Postgres run (`HONEYJAR_TEST_DATABASE_URL`) and the #11 merge are still pending. [#10](https://github.com/davisjw/HoneyJar/pull/10), on hold.

**HJ-022 — OFX/QFX adapter.** Extract FITID into `externalId` (trimmed, capped at 255). OFX with/without FITID and in-file duplicates covered; existing OFX cases still pass. Same PR and hold as HJ-021 ([#10](https://github.com/davisjw/HoneyJar/pull/10)).

**HJ-023 — QIF adapter.** Q9 defaults: per-file date-order detection (M/D when every date is ambiguous; reject a self-contradicting file), `/Class` → tag, `[Account]` → transfer, no category auto-create, splits as one parent row with a warning. QIF is gated out of the paste path until HJ-025. QA failed on [#12](https://github.com/davisjw/HoneyJar/pull/12); back with Lead Developer. Blocked and on hold.

**HJ-024 — External id types.** `Txn` objects from the workspace and the API include `externalSource` / `externalId`; API/MCP cannot write them. Backlog (held for P0).

**HJ-025 — Registry dispatch.** Accept list and labels come from the registry; a non-OFX/non-QIF file still parses as CSV; `.qif` upload reaches review; QIF paste and upload are enabled only together. Pasted QIF already parses via HJ-023; this ticket keeps the file picker and label. Backlog (held for P0).

**HJ-026 — Persist external ids.** `txn.import` persists ids and reports unique-index conflicts as skips; CSV stays `external_id = ''` with fuzzy dedupe only. Backlog (held for P0).

**HJ-027 — Exact bank-ID dedupe.** Same OFX twice → 100% already imported, 0 new rows; overlapping files import only the new rows; empty FITID falls back to fuzzy matching; no `'ofx'` literal in the dedupe path. Backlog (held for P0).

**HJ-028 — F2 test suite.** AC1–AC5, PGLite and Postgres, and at least one fixture per approved QIF default (Q9). Backlog (held for P0).

**HJ-029 — F2 QA.** AC1–AC5, adapter contract, and the approved QIF defaults. Backlog (held for P0).

**HJ-048 — Filter spec / `TransactionStore`.** Storage-agnostic filter spec and adapter interface; HTTP and MCP share the same normalizer (`limit` 1–200, default 50; repeatable `tag` with AND). Merged in [#9](https://github.com/davisjw/HoneyJar/pull/9) on Oct 31 (`fd5f087e`).

**HJ-030 — Keyset index.** Additive transactions index `(user_id, posted_on desc, id desc)` as `0027_txn_keyset.sql` (`0026` stays reserved for F1). Postgres index-test AC met (PG 16.15). Same PR and merge as HJ-048 ([#9](https://github.com/davisjw/HoneyJar/pull/9)).

**HJ-031 — Tag filter predicate.** `packTags` is filtered with a case-insensitive, AND-ed residual predicate, not an index; no `transaction_tags` table. Same PR and merge ([#9](https://github.com/davisjw/HoneyJar/pull/9)).

**HJ-032 — Opaque cursor codec.** Filter hash is SHA-256; a bad cursor returns 400 `cursor_mismatch`; codec has no DB imports. Same PR and merge ([#9](https://github.com/davisjw/HoneyJar/pull/9)).

**HJ-033 — MCP `inputSchema`.** `tools/list` returns a JSON Schema 2020-12 `inputSchema` for every existing tool. Same PR and merge ([#9](https://github.com/davisjw/HoneyJar/pull/9)). Once HJ-033/HJ-036 and HJ-034/HJ-035 land, update the doc-drift test (HJ-045) and `docs/api.md` (HJ-039) in the same change.

**HJ-034 — SQL store adapter.** Keyset paging and filters on Postgres and PGLite; no `loadWorkspace` on `/transactions`; guard the `::jsonb` tags cast against legacy `''` or comma-separated strings; `COLLATE "C"` on the `id` tie-break. Backlog (held for P0).

**HJ-035 — Wire HTTP paging.** 1,234-row fixture with `limit=200` yields 1,234 unique ids across 7 pages; existing `from`/`to`/`limit` callers get the same page-1 results; mismatched cursor → 400. Backlog (held for P0).

**HJ-036 — MCP paging parameters.** `list_transactions` accepts `personId` and `cursor`; undeclared keys are not forwarded. Backlog (held for P0).

**HJ-037 — F3a test suite.** AC1, AC2, AC4, AC8 automated on both databases. Backlog (held for P0).

**HJ-038 — 100k-row benchmark.** p95 < 300 ms with 100k rows on Postgres for `/transactions?limit=200`; script runnable and documented. Backlog (held for P0).

**HJ-039 — `docs/api.md`.** Parameters, responses, rate-limit and CORS notes match the shipped API and MCP schemas. Backlog (held for P0).

**HJ-040 — F3a QA.** AC1–AC4 and AC8; filter layer and cursor codec stay storage-agnostic. Backlog (held for P0).

**HJ-043 — `docs/connectors.md`.** Every outbound integration listed with host, data sent, and how to disable it, including the DuckDuckGo contact lookup; linked from `docs/install.md`. In [#8](https://github.com/davisjw/HoneyJar/pull/8) at `d3e1e6c7` (re-review after a QA failure at `6060d561`). On hold.

**HJ-044 — Docs checklist item.** New PRs show a "docs updated in this PR" item naming `docs/api.md`, `docs/install.md`, and `docs/connectors.md`. Same PR and hold ([#8](https://github.com/davisjw/HoneyJar/pull/8)).

**HJ-045 — Doc-drift check.** Fails in `npm test` when an HTTP METHOD/path pair or MCP tool is added without docs; `POST /transactions` is documented. Same PR and hold ([#8](https://github.com/davisjw/HoneyJar/pull/8)).

**HJ-046 — Relative-link checker.** Fails on a broken relative link in `docs/*.md`; runs in `npm test`. Same PR and hold ([#8](https://github.com/davisjw/HoneyJar/pull/8)).

**HJ-047 — F5b QA.** F5 AC2 (including the negative case), `docs/connectors.md` matches the code, and the link checker passes. Same PR and hold ([#8](https://github.com/davisjw/HoneyJar/pull/8)).

**HJ-051 — P1 docs refresh.** End-of-phase refresh so `docs/features.md`, `docs/api.md`, `docs/install.md`, and `docs/connectors.md` match the merged P1 code; doc-drift and link checks pass. The ledger section has no Note field.

### P2

**HJ-052 — Docs accuracy nits.** Targeted wording fixes in `docs/architecture.md` and `docs/api.md`. Bundled with the P2 job-runner docs pass; P2 is not in the cleared scope.
