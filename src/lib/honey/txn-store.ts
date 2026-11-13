import { matchesAllTags, type TransactionQuery } from "./txn-query.ts";

/**
 * Store adapter for a transaction page (HJ-048).
 *
 * `page` is the only operation endpoints and MCP need. HJ-034 adds the SQL
 * implementation for Postgres and PGLite. This file does not import a driver.
 * `last` is the keyset edge when another row remains; HJ-035 turns it into a
 * cursor. The store does not mint cursors.
 */

export type TransactionPage<Row> = {
  rows: Row[];
  last: { postedOn: string; id: string } | null;
};

export interface TransactionStore<Row> {
  page(userId: string, query: TransactionQuery): Promise<TransactionPage<Row>>;
}

/** In-memory row the reference adapter understands. Not a table projection. */
export type MemoryTxn = {
  userId: string;
  id: string;
  postedOn: string;
  accountId: string;
  categoryId: string | null;
  personId: string | null;
  tags: readonly string[];
  source: string;
};

function matches(row: MemoryTxn, query: TransactionQuery): boolean {
  if (query.accountId && row.accountId !== query.accountId) return false;
  if (query.categoryId === "uncategorized") {
    if (row.categoryId) return false;
  } else if (query.categoryId && row.categoryId !== query.categoryId) return false;
  if (query.personId === "household") {
    if (row.personId) return false;
  } else if (query.personId && row.personId !== query.personId) return false;
  if (query.source && row.source !== query.source) return false;
  if (query.from && row.postedOn < query.from) return false;
  if (query.to && row.postedOn > query.to) return false;
  return matchesAllTags(row.tags, query.tags);
}

function afterEdge(row: MemoryTxn, query: TransactionQuery): boolean {
  const after = query.after;
  if (!after) return true;
  if (row.postedOn !== after.postedOn) return row.postedOn < after.postedOn;
  return row.id < after.id;
}

/**
 * Reference adapter and parity oracle for the register filters.
 * Rows are already one household's parsed tags (`parseTags` output).
 * The caller passes only that household; `userId` still drops other ids.
 */
export function memoryTransactionStore(rows: readonly MemoryTxn[]): TransactionStore<MemoryTxn> {
  return {
    async page(userId, query) {
      const sorted = rows
        .filter((row) => row.userId === userId && matches(row, query) && afterEdge(row, query))
        .sort((a, b) => {
          if (a.postedOn !== b.postedOn) return a.postedOn < b.postedOn ? 1 : -1;
          if (a.id !== b.id) return a.id < b.id ? 1 : -1;
          return 0;
        });
      const page = sorted.slice(0, query.limit);
      const tail = page[page.length - 1];
      const last =
        tail && sorted.length > query.limit ? { postedOn: tail.postedOn, id: tail.id } : null;
      return { rows: page, last };
    },
  };
}
