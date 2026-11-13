import { createHash } from "node:crypto";

/**
 * Opaque keyset cursor (HJ-032).
 *
 * Payload is base64url JSON `{ p: posted_on, i: id, f: hash }`.
 * `f` is the SHA-256 hex of the canonical filter string from
 * `canonicalTransactionFilters`. This module does not import a store, a
 * driver, or the query normalizer. It carries no user id.
 * `p` and `i` are the caller's own previous page edge. They are not a MAC.
 * The store must still constrain `user_id`. A bad token and a filter mismatch
 * both report `cursor_mismatch`, so clients cannot tell those cases apart.
 */

export const CURSOR_MISMATCH = "cursor_mismatch";

export type TxnCursorPosition = { postedOn: string; id: string };

export type TxnCursorOk = { ok: true; postedOn: string; id: string };

export type TxnCursorReject = {
  ok: false;
  status: 400;
  error: typeof CURSOR_MISMATCH;
};

const TOKEN = /^[A-Za-z0-9_-]+={0,2}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function hashCanonicalFilters(canonicalFilters: string): string {
  return createHash("sha256").update(canonicalFilters, "utf8").digest("hex");
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
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

function validId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 80 && !value.includes("\0")
  );
}

function reject(): TxnCursorReject {
  return { ok: false, status: 400, error: CURSOR_MISMATCH };
}

export function encodeTxnCursor(position: TxnCursorPosition, canonicalFilters: string): string {
  if (!validDate(position.postedOn) || !validId(position.id)) {
    throw new Error("Cursor position must be a real YYYY-MM-DD date and a transaction id.");
  }
  const payload = {
    p: position.postedOn,
    i: position.id,
    f: hashCanonicalFilters(canonicalFilters),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeTxnCursor(
  cursor: string,
  canonicalFilters: string,
): TxnCursorOk | TxnCursorReject {
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 2048) return reject();
  if (!TOKEN.test(cursor)) return reject();
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return reject();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reject();
  const record = parsed as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    !("p" in record) ||
    !("i" in record) ||
    !("f" in record)
  ) {
    return reject();
  }
  if (!validDate(record.p) || !validId(record.i) || typeof record.f !== "string") return reject();
  if (record.f !== hashCanonicalFilters(canonicalFilters)) return reject();
  return { ok: true, postedOn: record.p, id: record.i };
}
