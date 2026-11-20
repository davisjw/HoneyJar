import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { encodeTxnCursor } from "./txn-cursor.ts";
import {
  canonicalTransactionFilters,
  normalizeTransactionQuery,
  type TransactionQuery,
} from "./txn-query.ts";
import { memoryTransactionStore, type MemoryTxn } from "./txn-store.ts";

function row(patch: Pick<MemoryTxn, "id" | "postedOn"> & Partial<MemoryTxn>): MemoryTxn {
  return {
    userId: "ada",
    accountId: "checking",
    categoryId: "groceries",
    personId: "ada",
    tags: [],
    source: "manual",
    ...patch,
  };
}

function registerKeeps(
  txn: MemoryTxn,
  filters: {
    categoryId?: string;
    personId?: string;
    tag?: string;
    from?: string;
    to?: string;
    accountId?: string;
  },
): boolean {
  const categoryId = filters.categoryId ?? "";
  const who = filters.personId ?? "";
  const tag = filters.tag ?? "";
  if (categoryId === "none" && txn.categoryId) return false;
  if (categoryId && categoryId !== "none" && txn.categoryId !== categoryId) return false;
  if (filters.accountId && txn.accountId !== filters.accountId) return false;
  if (who === "household" && txn.personId) return false;
  if (who && who !== "household" && txn.personId !== who) return false;
  if (tag && !txn.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;
  if (filters.from && txn.postedOn < filters.from) return false;
  if (filters.to && txn.postedOn > filters.to) return false;
  return true;
}

describe("memory transaction store", () => {
  const rows = [
    row({ id: "b", postedOn: "2026-03-02", tags: ["Trip", "kids"] }),
    row({ id: "a", postedOn: "2026-03-02", tags: ["Trip"] }),
    row({ id: "c", postedOn: "2026-03-01", tags: ["kids"], personId: null, categoryId: null }),
    row({ id: "d", postedOn: "2026-02-01", tags: ["Trip", "kids"], source: "import" }),
    row({ id: "e", postedOn: "2026-03-02", tags: ["Trip", "kids"], userId: "bea" }),
  ];
  const store = memoryTransactionStore(rows);

  it("does not import a database driver", () => {
    const source = readFileSync(new URL("./txn-store.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /@\/lib\/db|pglite|data\.server|from ["']pg["']|txn-tags-sql/);
    const api = readFileSync(new URL("./public-api.server.ts", import.meta.url), "utf8");
    assert.doesNotMatch(api, /txn-query|txn-store|txn-tags-sql|txn-cursor/);
  });

  it("returns the same tag rows as the register, with AND and no other user", async () => {
    const result = normalizeTransactionQuery({ tag: ["trip", "kids"], limit: 50 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const page = await store.page("ada", result.query);
    assert.deepEqual(
      page.rows.map((txn) => txn.id),
      ["b", "d"],
    );
    const registerIds = rows
      .filter(
        (txn) =>
          txn.userId === "ada" &&
          registerKeeps(txn, { tag: "trip" }) &&
          registerKeeps(txn, { tag: "kids" }),
      )
      .map((txn) => txn.id);
    assert.deepEqual(page.rows.map((txn) => txn.id).sort(), registerIds.sort());
    assert.equal(page.last, null);
  });

  it("treats uncategorized and household the way the register treats none and household", async () => {
    const uncategorized = normalizeTransactionQuery({ categoryId: "uncategorized", limit: 50 });
    const household = normalizeTransactionQuery({ personId: "household", limit: 50 });
    assert.equal(uncategorized.ok && household.ok, true);
    if (!uncategorized.ok || !household.ok) return;
    const byCategory = await store.page("ada", uncategorized.query);
    const byPerson = await store.page("ada", household.query);
    assert.deepEqual(
      byCategory.rows.map((txn) => txn.id),
      rows
        .filter((txn) => txn.userId === "ada" && registerKeeps(txn, { categoryId: "none" }))
        .map((txn) => txn.id),
    );
    assert.deepEqual(
      byPerson.rows.map((txn) => txn.id),
      rows
        .filter((txn) => txn.userId === "ada" && registerKeeps(txn, { personId: "household" }))
        .map((txn) => txn.id),
    );
  });

  it("pages in posted date then id order without duplicating the cursor edge", async () => {
    const firstQuery = normalizeTransactionQuery({ limit: 2 });
    assert.equal(firstQuery.ok, true);
    if (!firstQuery.ok) return;
    const first = await store.page("ada", firstQuery.query);
    assert.deepEqual(
      first.rows.map((txn) => txn.id),
      ["b", "a"],
    );
    assert.deepEqual(first.last, { postedOn: "2026-03-02", id: "a" });
    const token = encodeTxnCursor(first.last, canonicalTransactionFilters(firstQuery.query));
    const secondQuery = normalizeTransactionQuery({ limit: 2, cursor: token });
    assert.equal(secondQuery.ok, true);
    if (!secondQuery.ok) return;
    const second = await store.page("ada", secondQuery.query);
    assert.deepEqual(
      second.rows.map((txn) => txn.id),
      ["c", "d"],
    );
    assert.equal(second.last, null);
    const seen = new Set([...first.rows, ...second.rows].map((txn) => txn.id));
    assert.equal(seen.size, 4);
    const again = await store.page("ada", {
      ...secondQuery.query,
      limit: 50,
    } satisfies TransactionQuery);
    assert.deepEqual(
      again.rows.map((txn) => txn.id),
      ["c", "d"],
    );
  });
});
