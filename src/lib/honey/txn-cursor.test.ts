import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CURSOR_MISMATCH,
  decodeTxnCursor,
  encodeTxnCursor,
  hashCanonicalFilters,
} from "./txn-cursor.ts";
import { canonicalTransactionFilters, normalizeTransactionQuery } from "./txn-query.ts";

function filters(input: Record<string, unknown>): string {
  const result = normalizeTransactionQuery(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a query");
  return canonicalTransactionFilters(result.query);
}

describe("transaction cursor", () => {
  it("imports no database driver and does not own the filter normalizer", () => {
    const source = readFileSync(new URL("./txn-cursor.ts", import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /@\/lib\/db|pglite|data\.server|from ["']pg["']|txn-query|txn-store/,
    );
  });

  it("round-trips a position for the canonical filter string", () => {
    const canonical = filters({ tag: ["Trip", "kids"], from: "2026-01-01", accountId: "acct" });
    const same = filters({ accountId: "acct", from: "2026-01-01", tags: ["kids", "TRIP"] });
    assert.equal(canonical, same);
    const token = encodeTxnCursor({ postedOn: "2026-03-04", id: "txn-1" }, canonical);
    assert.deepEqual(decodeTxnCursor(token, same), {
      ok: true,
      postedOn: "2026-03-04",
      id: "txn-1",
    });
    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    assert.deepEqual(Object.keys(payload).sort(), ["f", "i", "p"]);
    assert.equal(payload.f, hashCanonicalFilters(canonical));
    assert.equal("userId" in payload, false);
  });

  it("rejects a mismatched filter, a tampered hash, and a smuggled user id", () => {
    const canonical = filters({ tag: "rent", limit: 10 });
    const token = encodeTxnCursor({ postedOn: "2026-03-04", id: "txn-1" }, canonical);
    const other = filters({ tag: "food", limit: 10 });
    assert.notEqual(canonical, other);
    assert.deepEqual(decodeTxnCursor(token, other), {
      ok: false,
      status: 400,
      error: CURSOR_MISMATCH,
    });

    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      p: string;
      i: string;
      f: string;
    };
    const flipped = `${payload.f.slice(0, -1)}${payload.f.endsWith("a") ? "b" : "a"}`;
    const tampered = Buffer.from(JSON.stringify({ ...payload, f: flipped }), "utf8").toString(
      "base64url",
    );
    assert.deepEqual(decodeTxnCursor(tampered, canonical), {
      ok: false,
      status: 400,
      error: CURSOR_MISMATCH,
    });
    const smuggled = Buffer.from(
      JSON.stringify({ ...payload, userId: "someone-else" }),
      "utf8",
    ).toString("base64url");
    assert.deepEqual(decodeTxnCursor(smuggled, canonical), {
      ok: false,
      status: 400,
      error: CURSOR_MISMATCH,
    });
    assert.equal(decodeTxnCursor("@@@", canonical).ok, false);
    assert.equal(decodeTxnCursor("", canonical).ok, false);
    assert.equal(CURSOR_MISMATCH, "cursor_mismatch");
  });

  it("feeds the cursor through the same normalizer HTTP and MCP use", () => {
    const canonical = filters({ tag: "rent", from: "2026-01-01" });
    const token = encodeTxnCursor({ postedOn: "2026-04-01", id: "edge" }, canonical);
    const http = new URLSearchParams({
      tag: "Rent",
      from: "2026-01-01",
      limit: "20",
      cursor: token,
    });
    const viaHttp = normalizeTransactionQuery(http);
    const viaMcp = normalizeTransactionQuery({
      tag: "rent",
      from: "2026-01-01",
      limit: 20,
      cursor: token,
    });
    assert.equal(viaHttp.ok, true);
    assert.equal(viaMcp.ok, true);
    if (!viaHttp.ok || !viaMcp.ok) return;
    assert.deepEqual(viaHttp.query.after, { postedOn: "2026-04-01", id: "edge" });
    assert.deepEqual(viaHttp.query, viaMcp.query);
    const mismatch = normalizeTransactionQuery({ tag: "food", cursor: token });
    assert.deepEqual(mismatch, { ok: false, status: 400, error: "cursor_mismatch" });
  });

  it("refuses to mint a cursor with a bad position", () => {
    assert.throws(() => encodeTxnCursor({ postedOn: "2026-02-31", id: "txn-1" }, "{}"));
    assert.throws(() => encodeTxnCursor({ postedOn: "2026-03-04", id: "" }, "{}"));
  });
});
