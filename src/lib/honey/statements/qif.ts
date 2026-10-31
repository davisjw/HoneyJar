import { dollarsToCents } from "../calc.ts";
import type { ImportRow, StatementParseOptions, StatementParser } from "./types.ts";

const SUPPORTED = new Set(["bank", "ccard", "cash", "oth a", "oth l"]);

type RawDate = { a: number; b: number; yearText: string; apostrophe: boolean };

type Rec = {
  date: RawDate | null;
  amountT: string | null;
  amountU: string | null;
  payee: string;
  memo: string;
  check: string;
  category: string;
  split: boolean;
  splitNames: string[];
};

function emptyRec(): Rec {
  return {
    date: null,
    amountT: null,
    amountU: null,
    payee: "",
    memo: "",
    check: "",
    category: "",
    split: false,
    splitNames: [],
  };
}

function linesOf(text: string): string[] {
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const code = src.charCodeAt(i);
    if (code !== 10 && code !== 13) continue;
    lines.push(src.slice(start, i));
    if (code === 13 && src.charCodeAt(i + 1) === 10) i += 1;
    start = i + 1;
  }
  if (start < src.length) lines.push(src.slice(start));
  return lines;
}

function typeName(line: string): string | null {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed.startsWith("!type:")) return null;
  return trimmed.slice(6).trim().replace(/\s+/g, " ");
}

function readDate(raw: string): RawDate | null {
  let i = 0;
  const skipSpace = () => {
    while (i < raw.length && (raw[i] === " " || raw[i] === "\t")) i += 1;
  };
  const readDigits = (): string | null => {
    skipSpace();
    const start = i;
    while (i < raw.length && raw[i]! >= "0" && raw[i]! <= "9") i += 1;
    if (i === start || i - start > 4) return null;
    return raw.slice(start, i);
  };
  const first = readDigits();
  if (!first) return null;
  skipSpace();
  const sep1 = raw[i];
  if (sep1 !== "/" && sep1 !== "-" && sep1 !== "." && sep1 !== "'") return null;
  i += 1;
  const second = readDigits();
  if (!second) return null;
  skipSpace();
  const sep2 = raw[i];
  if (sep2 !== "/" && sep2 !== "-" && sep2 !== "." && sep2 !== "'") return null;
  const apostrophe = sep2 === "'";
  i += 1;
  const yearText = readDigits();
  if (!yearText) return null;
  skipSpace();
  if (i !== raw.length) return null;
  return { a: Number(first), b: Number(second), yearText, apostrophe };
}

function todayIso(options?: StatementParseOptions): string {
  const given = options?.today?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
  return new Date().toISOString().slice(0, 10);
}

function expandYear(yearText: string, apostrophe: boolean, today: string): number | null {
  if (!/^\d{1,4}$/.test(yearText) || yearText.length === 3) return null;
  const year = Number(yearText);
  if (yearText.length === 4) return year;
  if (apostrophe) return 2000 + year;
  const currentYy = Number(today.slice(2, 4));
  return (year <= currentYy + 1 ? 2000 : 1900) + year;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day)
    return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function plusOneYear(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC((year ?? 0) + 1, (month ?? 1) - 1, day ?? 1)).toISOString().slice(0, 10);
}

function fileOrder(dates: RawDate[]): "mdy" | "dmy" | "conflict" {
  let monthFirst = false;
  let dayFirst = false;
  for (const date of dates) {
    if (date.a > 12) dayFirst = true;
    if (date.b > 12) monthFirst = true;
  }
  if (monthFirst && dayFirst) return "conflict";
  if (dayFirst) return "dmy";
  return "mdy";
}

function readCategory(value: string): {
  transferAccount?: string;
  categoryHint?: string;
  tags?: string[];
} {
  const slash = value.indexOf("/");
  const head = (slash >= 0 ? value.slice(0, slash) : value).trim();
  const klass = slash >= 0 ? value.slice(slash + 1).trim() : "";
  const tags = klass ? [klass] : undefined;
  if (head.startsWith("[") && head.endsWith("]")) {
    const name = head.slice(1, -1).trim();
    if (name) return { transferAccount: name, tags };
  }
  if (!head) return { tags };
  return { categoryHint: head, tags };
}

