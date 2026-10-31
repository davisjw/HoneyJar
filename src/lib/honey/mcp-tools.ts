/**
 * MCP tool list returned by `tools/list` (and `initialize`).
 *
 * `inputSchema` describes the arguments each tool accepts today (HJ-033).
 * Paging and tag filters are not added here. HJ-036 should extend
 * `list_transactions` and `list_jars` from `transactionQueryWireSchema`
 * in `txn-query.ts` and parse arguments with `normalizeTransactionQuery`.
 */

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

function objectSchema(
  description: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    $schema: DRAFT,
    type: "object",
    additionalProperties: false,
    description,
    properties,
  };
}

const noArgs = objectSchema("This tool takes no arguments.", {});

const dateRange = {
  from: { type: "string", description: "Inclusive start date, YYYY-MM-DD." },
  to: { type: "string", description: "Inclusive end date, YYYY-MM-DD." },
  limit: {
    type: "integer",
    description: "How many rows to return. Defaults to 50. The server caps this at 200.",
  },
};

export const TOOLS: McpTool[] = [
  {
    name: "spending_summary",
    description: "This month's spending by category and net worth.",
    inputSchema: noArgs,
  },
  { name: "list_accounts", description: "Balances for every account.", inputSchema: noArgs },
  {
    name: "list_transactions",
    description: "Recent transactions. Optional from, to, limit.",
    inputSchema: objectSchema("Recent transactions.", dateRange),
  },
  {
    name: "upcoming_bills",
    description: "Bills, subscriptions, and expected income.",
    inputSchema: noArgs,
  },
  { name: "net_worth", description: "Assets, debts, and net worth.", inputSchema: noArgs },
  {
    name: "portfolio",
    description: "Lots, typed prices, Dietz and IRR, and dividend flows. Not a live quote.",
    inputSchema: noArgs,
  },
  { name: "list_goals", description: "Savings goals and progress.", inputSchema: noArgs },
  {
    name: "list_alerts",
    description: "Open watchlist and bill alerts, each with a path inside HoneyJar.",
    inputSchema: noArgs,
  },
  { name: "list_people", description: "People on the household.", inputSchema: noArgs },
  {
    name: "list_documents",
    description: "Document names. Bodies are not included.",
    inputSchema: noArgs,
  },
  { name: "list_utilities", description: "Meters, columns, and readings.", inputSchema: noArgs },
  {
    name: "list_jars",
    description:
      "Personal, business, and property jars. Pass id, from, to, and limit for one jar's transactions.",
    inputSchema: objectSchema("One jar, or every jar when id is omitted.", {
      id: {
        type: "string",
        description: "Jar id. Omit it to list jars without their transactions.",
      },
      ...dateRange,
    }),
  },
];
