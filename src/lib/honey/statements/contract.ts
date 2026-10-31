import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { ImportRow, StatementParser } from "./types.ts";

function assertRow(row: ImportRow): void {
  assert.equal(typeof row.postedOn, "string");
  assert.match(row.postedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof row.amountCents, "number");
  assert.ok(Number.isInteger(row.amountCents));
  assert.equal(typeof row.merchant, "string");
  assert.equal(typeof row.memo, "string");
  if (row.externalId !== undefined) {
    assert.equal(typeof row.externalId, "string");
    assert.ok(row.externalId.length <= 255);
  }
  if (row.checkNumber !== undefined) assert.equal(typeof row.checkNumber, "string");
  if (row.warnings !== undefined) {
    assert.ok(Array.isArray(row.warnings));
    for (const warning of row.warnings) assert.equal(typeof warning, "string");
  }
  if (row.tags !== undefined) {
    assert.ok(Array.isArray(row.tags));
    for (const tag of row.tags) assert.equal(typeof tag, "string");
  }
  if (row.transferAccount !== undefined) assert.equal(typeof row.transferAccount, "string");
  if (row.categoryHint !== undefined) assert.equal(typeof row.categoryHint, "string");
  assert.equal("categoryId" in row, false);
}

/**
 * Shared contract for every statement adapter.
 * Fixtures must parse, and 1 MB of random bytes must not throw or take 1 second.
 */
export function assertStatementParserContract(parser: StatementParser, samples: string[] = []): void {
  assert.equal(typeof parser.id, "string");
  assert.ok(parser.id.length > 0);
  assert.equal(typeof parser.externalSource, "string");
  assert.ok(parser.extensions.length > 0);
  for (const extension of parser.extensions) {
    assert.equal(extension.startsWith("."), true);
  }
  assert.equal(typeof parser.label, "string");
  assert.ok(parser.label.length > 0);

  for (const sample of ["", "\uFEFF", "not a statement", ...samples]) {
    assert.equal(typeof parser.detect(sample), "boolean");
    const rows = parser.parse(sample);
    assert.ok(Array.isArray(rows));
    for (const row of rows) assertRow(row);
  }

  const junk = randomBytes(1024 * 1024).toString("latin1");
  const started = performance.now();
  assert.equal(typeof parser.detect(junk), "boolean");
  const rows = parser.parse(junk);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1000, `${parser.id} fuzz took ${elapsed.toFixed(0)} ms`);
  assert.ok(Array.isArray(rows));
  for (const row of rows) assertRow(row);
}
