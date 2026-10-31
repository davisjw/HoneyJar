import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDocLinks, extractLinks } from "./doc-links.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("every relative link in docs/*.md resolves", () => {
  const errors = checkDocLinks(root);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("a relative link to a missing file fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "doc-links-"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/note.md"), "See [gone](missing.md) and [web](https://example.com) and [here](#top).\n");
  const errors = checkDocLinks(dir);
  assert.deepEqual(errors, ["docs/note.md: missing.md"]);
});

test("a relative link to a file that exists passes, including outside docs", () => {
  const dir = mkdtempSync(join(tmpdir(), "doc-links-"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "LICENSE"), "apache\n");
  writeFileSync(join(dir, "docs/note.md"), "See [license](../LICENSE) and [self](note.md#section).\n");
  assert.deepEqual(checkDocLinks(dir), []);
});

test("fenced examples are not treated as links", () => {
  const links = extractLinks("Real [page](install.md).\n\n```\nSee [nope](missing.md)\n```\n");
  assert.deepEqual(links, ["install.md"]);
});
