import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { exportZip } from "./zip.ts";
import { countExportedTransactions, parseExportFile, planImport } from "./import-book.ts";

describe("household import", () => {
  it("reads an export zip and rewrites ids onto this sign-in", async () => {
    const book = {
      profile: { displayName: "Calder household", filingStatus: "mfj" },
      ledgers: [
        {
          id: "old-home",
          name: "Calder household",
          kind: "personal",
          accounts: [{ id: "acct", name: "Checking", kind: "checking", balanceCents: 100 }],
          transactions: [{ id: "txn", accountId: "acct", postedOn: "2026-01-02", amountCents: -250, merchant: "Market" }],
          documents: [{ id: "doc-1", title: "Receipt", kind: "receipt", fileName: "scan.pdf", body: "" }],
        },
      ],
    };
    const zip = exportZip(book, [{ id: "doc-1", fileName: "scan.pdf", dataBase64: btoa("hello") }]);
    const parsed = parseExportFile(zip);
    assert.equal(countExportedTransactions(parsed.book), 1);
    const planned = planImport(parsed.book, "User 1");
    assert.equal(planned.profile.displayName, "Calder household");
    assert.equal(planned.profile.filingStatus, "mfj");
    assert.equal(planned.idMap.get("old-home"), "p_user1_home");
    const txn = planned.rows.find((row) => row.table === "transactions");
    assert.equal(txn?.values.account_id, planned.idMap.get("acct"));
    assert.equal(txn?.values.user_id, "User 1");
    assert.equal(parsed.files.length, 1);
    assert.equal(parsed.files[0]?.id, "doc-1");
    assert.equal(Buffer.from(parsed.files[0]?.dataBase64 ?? "", "base64").toString(), "hello");

    const pg = new PGlite();
    await pg.waitReady;
    const dir = path.resolve(import.meta.dirname, "../../../migrations");
    const names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of names) await pg.exec(await readFile(path.join(dir, name), "utf8"));
    await pg.query("insert into profiles (user_id) values ($1)", ["User 1"]);
    for (const row of planned.rows) {
      const keys = Object.keys(row.values);
      const cols = keys.join(", ");
      const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
      await pg.query(`insert into ${row.table} (${cols}) values (${ph})`, keys.map((key) => row.values[key]));
    }
    const saved = await pg.query<{ merchant: string; ledger_id: string }>("select merchant, ledger_id from transactions");
    assert.equal(saved.rows[0]?.merchant, "Market");
    assert.equal(saved.rows[0]?.ledger_id, "p_user1_home");
    await pg.close();
  });

  it("refuses a file that is not an export", () => {
    assert.throws(() => parseExportFile(new TextEncoder().encode("nope")), /HoneyJar export/);
    assert.throws(() => planImport({ profile: {} }, "user"), /HoneyJar export/);
  });
});
