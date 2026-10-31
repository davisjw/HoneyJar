import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

const TARGET = "0025_external_ids.sql";

async function loadMigrations() {
  const dir = join(projectRoot(), "migrations");
  const names = await readdir(dir);
  const plan = pendingMigrations(names, []);
  const files = [];
  for (const item of plan) {
    files.push({ name: item.name, sql: await readFile(join(dir, item.name), "utf8") });
  }
  return files;
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>, applyFile: (sql: string) => Promise<void>, close: () => Promise<void> }} db
 * @param {{ name: string, sql: string }[]} files
 */
async function assertExternalIds(db, files) {
  const target = files.find((file) => file.name === TARGET);
  assert.ok(target, `${TARGET} is in migrations/`);
  assert.equal(
    /create\s+index\s+concurrently/i.test(target.sql),
    false,
    "the migration runner wraps each file in a transaction, so CONCURRENTLY is not usable",
  );

  await db.query("drop schema if exists public cascade");
  await db.query("create schema public");
  await db.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );

  for (const file of files) {
    if (file.name === TARGET) continue;
    await db.applyFile(file.sql);
  }

  await db.query(
    "insert into transactions (id, user_id, account_id, posted_on, amount_cents) values ('before', 'user-a', 'acct-1', '2026-10-01', -1240)",
  );

  await db.applyFile(target.sql);
  await db.applyFile(target.sql);

  const existing = await db.query(
    "select external_source, external_id from transactions where id = 'before'",
  );
  assert.deepEqual(existing.rows, [{ external_source: "", external_id: "" }]);

  const columns = await db.query(
    `select column_name, is_nullable, data_type, column_default
     from information_schema.columns
     where table_name = 'transactions' and column_name in ('external_source', 'external_id')
     order by column_name`,
  );
  assert.deepEqual(
    columns.rows.map((row) => ({
      column_name: row.column_name,
      is_nullable: row.is_nullable,
      data_type: row.data_type,
      hasEmptyDefault: String(row.column_default ?? "").includes("''"),
    })),
    [
      { column_name: "external_id", is_nullable: "NO", data_type: "text", hasEmptyDefault: true },
      {
        column_name: "external_source",
        is_nullable: "NO",
        data_type: "text",
        hasEmptyDefault: true,
      },
    ],
  );

  const index = await db.query(
    "select indexdef from pg_indexes where indexname = 'transactions_external_id_idx'",
  );
  const indexdef = String(index.rows[0]?.indexdef ?? "");
  assert.match(indexdef, /UNIQUE/i);
  assert.match(indexdef, /external_id <>/);

  await db.query(
    `insert into transactions (id, user_id, account_id, posted_on, amount_cents, external_source, external_id)
     values
       ('empty-a', 'user-a', 'acct-1', '2026-10-02', -1, '', ''),
       ('empty-b', 'user-a', 'acct-1', '2026-10-03', -1, 'ofx', ''),
       ('fit-a', 'user-a', 'acct-1', '2026-10-04', -1, 'ofx', 'fit-1')`,
  );
  await db.query(
    `insert into transactions (id, user_id, account_id, posted_on, amount_cents, external_source, external_id)
     values ('other-acct', 'user-a', 'acct-2', '2026-10-04', -1, 'ofx', 'fit-1')`,
  );
  await db.query(
    `insert into transactions (id, user_id, account_id, posted_on, amount_cents, external_source, external_id)
     values ('other-user', 'user-b', 'acct-1', '2026-10-04', -1, 'ofx', 'fit-1')`,
  );
  await db.query(
    `insert into transactions (id, user_id, account_id, posted_on, amount_cents, external_source, external_id)
     values ('other-source', 'user-a', 'acct-1', '2026-10-04', -1, 'simplefin', 'fit-1')`,
  );

  await rejectsUnique(() =>
    db.query(
      `insert into transactions (id, user_id, account_id, posted_on, amount_cents, external_source, external_id)
       values ('dup', 'user-a', 'acct-1', '2026-10-05', -1, 'ofx', 'fit-1')`,
    ),
  );
}

/** @param {() => Promise<unknown>} run */
async function rejectsUnique(run) {
  try {
    await run();
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    assert.equal(code, "23505", err instanceof Error ? err.message : String(err));
    return;
  }
  assert.fail("duplicate external id was inserted");
}

test("0025_external_ids applies on PGLite and ignores empty external ids", async () => {
  const files = await loadMigrations();
  const db = new PGlite();
  await db.waitReady;
  try {
    await assertExternalIds(
      {
        query: (sql, params) => db.query(sql, params),
        applyFile: (sql) => db.transaction(async (tx) => tx.exec(sql)).then(() => undefined),
        close: () => db.close(),
      },
      files,
    );
  } finally {
    await db.close();
  }
});

test("0025_external_ids applies on Postgres and ignores empty external ids", async (t) => {
  const databaseUrl = process.env.HONEYJAR_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip("set HONEYJAR_TEST_DATABASE_URL to a disposable Postgres database");
    return;
  }
  const files = await loadMigrations();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await assertExternalIds(
      {
        query: async (sql, params) => {
          const result = await client.query(sql, params);
          return { rows: result.rows };
        },
        applyFile: async (sql) => {
          await client.query("BEGIN");
          try {
            await client.query(sql);
            await client.query("COMMIT");
          } catch (err) {
            try {
              await client.query("ROLLBACK");
            } catch {
              // keep the original error
            }
            throw err;
          }
        },
        close: () => client.end(),
      },
      files,
    );
  } finally {
    await client.end();
  }
});
