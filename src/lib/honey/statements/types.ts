/**
 * One imported statement line. Every adapter returns this shape.
 *
 * Money is integer cents (negative means money out). Dates are `YYYY-MM-DD`.
 * `merchant` and `memo` are plain text.
 *
 * Optional fields stay off the object when the format has nothing to say:
 * - `checkNumber` is OFX `CHECKNUM` or QIF `N`.
 * - `externalId` is the bank id (OFX `FITID`), trimmed and at most 255 characters.
 *   QIF has none, so it is `""`.
 * - `warnings` are review notes. QIF splits use `"split detail not imported"`.
 * - `tags` is where a QIF `/Class` lands. The parser does not create categories.
 * - `transferAccount` is the name inside a QIF `[Account]` category. Matching
 *   it to a HoneyJar account happens later; this parser only names it.
 * - `categoryHint` is other QIF `L` text (`Parent:Sub` kept whole). It is not
 *   a category id, and nothing is created from it.
 *
 * `externalSource` is not repeated on the row. It lives on the adapter
 * (`"ofx"` for OFX and QFX, `""` for CSV and QIF).
 */
export type ImportRow = {
  postedOn: string;
  amountCents: number;
  merchant: string;
  memo: string;
  checkNumber?: string;
  externalId?: string;
  warnings?: string[];
  tags?: string[];
  transferAccount?: string;
  categoryHint?: string;
};

/**
 * Options every adapter accepts. Adapters ignore keys they do not use.
 *
 * `dateOrder` forces QIF day/month order. Omit it and the QIF adapter
 * decides once per file, defaulting to month/day when every date is ambiguous.
 * `today` is the ISO date used for the two-digit year pivot and the
 * "more than a year ahead" warning. It defaults to the real current day.
 */
export type StatementParseOptions = {
  dateOrder?: "mdy" | "dmy";
  today?: string;
};

/**
 * A pure statement adapter. No I/O, no network, and `detect` / `parse`
 * must not throw on arbitrary text.
 *
 * Register a new format in `registry.ts`. `parseStatement` dispatches
 * through that list, so the new format does not edit `parseStatement`,
 * `txn.import`, or dedupe. The import modal's accept list and labels
 * are still a separate step (HJ-025).
 */
export interface StatementParser {
  readonly id: string;
  /** Value stored later as `transactions.external_source`. `""` when the format has no bank id. */
  readonly externalSource: string;
  /** File suffixes, including the dot, such as `.ofx`. */
  readonly extensions: readonly string[];
  /** Short name for a file picker. The modal does not read this yet. */
  readonly label: string;
  detect(text: string): boolean;
  parse(text: string, options?: StatementParseOptions): ImportRow[];
}
