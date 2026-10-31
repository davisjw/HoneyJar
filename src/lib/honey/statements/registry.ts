import { csvStatementParser } from "./csv.ts";
import { ofxStatementParser } from "./ofx.ts";
import { qifStatementParser } from "./qif.ts";
import type { ImportRow, StatementParseOptions, StatementParser } from "./types.ts";

/**
 * Adapters tried in order. The first `detect` hit wins. CSV is not in
 * this list: it is the fallback below, used when every detector declines.
 * QIF is first because a leading `!Type:` is more specific than an OFX header.
 */
const detected: StatementParser[] = [qifStatementParser, ofxStatementParser];

export function statementParsers(): readonly StatementParser[] {
  return [...detected, csvStatementParser];
}

/** The first detecting adapter, or null when the text will fall through to CSV. */
export function detectStatementParser(text: string): StatementParser | null {
  for (const parser of detected) {
    if (parser.detect(text)) return parser;
  }
  return null;
}

/**
 * Parse with the registry. This is what `parseStatement` calls, so adding
 * a format means registering an adapter and not editing that function.
 */
export function parseRegisteredStatement(
  text: string,
  options?: StatementParseOptions,
): ImportRow[] {
  const parser = detectStatementParser(text);
  return (parser ?? csvStatementParser).parse(text, options);
}
