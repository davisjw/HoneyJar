import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { packTags, parseTags } from "./calc.ts";
import { matchesAllTags, normalizeTransactionQuery } from "./txn-query.ts";
import { packedTagsSql } from "./txn-tags-sql.ts";

describe("packed tag SQL predicate", () => {
  it("lives outside the query spec and handlers", () => {
    const source = readFileSync(new URL("./txn-tags-sql.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /@\/lib\/db|pglite|from ["']pg["']/);
    const spec = readFileSync(new URL("./txn-query.ts", import.meta.url), "utf8");
    assert.doesNotMatch(spec, /txn-tags-sql|packedTagsSql/);
  });

  it("parameterizes an AND of the plain tag list", () => {
    const result = normalizeTransactionQuery({ tag: ["Trip", "trip", "kids"] });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { sql, params } = packedTagsSql(result.query.tags, { column: "t.tags", paramStart: 3 });
    assert.deepEqual(params, ["kids", "trip"]);
    assert.match(sql, /\$3/);
    assert.match(sql, /\$4/);
    assert.doesNotMatch(sql, /\$5/);
    assert.match(sql, /t\.tags::jsonb/);
    assert.equal(packedTagsSql([]).sql, "true");
    assert.throws(() => packedTagsSql(["a"], { column: "tags; drop table transactions" }));
  });

  it("returns the same rows as the plain-list predicate", async () => {
    const db = new PGlite();
    try {
      await db.exec("create table sample (id text primary key, tags text not null)");
      const rows = [
        ["r1", packTags([" Trip ", "trip", "kids"])],
        ["r2", packTags(["seafood"])],
        ["r3", "[]"],
        ["r4", '["  Trip  "]'],
        ["r5", packTags(["Blue  jar", "Rent"])],
      ] as const;
      for (const [id, tags] of rows) {
        await db.query("insert into sample (id, tags) values ($1, $2)", [id, tags]);
      }
      const queries = [
        [] as string[],
        ["trip"],
        ["trip", "kids"],
        ["KIDS", "TRIP"],
        ["food"],
        ["  trip  "],
        ["blue jar"],
        ["rent", "blue jar"],
        [""],
      ];
      for (const tags of queries) {
        const { sql, params } = packedTagsSql(tags);
        const found = await db.query<{ id: string }>(
          `select id from sample where ${sql} order by id`,
          params,
        );
        const expected = rows
          .filter(([, packed]) => matchesAllTags(parseTags(packed), tags))
          .map(([id]) => id);
        assert.deepEqual(
          found.rows.map((row) => row.id),
          expected,
          JSON.stringify(tags),
        );
      }
    } finally {
      await db.close();
    }
  });
});
