import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "../../..");
const migrationName = "0027_txn_keyset.sql";
const indexName = "transactions_user_posted_id_idx";

async function migrationFiles(): Promise<{ name: string; sql: string }[]> {
  const dir = path.join(root, "migrations");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const files = [];
  for (const name of names) {
    files.push({ name, sql: await readFile(path.join(dir, name), "utf8") });
  }
  return files;
}

function assertKeysetIndex(indexdef: string) {
  assert.match(indexdef, /transactions_user_posted_id_idx/);
  assert.match(indexdef, /user_id/);
  assert.match(indexdef, /posted_on DESC/);
  assert.match(indexdef, /id DESC/);
}

describe("transactions keyset index", () => {
  it("is the next file after 0025 and is a plain btree, not concurrent", async () => {
    const files = await migrationFiles();
    const names = files.map((file) => file.name);
    assert.deepEqual(
      names.filter((name) => name.endsWith("_txn_keyset.sql")),
      [migrationName],
    );
    const sql = files.find((file) => file.name === migrationName)?.sql ?? "";
    const statement = sql.replace(/--.*$/gm, "");
    assert.match(statement, /create index if not exists transactions_user_posted_id_idx/i);
    assert.match(statement, /user_id,\s*posted_on desc,\s*id desc/i);
    assert.doesNotMatch(statement, /concurrently/i);
    const previous = names.filter((name) => name < migrationName);
    assert.ok(previous.includes("0002_honey.sql"));
    assert.ok(previous.includes("0024_streaming_bill_date.sql"));
  });

  it("exists after the migrations run on PGLite", async () => {
    const files = await migrationFiles();
    const db = new PGlite();
    try {
      for (const file of files) await db.exec(file.sql);
      const found = await db.query<{ indexdef: string; indexname: string }>(
        `select indexname, indexdef from pg_indexes
         where tablename = 'transactions' and indexname in ('transactions_user_date_idx', $1)`,
        [indexName],
      );
      const names = found.rows.map((row) => row.indexname).sort();
      assert.deepEqual(names, ["transactions_user_date_idx", indexName]);
      const def = found.rows.find((row) => row.indexname === indexName)?.indexdef ?? "";
      assertKeysetIndex(def);
    } finally {
      await db.close();
    }
  });

  const pgUrl = process.env.HONEYJAR_MIGRATION_DATABASE_URL;
  it(
    "exists after the migrations run on Postgres",
    { skip: pgUrl ? false : "set HONEYJAR_MIGRATION_DATABASE_URL to run the Postgres migration" },
    async () => {
      const files = await migrationFiles();
      const client = new pg.Client({ connectionString: pgUrl });
      await client.connect();
      try {
        await client.query("begin");
        try {
          for (const file of files) await client.query(file.sql);
          const found = await client.query<{ indexdef: string; indexname: string }>(
            `select indexname, indexdef from pg_indexes
             where tablename = 'transactions' and indexname in ('transactions_user_date_idx', $1)`,
            [indexName],
          );
          const names = found.rows.map((row) => row.indexname).sort();
          assert.deepEqual(names, ["transactions_user_date_idx", indexName]);
          const def = found.rows.find((row) => row.indexname === indexName)?.indexdef ?? "";
          assertKeysetIndex(def);
        } finally {
          await client.query("rollback");
        }
      } finally {
        await client.end();
      }
    },
  );
});
