import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { hasTag } from "./calc.ts";
import {
  canonicalTransactionFilters,
  matchesAllTags,
  normalizeTransactionQuery,
  transactionQueryWireSchema,
  type TransactionQuery,
} from "./txn-query.ts";

function queryOf(result: ReturnType<typeof normalizeTransactionQuery>): TransactionQuery {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a query");
  return result.query;
}

describe("transaction query spec", () => {
  it("imports no database driver", () => {
    const source = readFileSync(new URL("./txn-query.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /@\/lib\/db|pglite|data\.server|from ["']pg["']/);
  });

  it("uses one normalizer for HTTP params and MCP arguments", () => {
    const http = new URLSearchParams();
    http.append("tag", "Trip");
    http.append("tag", "kids");
    http.set("from", " 2026-01-01 ");
    http.set("limit", "25");
    http.set("categoryId", "uncategorized");
    http.set("personId", "household");
    const mcp = {
      tag: ["kids", "TRIP", "trip"],
      from: "2026-01-01",
      limit: 25,
      categoryId: "uncategorized",
      personId: "household",
    };
    const fromHttp = queryOf(normalizeTransactionQuery(http));
    const fromMcp = queryOf(normalizeTransactionQuery(mcp));
    assert.deepEqual(fromHttp, fromMcp);
    assert.deepEqual(fromHttp.tags, ["kids", "trip"]);
    assert.equal(fromHttp.limit, 25);
    assert.equal(canonicalTransactionFilters(fromHttp), canonicalTransactionFilters(fromMcp));
    assert.equal(
      canonicalTransactionFilters(fromHttp),
      '{"categoryId":"uncategorized","from":"2026-01-01","personId":"household","tags":["kids","trip"]}',
    );
  });

  it("defaults limit to 50 and rejects values outside 1–200", () => {
    assert.equal(queryOf(normalizeTransactionQuery({})).limit, 50);
    assert.equal(queryOf(normalizeTransactionQuery(new URLSearchParams())).limit, 50);
    assert.equal(queryOf(normalizeTransactionQuery({ limit: "200" })).limit, 200);
    for (const limit of [0, 201, -1, 1.5, "50.5", "abc", true]) {
      const result = normalizeTransactionQuery({ limit });
      assert.deepEqual(result, { ok: false, status: 400, error: "invalid_limit" }, String(limit));
    }
  });

  it("keeps limit and cursor position out of the filter hash", () => {
    const small = queryOf(normalizeTransactionQuery({ tag: "rent", limit: 10 }));
    const large = queryOf(normalizeTransactionQuery({ tag: "Rent", limit: 200 }));
    assert.equal(canonicalTransactionFilters(small), canonicalTransactionFilters(large));
    const withAfter: TransactionQuery = {
      ...small,
      after: { postedOn: "2026-02-01", id: "abc" },
    };
    assert.equal(canonicalTransactionFilters(withAfter), canonicalTransactionFilters(small));
    assert.notEqual(
      canonicalTransactionFilters(queryOf(normalizeTransactionQuery({ categoryId: "none" }))),
      canonicalTransactionFilters(
        queryOf(normalizeTransactionQuery({ categoryId: "uncategorized" })),
      ),
    );
  });

  it("rejects a bad date and a non-string filter the same way for HTTP and MCP", () => {
    assert.deepEqual(normalizeTransactionQuery({ from: "2026-02-31" }), {
      ok: false,
      status: 400,
      error: "invalid_date",
    });
    const params = new URLSearchParams({ to: "yesterday" });
    assert.deepEqual(normalizeTransactionQuery(params), {
      ok: false,
      status: 400,
      error: "invalid_date",
    });
    assert.deepEqual(normalizeTransactionQuery({ accountId: 12 }), {
      ok: false,
      status: 400,
      error: "invalid_filter",
    });
    assert.deepEqual(normalizeTransactionQuery({ tag: ["rent", 1] }), {
      ok: false,
      status: 400,
      error: "invalid_filter",
    });
  });

  it("matches the register tag check and does not trim the query", () => {
    const stored = ["Trip", "kids"];
    for (const required of [
      ["trip"],
      ["KIDS"],
      ["trip", "kids"],
      ["food"],
      ["  trip  "],
      [""],
      [],
    ]) {
      const register = required.every((tag) => {
        if (tag && !stored.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;
        return true;
      });
      assert.equal(matchesAllTags(stored, required), register, JSON.stringify(required));
    }
    assert.equal(hasTag(["Trip"], "  trip  "), true);
    assert.equal(matchesAllTags(["Trip"], ["  trip  "]), false);
    assert.equal(matchesAllTags(["seafood"], ["food"]), false);
  });

  it("publishes a draft 2020-12 wire schema that is not a store", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(transactionQueryWireSchema);
    assert.equal(validate({ tag: ["rent"], limit: 50, cursor: "abc" }), true);
    assert.equal(validate({ tag: "rent" }), true);
    assert.equal(validate({ tags: ["rent"] }), false);
    assert.equal(validate({ limit: 0 }), false);
    assert.equal(validate({ after: { postedOn: "2026-01-01", id: "a" } }), false);
  });
});
