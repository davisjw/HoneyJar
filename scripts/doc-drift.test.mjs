import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Paths inside `endpoints: [ ... ]` in public-api.server.ts. */
export function endpointPathsFromSource(source) {
  const match = source.match(/endpoints:\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error("endpoints array not found in public-api.server.ts");
  return [...match[1].matchAll(/"(\/[^"]+)"/g)].map((item) => item[1]);
}

/** Tool `name` fields inside `const TOOLS`. */
export function toolNamesFromSource(source) {
  const match = source.match(/const TOOLS = \[([\s\S]*?)\];/);
  if (!match) throw new Error("TOOLS array not found in public-api.server.ts");
  return [...match[1].matchAll(/\{\s*name:\s*"([a-z0-9_]+)"/g)].map((item) => item[1]);
}

/** `request.method === "GET" && path === "/summary"` handlers. OPTIONS and `GET /` are not this shape. */
export function handlerPairsFromSource(source) {
  return [
    ...source.matchAll(/request\.method === "(GET|POST|PUT|PATCH|DELETE)" && path === "(\/[^"]+)"/g),
  ].map((item) => `${item[1]} ${item[2]}`);
}

/**
 * `METHOD /path` rows in the JSON API table. The method is kept. Query strings are dropped.
 * `GET /` in the prose is not a table row and is not part of `endpoints`.
 */
export function routeRowsFromDocs(markdown) {
  const mcp = markdown.search(/^## MCP\s*$/m);
  const body = mcp === -1 ? markdown : markdown.slice(0, mcp);
  const start = body.search(/^## JSON API\s*$/m);
  if (start === -1) throw new Error("docs/api.md is missing ## JSON API");
  const rows = [];
  for (const line of body.slice(start).split("\n")) {
    if (!line.startsWith("|")) continue;
    const cell = line.match(/`(GET|POST|PUT|PATCH|DELETE)\s+(\/[^`?\s]+)/);
    if (cell) rows.push(`${cell[1]} ${cell[2]}`);
  }
  return [...new Set(rows)];
}

export function endpointPathsFromDocs(markdown) {
  return [...new Set(routeRowsFromDocs(markdown).map((row) => row.slice(row.indexOf(" ") + 1)))];
}

/** First-column tool names in the MCP table. */
export function toolNamesFromDocs(markdown) {
  const parts = markdown.split(/^## MCP\s*$/m);
  if (parts.length < 2) throw new Error("docs/api.md is missing ## MCP");
  const names = [];
  for (const line of parts[1].split("\n")) {
    if (!line.startsWith("|")) continue;
    const cell = line.match(/^\|\s*`([a-z0-9_]+)`\s*\|/);
    if (cell) names.push(cell[1]);
  }
  return names;
}

function missing(label, code, docs) {
  const documented = new Set(docs);
  const implemented = new Set(code);
  const errors = [];
  const absent = code.filter((item) => !documented.has(item));
  const extra = docs.filter((item) => !implemented.has(item));
  if (absent.length) errors.push(`${label} in code but not in docs/api.md: ${absent.join(", ")}`);
  if (extra.length) errors.push(`${label} in docs/api.md but not in code: ${extra.join(", ")}`);
  return errors;
}

export function driftErrors(apiSource, docs) {
  return [
    ...missing("endpoint", endpointPathsFromSource(apiSource), endpointPathsFromDocs(docs)),
    ...missing("route", handlerPairsFromSource(apiSource), routeRowsFromDocs(docs)),
    ...missing("MCP tool", toolNamesFromSource(apiSource), toolNamesFromDocs(docs)),
  ];
}

test("docs/api.md matches endpoints and MCP tool names", () => {
  const apiSource = readFileSync(join(root, "src/lib/honey/public-api.server.ts"), "utf8");
  const docs = readFileSync(join(root, "docs/api.md"), "utf8");
  const errors = driftErrors(apiSource, docs);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("an endpoint added in code without a docs row fails", () => {
  const apiSource = `endpoints: ["/summary", "/not-documented"]`;
  const docs = "## JSON API\n\n| `GET /summary` | Ok. |\n\n## MCP\n\n| `list_accounts` | x |\n";
  const source = `${apiSource}\nconst TOOLS = [{ name: "list_accounts", description: "x" }];`;
  const errors = driftErrors(source, docs);
  assert.ok(errors.some((line) => line.includes("/not-documented")));
});

test("an undocumented POST fails", () => {
  const source = [
    'endpoints: ["/summary"]',
    'if (request.method === "GET" && path === "/summary") {}',
    'if (request.method === "POST" && path === "/summary") {}',
    'const TOOLS = [{ name: "list_accounts", description: "x" }];',
  ].join("\n");
  const docs = "## JSON API\n\n| `GET /summary` | Ok. |\n\n## MCP\n\n| `list_accounts` | x |\n";
  const errors = driftErrors(source, docs);
  assert.ok(errors.some((line) => line.includes("POST /summary")));
  assert.equal(errors.some((line) => line.startsWith("endpoint ")), false);
});

test("an MCP tool added in code without a docs row fails", () => {
  const source = `endpoints: ["/summary"]\nconst TOOLS = [{ name: "list_accounts", description: "x" }, { name: "new_tool", description: "y" }];`;
  const docs = "## JSON API\n\n| `GET /summary` | Ok. |\n\n## MCP\n\n| `list_accounts` | x |\n";
  const errors = driftErrors(source, docs);
  assert.ok(errors.some((line) => line.includes("new_tool")));
});

test("a docs row with no matching code fails", () => {
  const source = `endpoints: ["/summary"]\nconst TOOLS = [{ name: "list_accounts", description: "x" }];`;
  const docs = "## JSON API\n\n| `GET /summary` | Ok. |\n| `GET /retired` | Gone. |\n\n## MCP\n\n| `list_accounts` | x |\n| `old_tool` | x |\n";
  const errors = driftErrors(source, docs);
  assert.ok(errors.some((line) => line.includes("/retired")));
  assert.ok(errors.some((line) => line.includes("old_tool")));
});
