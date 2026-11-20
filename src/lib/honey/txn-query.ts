import { decodeTxnCursor } from "./txn-cursor.ts";

/**
 * Storage-agnostic transaction list query (HJ-048).
 *
 * HTTP handlers and MCP `tools/call` both go through `normalizeTransactionQuery`.
 * A `TransactionStore` evaluates the result. This module imports no database
 * driver. `limit` and `after` are paging controls: they are not part of the
 * filter hash. Tags are a plain list with AND semantics.
 *
 * `categoryId: "uncategorized"` means no category (the register's "none").
 * `personId: "household"` means no person. Those words are interpreted by the
 * store, not rewritten here.
 */

export type TransactionKeyset = { postedOn: string; id: string };

export type TransactionQuery = {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  personId?: string;
  /** AND. Already lowercased, sorted, and deduped. Not trimmed. */
  tags: string[];
  source?: string;
  /** Inclusive page size, 1–200. Default 50. */
  limit: number;
  /** Keyset edge from a cursor. Rows at this edge are not repeated. */
  after?: TransactionKeyset;
};

/** Key order of `canonicalTransactionFilters`. */
export const TRANSACTION_FILTER_KEYS = [
  "accountId",
  "categoryId",
  "from",
  "personId",
  "source",
  "tags",
  "to",
] as const;

export type TransactionQueryErrorCode =
  "invalid_limit" | "invalid_date" | "invalid_filter" | "cursor_mismatch";

export type TransactionQueryResult =
  | { ok: true; query: TransactionQuery }
  | { ok: false; status: 400; error: TransactionQueryErrorCode };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_LIMIT = 50;

/**
 * Wire schema for a later MCP `inputSchema` (HJ-036). Tools do not publish it yet.
 * HTTP sends the same names as strings; the normalizer accepts both.
 */
export const transactionQueryWireSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  description:
    "Arguments for a transaction page. Parsed only by normalizeTransactionQuery. Not tied to one store or one tool.",
  properties: {
    from: { type: "string", description: "Inclusive posted date, YYYY-MM-DD." },
    to: { type: "string", description: "Inclusive posted date, YYYY-MM-DD." },
    accountId: { type: "string" },
    categoryId: {
      type: "string",
      description: 'Category id, or "uncategorized" for no category.',
    },
    personId: {
      type: "string",
      description: 'Person id, or "household" for no person.',
    },
    tag: {
      description: "Repeatable. Every tag must match (AND). Case-insensitive; not trimmed.",
      anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    },
    source: { type: "string" },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 200,
      description: "Page size. Defaults to 50. HTTP may send this as a numeric string.",
    },
    cursor: {
      type: "string",
      description: "Opaque keyset cursor from the previous page. Hashed against these filters.",
    },
  },
} as const;

export function isPostedDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Deterministic filter JSON. This is the string the cursor hashes.
 * `limit`, `after`, and `cursor` are omitted. Tag order is sorted.
 */
export function canonicalTransactionFilters(query: TransactionQuery): string {
  const tags = normalizeTagList(query.tags);
  const values: Record<(typeof TRANSACTION_FILTER_KEYS)[number], string | string[] | undefined> = {
    accountId: query.accountId,
    categoryId: query.categoryId,
    from: query.from,
    personId: query.personId,
    source: query.source,
    tags: tags.length ? tags : undefined,
    to: query.to,
  };
  const body: Record<string, string | string[]> = {};
  for (const key of TRANSACTION_FILTER_KEYS) {
    const value = values[key];
    if (value == null || (Array.isArray(value) && value.length === 0)) continue;
    body[key] = value;
  }
  return JSON.stringify(body);
}

/** Register tag check, AND-ed. An empty tag is not a constraint. The query is not trimmed. */
export function matchesAllTags(
  storedTags: readonly string[],
  required: readonly string[],
): boolean {
  for (const tag of required) {
    if (!tag) continue;
    const want = tag.toLowerCase();
    if (!storedTags.some((stored) => stored.toLowerCase() === want)) return false;
  }
  return true;
}

