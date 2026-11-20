import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

/**
 * Loads the real household reader against a fresh database.
 *
 * A new household starts blank (`seedBlank`). The Calder sample is loaded
 * only from Customize, which calls `seedHousehold`. The timed read is the
 * page load after that sample is in place, and it should not keep writing.
 */

const root = path.resolve(import.meta.dirname, "..");
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

const pg = new PGlite({
  parsers: {
    20: (value) => Number(value),
    1082: (value) => value,
    1186: (value) => value,
  },
});
await pg.waitReady;
const names = (await readdir(path.join(root, "migrations"))).filter((name) => name.endsWith(".sql")).sort();
for (const name of names) {
  await pg.exec(await readFile(path.join(root, "migrations", name), "utf8"));
}

let queries = 0;
let writes = 0;
async function run(text, params = []) {
  queries += 1;
  if (/^\s*(insert|update|delete)\b/i.test(text)) writes += 1;
  const result = await pg.query(text, params);
  return result.rows;
}

function countedSql() {
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, params) => run(text, params ?? []);
  return sql;
}

const { readWorkspace } = await vite.ssrLoadModule("/src/lib/honey/data.server.ts");
const { seedHousehold } = await vite.ssrLoadModule("/src/lib/honey/seed.ts");
const sql = countedSql();
const userId = "load_perf_user";

const blank = await readWorkspace(sql, userId);
const blankJar = blank.ledgers.find((ledger) => ledger.kind === "personal");
assert.ok(blankJar, "a new household has a personal jar");
assert.equal(blankJar.transactions.length, 0, "a new household does not start on the sample");

const seededAt = performance.now();
await seedHousehold(sql, userId);
const seedMs = performance.now() - seededAt;

// The next read finishes one-time sample backfills (business, property, utilities).
// The read after that is what every later page pays.
await readWorkspace(sql, userId);

queries = 0;
writes = 0;
const loadedAt = performance.now();
const workspace = await readWorkspace(sql, userId);
const loadMs = performance.now() - loadedAt;

const personal = workspace.ledgers.find((ledger) => ledger.kind === "personal");
assert.ok(personal, "sample household has a personal jar");
assert.ok(personal.transactions.length > 20, "spending screen has transactions");
assert.ok(personal.bills.length >= 4, "bills screen has the sample bills");
assert.ok(personal.meters.length >= 4, "utilities screen has the sample meters");
assert.ok(personal.readings.length > 40, "utilities screen has a year of reads");

assert.ok(loadMs < 1000, `second household load took ${loadMs.toFixed(0)}ms`);
assert.ok(queries < 110, `second household load ran ${queries} queries`);
assert.ok(writes < 6, `second household load wrote ${writes} times`);

console.log(
  `household load: seed ${seedMs.toFixed(0)}ms, second load ${loadMs.toFixed(0)}ms, ${queries} queries, ${writes} writes`,
);

process.exit(0);
