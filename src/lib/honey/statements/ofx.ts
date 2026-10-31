import { dollarsToCents } from "../calc.ts";
import type { ImportRow, StatementParser } from "./types.ts";

function ofxDate(raw: string): string | null {
  const digits = raw.trim().slice(0, 8);
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function ofxValue(block: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return (match?.[1] ?? "").trim();
}

/** Bank and credit-card transactions from an OFX or QFX file. */
export function parseOfxStatement(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const match of text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
    const block = match[1] ?? "";
    const postedOn = ofxDate(ofxValue(block, "DTPOSTED"));
    const amountRaw = ofxValue(block, "TRNAMT");
    if (!postedOn || !amountRaw) continue;
    const name = ofxValue(block, "NAME") || ofxValue(block, "PAYEE");
    const memoText = ofxValue(block, "MEMO");
    const check = ofxValue(block, "CHECKNUM");
    const row: ImportRow = {
      postedOn,
      amountCents: dollarsToCents(amountRaw),
      merchant: name || memoText || "Imported",
      memo: name ? memoText : check ? `Check ${check}` : "",
    };
    if (check) row.checkNumber = check;
    rows.push(row);
  }
  return rows;
}

/**
 * OFX and QFX share this adapter. A QFX file is the same `<OFX>` body,
 * usually with an `OFXHEADER` line, so a second parser would only duplicate it.
 */
export const ofxStatementParser: StatementParser = {
  id: "ofx",
  externalSource: "ofx",
  extensions: [".ofx", ".qfx"],
  label: "OFX/QFX",
  detect(text) {
    const head = text.slice(0, 800).toUpperCase();
    return head.includes("<OFX") || head.includes("OFXHEADER");
  },
  parse(text) {
    return parseOfxStatement(text);
  },
};
