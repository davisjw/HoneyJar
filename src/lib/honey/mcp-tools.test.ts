import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { TOOLS } from "./mcp-tools.ts";

const NAMES = [
  "spending_summary",
  "list_accounts",
  "list_transactions",
  "upcoming_bills",
  "net_worth",
  "portfolio",
  "list_goals",
  "list_alerts",
  "list_people",
  "list_documents",
  "list_utilities",
  "list_jars",
];

describe("MCP inputSchema", () => {
  it("gives every current tool a draft 2020-12 schema and no new filter arguments", () => {
    assert.deepEqual(
      TOOLS.map((tool) => tool.name),
      NAMES,
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    for (const tool of TOOLS) {
      assert.equal(typeof tool.description, "string");
      assert.ok(tool.description.length > 0);
      const validate = ajv.compile(tool.inputSchema);
      assert.equal(validate({}), true, tool.name);
      assert.equal(tool.inputSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
    }

    const transactions = TOOLS.find((tool) => tool.name === "list_transactions");
    const jars = TOOLS.find((tool) => tool.name === "list_jars");
    assert.ok(transactions && jars);
    const txProps = transactions.inputSchema.properties as Record<string, unknown>;
    const jarProps = jars.inputSchema.properties as Record<string, unknown>;
    assert.deepEqual(Object.keys(txProps).sort(), ["from", "limit", "to"]);
    assert.deepEqual(Object.keys(jarProps).sort(), ["from", "id", "limit", "to"]);
    for (const banned of [
      "tag",
      "tags",
      "cursor",
      "personId",
      "accountId",
      "categoryId",
      "source",
    ]) {
      assert.equal(banned in txProps, false);
      assert.equal(banned in jarProps, false);
    }

    const validateTx = ajv.compile(transactions.inputSchema);
    assert.equal(validateTx({ from: "2026-01-01", to: "2026-02-01", limit: 50 }), true);
    assert.equal(validateTx({ limit: 50.5 }), false);
    assert.equal(validateTx({ personId: "ada" }), false);
    assert.equal(validateTx({ cursor: "abc" }), false);

    const validateJars = ajv.compile(jars.inputSchema);
    assert.equal(validateJars({ id: "jar-1", limit: 20 }), true);
    assert.equal(validateJars({ tag: "rent" }), false);

    const accounts = TOOLS.find((tool) => tool.name === "list_accounts");
    assert.ok(accounts);
    const validateAccounts = ajv.compile(accounts.inputSchema);
    assert.equal(validateAccounts({ from: "2026-01-01" }), false);
  });
});