function hasFields(rec: Rec): boolean {
  return Boolean(
    rec.date ||
    rec.amountT !== null ||
    rec.amountU !== null ||
    rec.payee ||
    rec.memo ||
    rec.check ||
    rec.category ||
    rec.split,
  );
}

/**
 * Quicken QIF bank, card, cash, and other-asset/liability lists.
 * Investment lists are skipped. Dates are ordered once for the whole file.
 * A contradictory file (one date with day > 12 and another with month > 12)
 * returns no rows and does not throw.
 */
export function parseQifStatement(text: string, options?: StatementParseOptions): ImportRow[] {
  const today = todayIso(options);
  const held: { rec: Rec; include: boolean }[] = [];
  let include = true;
  let rec = emptyRec();
  const flush = () => {
    if (hasFields(rec)) held.push({ rec, include });
    rec = emptyRec();
  };

  for (const line of linesOf(text)) {
    if (!line.trim()) continue;
    if (line.trimStart().startsWith("!")) {
      flush();
      const kind = typeName(line);
      if (kind !== null) include = SUPPORTED.has(kind);
      else if (line.trim().toLowerCase().startsWith("!account")) include = false;
      continue;
    }
    if (line.startsWith("^")) {
      flush();
      continue;
    }
    const code = line[0] ?? "";
    const value = line.slice(1).trim();
    if (code === "D") rec.date = readDate(value);
    else if (code === "T") rec.amountT = value;
    else if (code === "U") rec.amountU = value;
    else if (code === "P") rec.payee = value;
    else if (code === "M") rec.memo = value;
    else if (code === "N") rec.check = value;
    else if (code === "L") rec.category = value;
    else if (code === "S" || code === "E" || code === "$") {
      rec.split = true;
      if (code === "S" && value) rec.splitNames.push(value);
    }
  }
  flush();

  const dates = held.filter((item) => item.include && item.rec.date).map((item) => item.rec.date!);
  const order = options?.dateOrder ?? fileOrder(dates);
  if (!options?.dateOrder && order === "conflict") return [];

  const rows: ImportRow[] = [];
  for (const item of held) {
    if (!item.include || !item.rec.date) continue;
    const year = expandYear(item.rec.date.yearText, item.rec.date.apostrophe, today);
    if (year == null) continue;
    const month = order === "dmy" ? item.rec.date.b : item.rec.date.a;
    const day = order === "dmy" ? item.rec.date.a : item.rec.date.b;
    const postedOn = toIso(year, month, day);
    const amountRaw = item.rec.amountT ?? item.rec.amountU;
    if (!postedOn || amountRaw == null) continue;
    const category = item.rec.category ? readCategory(item.rec.category) : {};
    const warnings: string[] = [];
    if (item.rec.split) {
      const detail = item.rec.splitNames.length ? `: ${item.rec.splitNames.join(", ")}` : "";
      warnings.push(`split detail not imported${detail}`);
    }
    if (postedOn > plusOneYear(today)) warnings.push("date is more than a year ahead");
    const row: ImportRow = {
      postedOn,
      amountCents: dollarsToCents(amountRaw),
      merchant: item.rec.payee || "Imported",
      memo: item.rec.memo,
      externalId: "",
    };
    if (item.rec.check) row.checkNumber = item.rec.check;
    if (warnings.length) row.warnings = warnings;
    if (category.tags?.length) row.tags = category.tags;
    if (category.transferAccount) row.transferAccount = category.transferAccount;
    else if (category.categoryHint) row.categoryHint = category.categoryHint;
    rows.push(row);
  }
  return rows;
}

/** QIF has no bank id, so externalSource stays empty. `.qif` is the only suffix. */
export const qifStatementParser: StatementParser = {
  id: "qif",
  externalSource: "",
  extensions: [".qif"],
  label: "QIF",
  detect(text) {
    let src = text;
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
    return /^!type:/i.test(src.trimStart().slice(0, 32));
  },
  parse(text, options) {
    return parseQifStatement(text, options);
  },
};