function fail(error: TransactionQueryErrorCode): TransactionQueryResult {
  return { ok: false, status: 400, error };
}

function normalizeTagList(value: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of value) {
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

function readTags(value: unknown): string[] | "invalid" {
  if (value == null) return [];
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
  if (!list) return "invalid";
  const raw: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") return "invalid";
    raw.push(item);
  }
  return normalizeTagList(raw);
}

function parseScalar(value: unknown): string | undefined | "invalid" {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseDate(value: unknown): string | undefined | "invalid" {
  const scalar = parseScalar(value);
  if (scalar === "invalid" || scalar === undefined) return scalar;
  return isPostedDate(scalar) ? scalar : "invalid";
}

function parseLimit(value: unknown): number | "invalid" {
  if (value == null || value === "") return DEFAULT_LIMIT;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 200) return "invalid";
    return value;
  }
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return "invalid";
  const parsed = Number(value.trim());
  if (parsed < 1 || parsed > 200) return "invalid";
  return parsed;
}

type RawQuery = {
  from: unknown;
  to: unknown;
  accountId: unknown;
  categoryId: unknown;
  personId: unknown;
  source: unknown;
  limit: unknown;
  cursor: unknown;
  tags: unknown;
};

function readRaw(input: URLSearchParams | Record<string, unknown>): RawQuery | "invalid" {
  if (input instanceof URLSearchParams) {
    const tag = input.getAll("tag");
    return {
      from: input.get("from"),
      to: input.get("to"),
      accountId: input.get("accountId"),
      categoryId: input.get("categoryId"),
      personId: input.get("personId"),
      source: input.get("source"),
      limit: input.get("limit"),
      cursor: input.get("cursor"),
      tags: tag.length ? tag : input.getAll("tags"),
    };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return "invalid";
  return {
    from: input.from,
    to: input.to,
    accountId: input.accountId,
    categoryId: input.categoryId,
    personId: input.personId,
    source: input.source,
    limit: input.limit,
    cursor: input.cursor,
    tags: input.tag ?? input.tags,
  };
}

/**
 * One normalizer for HTTP query params and MCP arguments.
 * A `cursor` is checked against the canonical filters and becomes `after`.
 */
export function normalizeTransactionQuery(
  input: URLSearchParams | Record<string, unknown>,
): TransactionQueryResult {
  const raw = readRaw(input);
  if (raw === "invalid") return fail("invalid_filter");

  const from = parseDate(raw.from);
  if (from === "invalid") return fail("invalid_date");
  const to = parseDate(raw.to);
  if (to === "invalid") return fail("invalid_date");
  const accountId = parseScalar(raw.accountId);
  if (accountId === "invalid") return fail("invalid_filter");
  const categoryId = parseScalar(raw.categoryId);
  if (categoryId === "invalid") return fail("invalid_filter");
  const personId = parseScalar(raw.personId);
  if (personId === "invalid") return fail("invalid_filter");
  const source = parseScalar(raw.source);
  if (source === "invalid") return fail("invalid_filter");
  const tags = readTags(raw.tags);
  if (tags === "invalid") return fail("invalid_filter");
  const limit = parseLimit(raw.limit);
  if (limit === "invalid") return fail("invalid_limit");

  const query: TransactionQuery = { tags, limit };
  if (from) query.from = from;
  if (to) query.to = to;
  if (accountId) query.accountId = accountId;
  if (categoryId) query.categoryId = categoryId;
  if (personId) query.personId = personId;
  if (source) query.source = source;

  if (raw.cursor == null || raw.cursor === "") return { ok: true, query };
  if (typeof raw.cursor !== "string") return fail("cursor_mismatch");
  const decoded = decodeTxnCursor(raw.cursor, canonicalTransactionFilters(query));
  if (!decoded.ok) return fail("cursor_mismatch");
  query.after = { postedOn: decoded.postedOn, id: decoded.id };
  return { ok: true, query };
}
