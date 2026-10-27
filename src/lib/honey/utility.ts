/** Utility workbook: columns, formulas, tiers, and the rows the graphs read. */

/** Inclining-block utility rates. Usage fills the lowest ceiling first. */

export type RateTier = {
  name: string;
  /** Inclusive unit ceiling. Null means everything above the previous block. */
  upTo: number | null;
  /** Cents per unit. May be fractional: 12.4 is $0.124 per unit. */
  rateCents: number;
};

export const SAMPLE_POWER_TIERS: RateTier[] = [
  { name: "First 400", upTo: 400, rateCents: 12.4 },
  { name: "Over 400", upTo: null, rateCents: 18.6 },
];

export function parseTiers(raw: unknown): RateTier[] {
  const bag = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(bag)) return [];
  const out: RateTier[] = [];
  for (const row of bag) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rate = Number(r.rateCents);
    if (!Number.isFinite(rate) || rate < 0) continue;
    const up = r.upTo == null || r.upTo === "" ? null : Number(r.upTo);
    out.push({
      name: String(r.name || "Tier").slice(0, 40),
      upTo: up != null && Number.isFinite(up) && up > 0 ? up : null,
      rateCents: rate,
    });
  }
  return out;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export type TierSlice = { name: string; units: number; rateCents: number };

/** How many units land in each block. Order is lowest ceiling first. */
export function tierSlices(usage: number, tiers: RateTier[]): TierSlice[] {
  if (!Number.isFinite(usage) || usage <= 0 || !tiers.length) return [];
  const sorted = [...tiers].sort((a, b) => {
    if (a.upTo == null && b.upTo == null) return 0;
    if (a.upTo == null) return 1;
    if (b.upTo == null) return -1;
    return a.upTo - b.upTo;
  });
  const out: TierSlice[] = [];
  let remaining = usage;
  let prevCap = 0;
  for (const tier of sorted) {
    const width = tier.upTo == null ? remaining : Math.max(0, tier.upTo - prevCap);
    const take = Math.min(remaining, width);
    if (take > 0) out.push({ name: tier.name, units: take, rateCents: tier.rateCents });
    remaining -= take;
    if (tier.upTo != null) prevCap = tier.upTo;
    if (remaining <= 0) break;
  }
  return out;
}

/** Inclining-block charge in cents. Rounded once, on the total. */
export function tierChargeCents(usage: number, tiers: RateTier[]): number {
  const cost = tierSlices(usage, tiers).reduce((sum, slice) => sum + slice.units * slice.rateCents, 0);
  return Math.round(cost);
}

export function tierChargeDollars(usage: number, tiers: RateTier[]): number {
  return tierChargeCents(usage, tiers) / 100;
}

export type ColumnKind = "number" | "money" | "calculated" | "date";
export type Rollup = "" | "meter" | "usage" | "bill" | "days" | "readDate" | "charges";

export type UtilColumn = {
  id: string;
  utilityId: string;
  key: string;
  label: string;
  kind: ColumnKind;
  unit: string;
  formula: string;
  rollup: Rollup;
  fromChildren: boolean;
};

export type ReadLike = {
  id: string;
  utilityId: string;
  date: string;
  meter: number | null;
  amountCents: number;
  opening: boolean;
  resetEnd?: number | null;
  resetStart?: number | null;
  cells?: Record<string, number>;
};

export type SheetRow = {
  id: string;
  date: string;
  entered: Record<string, number>;
  computed: Record<string, number>;
  errors: Record<string, string>;
};

type StarterColumn = {
  key: string;
  label: string;
  kind: ColumnKind;
  unit?: string;
  formula?: string;
  rollup?: Rollup;
  fromChildren?: boolean;
};

type Starter = { name: string; slug: string; unit: string; columns: StarterColumn[] };

/** This read date minus the previous read date, in days. */
export const DAYS_FORMULA = "{read_on} - {prev.read_on}";
/** This meter read minus the previous meter read. */
export const USAGE_FORMULA = "{meter_read} - {prev.meter_read}";

const STARTERS: Starter[] = [
  {
    name: "Electric",
    slug: "electric",
    unit: "kWh",
    columns: [
      { key: "meter_read", label: "Meter read", kind: "number", unit: "kWh", rollup: "meter" },
      { key: "read_on", label: "Meter read date", kind: "date", rollup: "readDate" },
      { key: "read_days", label: "Days in period", kind: "calculated", unit: "days", formula: DAYS_FORMULA, rollup: "days" },
      { key: "usage_kwh", label: "Usage kWh", kind: "calculated", unit: "kWh", formula: USAGE_FORMULA, rollup: "usage" },
      { key: "tesla_kwh", label: "Tesla kWh", kind: "number", unit: "kWh", fromChildren: true },
      { key: "generation_kwh", label: "Generation kWh", kind: "number", unit: "kWh" },
      { key: "grid_kwh", label: "Grid kWh", kind: "calculated", unit: "kWh", formula: "{usage_kwh} - {generation_kwh}" },
      { key: "energy_charge", label: "Energy charge", kind: "money" },
      { key: "energy_tier_charge", label: "Tier energy $", kind: "calculated", unit: "$", formula: "tier_charge({usage_kwh})" },
      { key: "delivery_charge", label: "Delivery", kind: "money" },
      { key: "riders", label: "Riders / ESS", kind: "money" },
      { key: "taxes_fees", label: "Taxes & fees", kind: "money" },
      { key: "bill_amount", label: "Bill amount", kind: "money", unit: "$", rollup: "bill" },
      { key: "bill_sum", label: "Charges sum", kind: "calculated", unit: "$", formula: "{energy_charge} + {delivery_charge} + {riders} + {taxes_fees}", rollup: "charges" },
      { key: "cost_per_kwh", label: "Cost / kWh", kind: "calculated", unit: "$/kWh", formula: "{bill_amount} / {usage_kwh}" },
      { key: "avg_daily_kwh", label: "Avg daily kWh", kind: "calculated", unit: "kWh", formula: "avg_daily({usage_kwh})" },
      { key: "vs_last_month", label: "vs last month", kind: "calculated", unit: "kWh", formula: "{usage_kwh} - {prev.usage_kwh}" },
      { key: "yoy_usage", label: "YoY usage", kind: "calculated", unit: "kWh", formula: "yoy({usage_kwh})" },
      { key: "avg_same_month", label: "2y same-month avg $", kind: "calculated", unit: "$", formula: "avg_same_month({bill_amount})" },
      { key: "max_same_month", label: "2y same-month max $", kind: "calculated", unit: "$", formula: "max_same_month({bill_amount})" },
    ],
  },
  {
    name: "Gas",
    slug: "gas",
    unit: "CCF",
    columns: [
      { key: "meter_read", label: "Meter read", kind: "number", unit: "CCF", rollup: "meter" },
      { key: "read_on", label: "Meter read date", kind: "date", rollup: "readDate" },
      { key: "read_days", label: "Days in period", kind: "calculated", unit: "days", formula: DAYS_FORMULA, rollup: "days" },
      { key: "usage_ccf", label: "Usage CCF", kind: "calculated", unit: "CCF", formula: USAGE_FORMULA, rollup: "usage" },
      { key: "usage_therms", label: "Usage therms", kind: "number", unit: "therms" },
      { key: "supply_charge", label: "Supply", kind: "money" },
      { key: "delivery_charge", label: "Delivery", kind: "money" },
      { key: "taxes_fees", label: "Taxes & fees", kind: "money" },
      { key: "bill_amount", label: "Bill amount", kind: "money", rollup: "bill" },
      { key: "cost_per_therm", label: "Cost / therm", kind: "calculated", formula: "{bill_amount} / {usage_therms}" },
      { key: "avg_daily", label: "Avg daily CCF", kind: "calculated", formula: "avg_daily({usage_ccf})" },
      { key: "vs_last_month", label: "vs last month", kind: "calculated", formula: "{usage_ccf} - {prev.usage_ccf}" },
      { key: "yoy_usage", label: "YoY usage", kind: "calculated", formula: "yoy({usage_ccf})" },
      { key: "avg_same_month", label: "2y same-month avg $", kind: "calculated", formula: "avg_same_month({bill_amount})" },
    ],
  },
  {
    name: "Water",
    slug: "water",
    unit: "CCF",
    columns: [
      { key: "meter_read", label: "Meter read", kind: "number", unit: "CCF", rollup: "meter" },
      { key: "read_on", label: "Meter read date", kind: "date", rollup: "readDate" },
      { key: "read_days", label: "Days in period", kind: "calculated", unit: "days", formula: DAYS_FORMULA, rollup: "days" },
      { key: "usage_ccf", label: "Usage CCF", kind: "calculated", unit: "CCF", formula: USAGE_FORMULA, rollup: "usage" },
      { key: "usage_gal", label: "Usage gallons", kind: "calculated", unit: "gal", formula: "{usage_ccf} * 748" },
      { key: "water_charge", label: "Water", kind: "money" },
      { key: "sewer_charge", label: "Sewer", kind: "money" },
      { key: "stormwater", label: "Stormwater", kind: "money" },
      { key: "taxes_fees", label: "Taxes & fees", kind: "money" },
      { key: "bill_amount", label: "Bill amount", kind: "money", rollup: "bill" },
      { key: "cost_per_ccf", label: "Cost / CCF", kind: "calculated", formula: "{bill_amount} / {usage_ccf}" },
      { key: "avg_daily_gal", label: "Avg daily gal", kind: "calculated", formula: "avg_daily({usage_gal})" },
      { key: "yoy_usage", label: "YoY usage", kind: "calculated", formula: "yoy({usage_ccf})" },
    ],
  },
  {
    name: "Cellular",
    slug: "cellular",
    unit: "none",
    columns: [
      { key: "plan_amount", label: "Plan", kind: "money", fromChildren: true },
      { key: "equipment", label: "Equipment", kind: "money", fromChildren: true },
      { key: "surcharges", label: "Surcharges", kind: "money", fromChildren: true },
      { key: "minutes", label: "Minutes", kind: "number", fromChildren: true },
      { key: "data_mb", label: "Data MB", kind: "number", fromChildren: true },
      { key: "bill_amount", label: "Bill amount", kind: "money", rollup: "bill", fromChildren: true },
      { key: "avg_daily_min", label: "Avg daily minutes", kind: "calculated", formula: "avg_daily({minutes})" },
      { key: "vs_last_month", label: "vs last month $", kind: "calculated", formula: "{bill_amount} - {prev.bill_amount}" },
    ],
  },
  {
    name: "Streaming",
    slug: "streaming",
    unit: "none",
    columns: [
      { key: "subscription", label: "Subscription", kind: "money" },
      { key: "add_ons", label: "Add-ons", kind: "money" },
      { key: "taxes_fees", label: "Taxes & fees", kind: "money" },
      { key: "bill_amount", label: "Bill amount", kind: "money", rollup: "bill" },
      { key: "vs_last_month", label: "vs last month", kind: "calculated", formula: "{bill_amount} - {prev.bill_amount}" },
    ],
  },
];

const BLANK: StarterColumn[] = [
  { key: "meter_read", label: "Meter read", kind: "number", rollup: "meter" },
  { key: "read_on", label: "Meter read date", kind: "date", rollup: "readDate" },
  { key: "read_days", label: "Days in period", kind: "calculated", unit: "days", formula: DAYS_FORMULA, rollup: "days" },
  { key: "usage", label: "Usage", kind: "calculated", formula: USAGE_FORMULA, rollup: "usage" },
  { key: "bill_amount", label: "Bill amount", kind: "money", rollup: "bill" },
  { key: "vs_last_month", label: "vs last month", kind: "calculated", formula: "{usage} - {prev.usage}" },
];

export const UTILITY_TEMPLATES = STARTERS.map((s) => ({ slug: s.slug, name: s.name, unit: s.unit }));

export function starterColumns(utilityId: string, slug: string, unit = "kWh"): UtilColumn[] {
  const starter = STARTERS.find((s) => s.slug === slug);
  const cols = starter ? starter.columns : BLANK;
  const meterUnit = starter?.unit && starter.unit !== "none" ? starter.unit : unit;
  return cols.map((c) => ({
    id: `col-${utilityId}-${c.key}`,
    utilityId,
    key: c.key,
    label: c.label,
    kind: c.kind,
    unit: c.unit || (c.rollup === "meter" || c.rollup === "usage" ? meterUnit : ""),
    formula: c.formula ?? "",
    rollup: c.rollup ?? "",
    fromChildren: Boolean(c.fromChildren),
  }));
}

export function templateUnit(slug: string): string {
  return STARTERS.find((s) => s.slug === slug)?.unit ?? "kWh";
}

export function columnsForExisting(
  utilities: { id: string; unit: string }[],
  existing: UtilColumn[] | null | undefined,
): UtilColumn[] {
  const normalize = (c: UtilColumn): UtilColumn => ({
    ...c,
    formula: c.formula ?? "",
    rollup: c.rollup || "",
    unit: c.unit ?? "",
    fromChildren: Boolean(c.fromChildren),
  });
  const ids = new Set(utilities.map((u) => u.id));
  const relevant = (existing ?? []).filter((c) => ids.has(c.utilityId)).map(normalize);
  if (existing != null && relevant.length > 0) {
    const covered = new Set(relevant.map((c) => c.utilityId));
    const extra = utilities
      .filter((u) => !covered.has(u.id))
      .flatMap((u) => (u.id === "util-power" ? starterColumns(u.id, "electric") : starterColumns(u.id, "blank", u.unit || "kWh")));
    return [...relevant, ...extra];
  }
  if (existing != null && utilities.length === 0) return [];
  return utilities.flatMap((u) => (u.id === "util-power" ? starterColumns(u.id, "electric") : starterColumns(u.id, "blank", u.unit || "kWh")));
}

/** One-time backfill: electric meters that already track kWh gain a tier-priced column. */
export function ensureTierColumn(columns: UtilColumn[]): UtilColumn[] {
  const out = [...columns];
  const ids = new Set(out.map((c) => c.utilityId));
  for (const id of ids) {
    const mine = out.filter((c) => c.utilityId === id);
    if (mine.some((c) => c.key === "energy_tier_charge")) continue;
    if (!mine.some((c) => c.key === "usage_kwh")) continue;
    const starter = starterColumns(id, "electric").find((c) => c.key === "energy_tier_charge");
    if (!starter) continue;
    const idx = out.findIndex((c) => c.utilityId === id && c.key === "energy_charge");
    if (idx >= 0) out.splice(idx + 1, 0, starter);
    else out.push(starter);
  }
  return out;
}

/** One-time backfill: a meter gains a read-date column so the bill month can follow it. */
export function ensureReadDateColumn(columns: UtilColumn[]): UtilColumn[] {
  const out = [...columns];
  const ids = new Set(out.map((c) => c.utilityId));
  for (const id of ids) {
    const mine = out.filter((c) => c.utilityId === id);
    if (mine.some((c) => c.rollup === "readDate" || c.key === "read_on")) continue;
    if (!mine.some((c) => c.rollup === "meter")) continue;
    const column: UtilColumn = {
      id: `col-${id}-read_on`,
      utilityId: id,
      key: "read_on",
      label: "Meter read date",
      kind: "date",
      unit: "",
      formula: "",
      rollup: "readDate",
      fromChildren: false,
    };
    const idx = out.findIndex((c) => c.utilityId === id && c.rollup === "meter");
    if (idx >= 0) out.splice(idx + 1, 0, column);
    else out.push(column);
  }
  return out;
}

export function hasMeter(columns: { rollup: Rollup }[], unit = ""): boolean {
  if (columns.some((c) => c.rollup === "meter" || c.rollup === "readDate")) return true;
  return Boolean(unit) && unit !== "none";
}

/** How a workbook cell is drawn. Only the cell being edited mounts an input. */
export function cellMount(
  column: { kind: string; rollup: string },
  opts: { metered: boolean; openingUsage: boolean; editing: boolean },
): "static" | "input" | "date" {
  if (opts.openingUsage) return "static";
  const dated = column.kind === "date" || column.rollup === "readDate";
  const locked = column.kind === "calculated" || (opts.metered && column.rollup === "days");
  if (!opts.editing || locked) return "static";
  return dated ? "date" : "input";
}

type FormulaOk = { ok: true; value: number };
type FormulaErr = { ok: false; error: string; pending?: boolean };
type FormulaResult = FormulaOk | FormulaErr;

type FormulaColumn = { key: string; label: string; kind: string };

type FormulaContext = {
  year: number;
  month: number;
  days: number;
  periodDays: number | null;
  current: Record<string, number | null>;
  prev: Record<string, number | null>;
  history: { year: number; month: number; values: Record<string, number | null> }[];
  tiers: RateTier[];
  columns?: FormulaColumn[];
  /** An empty column on this row counts as zero. A calculated column that is not ready yet stays pending. */
  zeroBlanks?: boolean;
  zeroCalculated?: boolean;
};

type Token =
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "id"; v: string }
  | { t: "ref"; v: string }
  | { t: "comma" }
  | { t: "lparen" }
  | { t: "rparen" };

const FUNCS = new Set(["avg_daily", "avg", "avg_same_month", "max_same_month", "yoy", "tier_charge"]);

function tokenize(src: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  const s = src.trim();
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t" || c === "\n") {
      i += 1;
      continue;
    }
    if (c === "{") {
      const end = s.indexOf("}", i);
      if (end < 0) return "Unclosed {token}";
      out.push({ t: "ref", v: s.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (c === "(") {
      out.push({ t: "lparen" });
      i += 1;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rparen" });
      i += 1;
      continue;
    }
    if (c === ",") {
      out.push({ t: "comma" });
      i += 1;
      continue;
    }
    if ("+-*/".includes(c)) {
      out.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    if (c === "." || (c >= "0" && c <= "9")) {
      const m = s.slice(i).match(/^\d+(\.\d+)?/);
      if (!m) return "Bad number";
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!m) return "Bad name";
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    return `Unexpected "${c}"`;
  }
  return out;
}

class Parser {
  i = 0;
  tokens: Token[];
  ctx: FormulaContext;
  constructor(tokens: Token[], ctx: FormulaContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }
  peek(): Token | undefined {
    return this.tokens[this.i];
  }
  take(): Token | undefined {
    return this.tokens[this.i++];
  }
  parse(): FormulaResult {
    if (this.tokens.length === 0) return { ok: false, error: "Empty formula" };
    const v = this.expr();
    if (!v.ok) return v;
    if (this.i < this.tokens.length) return { ok: false, error: "Unexpected extra tokens" };
    if (!Number.isFinite(v.value)) return { ok: false, error: "Not a number" };
    return v;
  }
  expr(): FormulaResult {
    let left = this.term();
    if (!left.ok) return left;
    while (this.peek()?.t === "op" && "+-".includes((this.peek() as { v: string }).v)) {
      const op = (this.take() as { v: string }).v;
      const right = this.term();
      if (!right.ok) return right;
      left = { ok: true, value: op === "+" ? left.value + right.value : left.value - right.value };
    }
    return left;
  }
  term(): FormulaResult {
    let left = this.unary();
    if (!left.ok) return left;
    while (this.peek()?.t === "op" && "*/".includes((this.peek() as { v: string }).v)) {
      const op = (this.take() as { v: string }).v;
      const right = this.unary();
      if (!right.ok) return right;
      if (op === "/" && right.value === 0) return { ok: false, error: "Division by zero" };
      left = { ok: true, value: op === "/" ? left.value / right.value : left.value * right.value };
    }
    return left;
  }
  unary(): FormulaResult {
    const p = this.peek();
    if (p?.t === "op" && (p.v === "+" || p.v === "-")) {
      this.take();
      const inner = this.unary();
      if (!inner.ok) return inner;
      return { ok: true, value: p.v === "-" ? -inner.value : inner.value };
    }
    return this.factor();
  }
  factor(): FormulaResult {
    const t = this.take();
    if (!t) return { ok: false, error: "Unexpected end of formula" };
    if (t.t === "num") return { ok: true, value: t.v };
    if (t.t === "lparen") {
      const inner = this.expr();
      if (!inner.ok) return inner;
      if (this.take()?.t !== "rparen") return { ok: false, error: "Missing )" };
      return inner;
    }
    if (t.t === "ref") return this.resolveRef(t.v);
    if (t.t === "id") {
      if (t.v === "days") return { ok: true, value: this.ctx.periodDays && this.ctx.periodDays > 0 ? this.ctx.periodDays : this.ctx.days };
      if (FUNCS.has(t.v.toLowerCase())) return this.call(t.v.toLowerCase());
      return { ok: false, error: `Unknown name ${t.v}` };
    }
    return { ok: false, error: "Unexpected token" };
  }
  call(name: string): FormulaResult {
    if (this.take()?.t !== "lparen") return { ok: false, error: `${name} needs (` };
    const args: Array<{ kind: "ref"; v: string } | { kind: "num"; v: number }> = [];
    if (this.peek()?.t !== "rparen") {
      while (true) {
        if (name !== "avg_daily" && this.peek()?.t === "ref") {
          args.push({ kind: "ref", v: (this.take() as { v: string }).v });
        } else {
          const e = this.expr();
          if (!e.ok) return e;
          args.push({ kind: "num", v: e.value });
        }
        if (this.peek()?.t === "comma") {
          this.take();
          continue;
        }
        break;
      }
    }
    if (this.take()?.t !== "rparen") return { ok: false, error: `Missing ) for ${name}` };
    return this.applyFn(name, args);
  }
  applyFn(name: string, args: Array<{ kind: "ref"; v: string } | { kind: "num"; v: number }>): FormulaResult {
    if (name === "tier_charge") {
      const a0 = args[0];
      if (!a0) return { ok: false, error: "tier_charge needs usage" };
      const resolved = a0.kind === "num" ? ({ ok: true, value: a0.v } as FormulaResult) : this.resolveRef(a0.v);
      if (!resolved.ok) return resolved.pending ? resolved : { ok: false, error: "tier_charge missing usage" };
      if (!this.ctx.tiers.length) return { ok: false, error: "No rate tiers on this meter" };
      return { ok: true, value: tierChargeDollars(resolved.value, this.ctx.tiers) };
    }
    if (name === "avg_daily") {
      const a0 = args[0];
      if (!a0) return { ok: false, error: "avg_daily needs a value" };
      const resolved = a0.kind === "num" ? ({ ok: true, value: a0.v } as FormulaResult) : this.resolveRef(a0.v);
      if (!resolved.ok) return resolved.pending ? resolved : { ok: false, error: "avg_daily missing value" };
      const denom = this.ctx.periodDays && this.ctx.periodDays > 0 ? this.ctx.periodDays : this.ctx.days;
      if (!denom) return { ok: false, error: "Division by zero" };
      return { ok: true, value: resolved.value / denom };
    }
    const field = args[0]?.kind === "ref" ? args[0].v : "";
    if (!field) return { ok: false, error: `${name} needs a {field}` };
    const key = this.canon(field.includes(".") ? field.split(".").pop()! : field);
    if (name === "avg") {
      const nums = this.ctx.history.map((h) => h.values[key]).filter((v): v is number => v != null && Number.isFinite(v));
      if (!nums.length) return { ok: false, error: `No history for {${key}}` };
      return { ok: true, value: nums.reduce((s, n) => s + n, 0) / nums.length };
    }
    if (name === "avg_same_month" || name === "max_same_month") {
      const nums: number[] = [];
      for (let y = 1; y <= 2; y += 1) {
        const hit = this.ctx.history.find((h) => h.year === this.ctx.year - y && h.month === this.ctx.month);
        const v = hit?.values[key];
        if (v != null && Number.isFinite(v)) nums.push(v);
      }
      if (!nums.length) return { ok: false, error: `No same-month history for {${key}}` };
      if (name === "max_same_month") return { ok: true, value: Math.max(...nums) };
      return { ok: true, value: nums.reduce((s, n) => s + n, 0) / nums.length };
    }
    if (name === "yoy") {
      const last = this.ctx.history.find((h) => h.year === this.ctx.year - 1 && h.month === this.ctx.month);
      const prev = last?.values[key];
      const cur = this.ctx.current[key];
      if (cur == null) return { ok: false, error: `Missing {${key}}` };
      if (prev == null) return { ok: false, error: `No last-year {${key}}` };
      return { ok: true, value: cur - prev };
    }
    return { ok: false, error: `Unknown function ${name}` };
  }
  norm(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  columnFor(raw: string): FormulaColumn | undefined {
    const want = this.norm(raw);
    if (!want) return undefined;
    return this.ctx.columns?.find((column) => this.norm(column.key) === want || this.norm(column.label) === want);
  }
  canon(raw: string): string {
    return this.columnFor(raw)?.key ?? raw.trim();
  }
  resolveRef(raw: string): FormulaResult {
    const parts = raw.trim().split(".");
    if (!parts[0]) return { ok: false, error: "Empty {}" };
    if (parts.length === 1) {
      const column = this.columnFor(parts[0]);
      const key = column?.key ?? parts[0];
      const value = this.ctx.current[key];
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
      if (column?.kind === "calculated" && !this.ctx.zeroCalculated) return { ok: false, error: `Missing {${key}}`, pending: true };
      if (column) return { ok: true, value: 0 };
      return { ok: false, error: `Missing {${parts[0]}}` };
    }
    if (parts[0] === "prev") {
      const name = parts[1] ?? "";
      const key = this.canon(name);
      const value = this.ctx.prev[key];
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
      return { ok: false, error: `Missing {prev.${name}}` };
    }
    return { ok: false, error: `Missing {${raw}}` };
  }
}

export function evaluateFormula(src: string, ctx: FormulaContext): FormulaResult {
  const tokens = tokenize(src);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  return new Parser(tokens, ctx).parse();
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function daySpan(prev: string, next: string): number {
  const a = Date.parse(`${prev}T00:00:00Z`);
  const b = Date.parse(`${next}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 30;
  return Math.round((b - a) / 86400000);
}

/** Days from the previous meter read date to this one. Null when there is no earlier read. */
export function daysBetweenReads(prev: string | null | undefined, next: string): number | null {
  if (!prev || !next) return null;
  const a = Date.parse(`${prev}T00:00:00Z`);
  const b = Date.parse(`${next}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Usage between two dials. A reset or replacement adds the old dial's leftover to the new dial's use. */
export function meterUsage(
  prev: number | null | undefined,
  reading: { meter: number | null; opening?: boolean; resetEnd?: number | null; resetStart?: number | null } | null | undefined,
): number | null {
  if (!reading || reading.opening) return null;
  const meter = reading.meter;
  if (meter == null || prev == null || !Number.isFinite(meter) || !Number.isFinite(prev)) return null;
  const end = reading.resetEnd;
  const start = reading.resetStart;
  if (typeof end === "number" && typeof start === "number" && Number.isFinite(end) && Number.isFinite(start)) {
    return (end - prev) + (meter - start);
  }
  return meter - prev;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function childRolled(
  column: UtilColumn,
  sheets: Map<string, SheetRow[]>,
  childReads: ReadLike[],
  childColumns: UtilColumn[],
  month: string,
): number | null {
  let sum = 0;
  let any = false;
  for (const id of sheets.keys()) {
    const cols = childColumns.filter((c) => c.utilityId === id);
    const rows = childReads.filter((r) => r.utilityId === id).slice().sort((a, b) => a.date.localeCompare(b.date));
    const idx = rows.findIndex((r) => monthOf(r.date) === month);
    if (idx < 0) continue;
    const cur = rows[idx]!;
    const prev = rows[idx - 1];
    const usage = prev && !cur.opening ? meterUsage(prev.meter, cur) : null;
    const sheetRow = sheets.get(id)?.find((row) => row.id === cur.id);
    const same = cols.find((c) => c.key === column.key);
    let value: number | null = null;
    const computed = same && sheetRow ? sheetRow.computed[same.key] : undefined;
    if (typeof computed === "number" && Number.isFinite(computed)) value = computed;
    else if (same) {
      if (same.rollup === "usage") value = usage;
      else if (same.rollup === "bill") value = cur.amountCents / 100;
      else if (same.rollup === "meter" && cur.meter != null) value = cur.meter;
      else if (cur.cells && cur.cells[same.key] != null) value = cur.cells[same.key]!;
    } else if (column.kind === "money" || column.rollup === "bill" || column.rollup === "charges") {
      value = cur.amountCents / 100;
    } else {
      value = usage;
    }
    if (value != null && Number.isFinite(value)) {
      sum += value;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Formula names ignore case, spaces, and punctuation. "Month Cust Charge" and month_cust_charge are the same name. */
export function formulaIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The {name} written into a formula for a column label. */
export function formulaToken(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
}

/** The column a formula {name} points at. The first matching key or label wins. */
export function columnByFormulaName<T extends { key: string; label: string }>(columns: T[], raw: string): T | undefined {
  const want = formulaIdentity(raw);
  if (!want) return undefined;
  return columns.find((column) => formulaIdentity(column.key) === want || formulaIdentity(column.label) === want);
}

/** Another column already uses this name, either as its label or as its key. */
export function duplicateColumnName<T extends { id: string; key: string; label: string }>(columns: T[], label: string, exceptId?: string): T | undefined {
  const want = formulaIdentity(label);
  if (!want) return undefined;
  return columns.find((column) => column.id !== exceptId && (formulaIdentity(column.label) === want || formulaIdentity(column.key) === want));
}

/** Point formula refs that mean this column at its new name. Other columns are left alone. */
export function rewriteColumnName(formula: string, columns: { id: string; key: string; label: string }[], columnId: string, nextLabel: string): string {
  const next = formulaToken(nextLabel);
  return formula.replace(/\{([^{}]+)\}/g, (full, inner: string) => {
    const raw = inner.trim();
    const prev = /^prev\./i.test(raw);
    const name = (prev ? raw.slice(raw.indexOf(".") + 1) : raw).trim();
    if (!name || name.includes(".")) return full;
    const hit = columnByFormulaName(columns, name);
    if (hit?.id !== columnId) return full;
    return `{${prev ? "prev." : ""}${next}}`;
  });
}

function formulaDeps(formula: string): string[] {
  return [...formula.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1]!.trim())
    .filter((ref) => ref && !ref.startsWith("prev."));
}

function orderCalc(columns: UtilColumn[]): UtilColumn[] {
  const calc = columns.filter((column) => column.kind === "calculated" && column.formula.trim());
  const norm = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const canon = (raw: string) => {
    const want = norm(raw);
    return columns.find((column) => norm(column.key) === want || norm(column.label) === want)?.key ?? raw;
  };
  const byKey = new Map(calc.map((column) => [column.key, column]));
  const indegree = new Map(calc.map((column) => [column.key, 0]));
  const next = new Map(calc.map((column) => [column.key, [] as string[]]));
  for (const column of calc) {
    for (const ref of formulaDeps(column.formula)) {
      const key = canon(ref);
      if (!byKey.has(key) || key === column.key) continue;
      next.get(key)!.push(column.key);
      indegree.set(column.key, (indegree.get(column.key) ?? 0) + 1);
    }
  }
  const queue = calc.filter((column) => indegree.get(column.key) === 0).map((column) => column.key);
  const ordered: UtilColumn[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const key = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(byKey.get(key)!);
    for (const dep of next.get(key) ?? []) {
      indegree.set(dep, (indegree.get(dep) ?? 1) - 1);
      if (indegree.get(dep) === 0) queue.push(dep);
    }
  }
  for (const column of calc) if (!seen.has(column.key)) ordered.push(column);
  return ordered;
}

function childSheets(childReads: ReadLike[], childColumns: UtilColumn[]): Map<string, SheetRow[]> {
  const out = new Map<string, SheetRow[]>();
  for (const id of [...new Set(childReads.map((reading) => reading.utilityId))]) {
    out.set(
      id,
      buildSheet(
        id,
        childColumns.filter((column) => column.utilityId === id),
        childReads.filter((reading) => reading.utilityId === id),
      ),
    );
  }
  return out;
}

export function buildSheet(
  utilityId: string,
  columns: UtilColumn[],
  readings: ReadLike[],
  childReads: ReadLike[] = [],
  tiers: RateTier[] = [],
  childColumns: UtilColumn[] = [],
): SheetRow[] {
  const sorted = readings.filter((r) => r.utilityId === utilityId).slice().sort((a, b) => a.date.localeCompare(b.date));
  const metered = hasMeter(columns);
  const nested = childSheets(childReads, childColumns);
  const rows: SheetRow[] = sorted.map((reading, i) => {
    const prev = sorted[i - 1];
    const entered: Record<string, number> = { ...(reading.cells ?? {}) };
    const days = metered ? daysBetweenReads(prev?.date, reading.date) : prev ? daySpan(prev.date, reading.date) : 30;
    for (const column of columns) {
      if (column.rollup === "days" && metered) {
        if (days == null) delete entered[column.key];
        else entered[column.key] = days;
        continue;
      }
      if (column.kind === "date" || column.rollup === "readDate") {
        const epochDays = Date.parse(`${reading.date}T00:00:00Z`) / 86400000;
        if (Number.isFinite(epochDays)) entered[column.key] = epochDays;
        continue;
      }
      if (column.rollup === "bill") {
        const typed = reading.cells?.[column.key];
        entered[column.key] = typed != null && Number.isFinite(typed) ? typed : reading.amountCents / 100;
        continue;
      }
      if (column.kind === "calculated" || entered[column.key] != null) continue;
      if (column.fromChildren) {
        const rolled = childRolled(column, nested, childReads, childColumns, monthOf(reading.date));
        if (rolled != null) entered[column.key] = rolled;
        continue;
      }
      if (column.rollup === "meter" && reading.meter != null) entered[column.key] = reading.meter;
      if (column.rollup === "days") entered[column.key] = days ?? 30;
      if (column.rollup === "usage" && prev?.meter != null && reading.meter != null && !reading.opening) {
        const usage = meterUsage(prev.meter, reading);
        if (usage != null) entered[column.key] = Math.round(usage * 1000) / 1000;
      }
    }
    return { id: reading.id, date: reading.date, entered, computed: { ...entered }, errors: {} };
  });
  const calc = orderCalc(columns);
  const known = columns.map((column) => ({ key: column.key, label: column.label, kind: column.kind }));
  const daysKey = columns.find((c) => c.rollup === "days")?.key;
  const limit = Math.max(calc.length + 2, 4);
  for (let pass = 0; pass < limit; pass += 1) {
    let changed = false;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const [year, month] = row.date.split("-").map(Number);
      const history = rows.slice(0, i).map((h) => {
        const [hy, hm] = h.date.split("-").map(Number);
        return { year: hy!, month: hm!, values: h.computed as Record<string, number | null> };
      });
      for (const column of calc) {
        const prevRow = rows[i - 1];
        if (column.rollup === "days" && !prevRow) continue;
        if (column.rollup === "usage" && (sorted[i]?.opening || !prevRow)) continue;
        const resetUsage = column.rollup === "usage" ? meterUsage(sorted[i - 1]?.meter, sorted[i]) : null;
        if (column.rollup === "usage" && sorted[i]?.resetEnd != null && sorted[i]?.resetStart != null && resetUsage != null) {
          const next = Math.round(resetUsage * 1000) / 1000;
          if (row.computed[column.key] !== next) changed = true;
          row.computed[column.key] = next;
          delete row.errors[column.key];
          continue;
        }
        const result = evaluateFormula(column.formula, {
          year: year!,
          month: month!,
          days: daysInMonth(year!, month!),
          periodDays: daysKey != null && row.computed[daysKey] != null ? row.computed[daysKey]! : null,
          current: row.computed,
          prev: rows[i - 1]?.computed ?? {},
          history,
          tiers,
          columns: known,
        });
        if (result.ok) {
          const next = Math.round(result.value * 1000) / 1000;
          if (row.computed[column.key] !== next) changed = true;
          row.computed[column.key] = next;
          delete row.errors[column.key];
        } else if (!result.pending && row.computed[column.key] == null) {
          row.errors[column.key] = result.error;
        }
      }
    }
    if (!changed) break;
  }
  for (let round = 0; round < calc.length + 1; round += 1) {
    let changed = false;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const [year, month] = row.date.split("-").map(Number);
      for (const column of calc) {
        if (row.computed[column.key] != null) continue;
        const prevRow = rows[i - 1];
        if (column.rollup === "days" && !prevRow) continue;
        if (column.rollup === "usage" && (sorted[i]?.opening || !prevRow)) continue;
        const result = evaluateFormula(column.formula, {
          year: year!,
          month: month!,
          days: daysInMonth(year!, month!),
          periodDays: daysKey != null && row.computed[daysKey] != null ? row.computed[daysKey]! : null,
          current: row.computed,
          prev: rows[i - 1]?.computed ?? {},
          history: [],
          tiers,
          columns: known,
          zeroCalculated: true,
        });
        if (!result.ok) continue;
        const next = Math.round(result.value * 1000) / 1000;
        if (row.computed[column.key] !== next) changed = true;
        row.computed[column.key] = next;
        delete row.errors[column.key];
      }
    }
    if (!changed) break;
  }
  for (const row of rows) {
    const index = rows.indexOf(row);
    for (const column of calc) {
      if (row.computed[column.key] != null || row.errors[column.key]) continue;
      const [year, month] = row.date.split("-").map(Number);
      const result = evaluateFormula(column.formula, {
        year: year!,
        month: month!,
        days: daysInMonth(year!, month!),
        periodDays: daysKey != null && row.computed[daysKey] != null ? row.computed[daysKey]! : null,
        current: row.computed,
        prev: rows[index - 1]?.computed ?? {},
        history: [],
        tiers,
        columns: known,
        zeroCalculated: true,
      });
      if (!result.ok) row.errors[column.key] = result.error;
    }
  }
  return rows;
}

export type TrendPoint = { label: string; date: string; usage: number | null; bill: number | null };
export type YearPoint = { label: string; thisYear: number | null; lastYear: number | null };

export function trendPoints(rows: SheetRow[], columns: UtilColumn[]): TrendPoint[] {
  const usageKey = columns.find((c) => c.rollup === "usage")?.key;
  const billKey = columns.find((c) => c.rollup === "bill")?.key;
  return rows.map((row) => ({
    date: row.date,
    label: row.date.slice(2, 7),
    usage: usageKey != null && row.computed[usageKey] != null ? row.computed[usageKey]! : null,
    bill: billKey != null && row.computed[billKey] != null ? row.computed[billKey]! : null,
  }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function yearPoints(rows: SheetRow[], columns: UtilColumn[], year: number): YearPoint[] {
  const usageKey = columns.find((c) => c.rollup === "usage")?.key;
  return MONTHS.map((label, i) => {
    const month = String(i + 1).padStart(2, "0");
    const cur = rows.find((r) => r.date.startsWith(`${year}-${month}`));
    const prev = rows.find((r) => r.date.startsWith(`${year - 1}-${month}`));
    return {
      label,
      thisYear: usageKey && cur ? (cur.computed[usageKey] ?? null) : null,
      lastYear: usageKey && prev ? (prev.computed[usageKey] ?? null) : null,
    };
  });
}

export type HistorySeries = { key: string; label: string; money: boolean };

/** Columns worth charting. Meter reads, dates, and the day count stay off the graph. */
export function historySeries(columns: UtilColumn[]): HistorySeries[] {
  return columns
    .filter((column) => column.kind !== "date" && !["readDate", "meter", "days"].includes(column.rollup))
    .map((column) => ({
      key: column.key,
      label: column.label,
      money: column.kind === "money" || column.rollup === "bill" || column.rollup === "charges" || column.unit.startsWith("$"),
    }));
}

export type HistoryPoint = {
  label: string;
  lastYear: number | null;
  thisYear: number | null;
  paid: number | null;
  statement: number | null;
  lineGap: boolean;
};

/** Twelve months, this year against last year, for one column. Paid and the statement are in dollars. */
export function historyYear(
  rows: SheetRow[],
  columns: UtilColumn[],
  key: string,
  year: number,
  payments: { readingId: string; amountCents: number }[] = [],
): HistoryPoint[] {
  const column = columns.find((item) => item.key === key);
  const money = column ? column.kind === "money" || column.rollup === "bill" || column.rollup === "charges" || column.unit.startsWith("$") : false;
  const paidByRow = new Map(payments.map((payment) => [payment.readingId, payment.amountCents]));
  return MONTHS.map((label, i) => {
    const month = String(i + 1).padStart(2, "0");
    const cur = rows.find((row) => row.date.startsWith(`${year}-${month}`));
    const prev = rows.find((row) => row.date.startsWith(`${year - 1}-${month}`));
    const value = (row: SheetRow | undefined) => {
      if (!row || row.computed[key] == null) return null;
      const n = row.computed[key]!;
      return money ? Math.round(n * 100) / 100 : Math.round(n * 1000) / 1000;
    };
    const compare = cur ? chargeCompare(cur, columns) : null;
    const paidCents = cur ? paidByRow.get(cur.id) : undefined;
    return {
      label,
      lastYear: value(prev),
      thisYear: value(cur),
      paid: paidCents != null ? paidCents / 100 : null,
      statement: compare?.statementCents != null ? compare.statementCents / 100 : null,
      lineGap: Boolean(
        compare && compare.chargesCents != null && compare.statementCents != null && compare.chargesCents !== compare.statementCents,
      ),
    };
  });
}

function walk(start: number, usages: number[]): number[] {
  const meters = [start];
  for (const usage of usages) meters.push(meters[meters.length - 1]! + usage);
  return meters;
}

function splitBill(cents: number, usage: number): Record<string, number> {
  const bill = cents / 100;
  const energy = Math.round(bill * 0.62 * 100) / 100;
  const delivery = Math.round(bill * 0.22 * 100) / 100;
  const riders = Math.round(bill * 0.09 * 100) / 100;
  const taxes = Math.round((bill - energy - delivery - riders) * 100) / 100;
  return {
    generation_kwh: Math.max(0, Math.round(usage * 0.12)),
    energy_charge: energy,
    delivery_charge: delivery,
    riders,
    taxes_fees: taxes,
  };
}

/** Typical month for a small harbor apartment with electric heat. Index 1 = January. */
const POWER_MONTH_KWH = [0, 392, 360, 304, 236, 188, 162, 150, 158, 172, 206, 274, 348];
/** Garage charger. Summer trips and December run a little higher. */
const TESLA_MONTH_KWH = [0, 34, 32, 38, 42, 46, 54, 58, 50, 44, 40, 36, 48];

export function sampleUtilityPack(dates: string[]): {
  utilities: { id: string; name: string; unit: string; provider: string; parentId: string | null; tiers: RateTier[] }[];
  readings: ReadLike[];
  utilColumns: UtilColumn[];
} {
  const powerUse: number[] = [];
  const teslaUse: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const cal = Number(dates[i]!.slice(5, 7));
    const yearBack = Math.floor((dates.length - 1 - i) / 12);
    const winter = cal <= 2 || cal === 12;
    const powerDrift = yearBack === 0 ? 0 : yearBack === 1 ? (winter ? 16 : 8) : winter ? 24 : 12;
    const teslaDrift = yearBack >= 2 ? -4 : yearBack === 1 ? 2 : 0;
    powerUse.push((POWER_MONTH_KWH[cal] ?? 200) + powerDrift);
    teslaUse.push(Math.max(22, (TESLA_MONTH_KWH[cal] ?? 40) + teslaDrift));
  }
  // The live demo is the latest three periods: weather (170 vs 154, 54 vs 38) and the $21.08 tier on 170 kWh.
  const powerTail = [146, 154, 170];
  const teslaTail = [48, 38, 54];
  for (let k = 0; k < 3 && powerUse.length >= 3; k++) {
    powerUse[powerUse.length - 3 + k] = powerTail[k]!;
    teslaUse[teslaUse.length - 3 + k] = teslaTail[k]!;
  }
  const powerMeters = walk(5140, powerUse);
  const teslaMeters = walk(880, teslaUse);
  const last = dates.length - 1;
  const fixed: Record<number, number> = last >= 3 ? { [last - 2]: 8800, [last - 1]: 9600, [last]: 10800 } : {};
  const readings: ReadLike[] = [];
  dates.forEach((date, i) => {
    const usage = i === 0 ? 0 : powerUse[i - 1]!;
    const amountCents = i === 0 ? 0 : (fixed[i] ?? usage * 62);
    readings.push({
      id: `read-${i}`,
      utilityId: "util-power",
      date,
      meter: powerMeters[i]!,
      amountCents,
      opening: i === 0,
      cells: i === 0 ? {} : splitBill(amountCents, usage),
    });
    readings.push({
      id: `tesla-${i}`,
      utilityId: "util-tesla",
      date,
      meter: teslaMeters[i]!,
      amountCents: 0,
      opening: i === 0,
      cells: {},
    });
  });
  return {
    utilities: [
      { id: "util-power", name: "Harbor Electric", unit: "kWh", provider: "Harbor Electric", parentId: null, tiers: SAMPLE_POWER_TIERS },
      { id: "util-tesla", name: "Garage Tesla", unit: "kWh", provider: "Home charger", parentId: "util-power", tiers: [] },
    ],
    readings,
    utilColumns: [...starterColumns("util-power", "electric"), ...starterColumns("util-tesla", "blank", "kWh")],
  };
}

export type ChargeCompare = {
  statementCents: number | null;
  chargesCents: number | null;
  chargesError: string | null;
};

/** Statement is the bill rollup. Line items are the charges rollup, when that column exists. */
export function chargeCompare(row: SheetRow, columns: UtilColumn[]): ChargeCompare {
  const billKey = columns.find((c) => c.rollup === "bill")?.key;
  const chargesKey = columns.find((c) => c.rollup === "charges")?.key;
  const statement = billKey != null && row.computed[billKey] != null ? Math.round(row.computed[billKey]! * 100) : null;
  const chargesError = chargesKey ? (row.errors[chargesKey] ?? null) : null;
  const charges =
    chargesKey && !chargesError && row.computed[chargesKey] != null ? Math.round(row.computed[chargesKey]! * 100) : null;
  return { statementCents: statement, chargesCents: charges, chargesError };
}

/** Same bill-month only. A previous-month read is offered in the picker, never preselected. */
export function suggestReadingId(readings: ReadLike[], utilityId: string, paidOn: string): string | null {
  const month = paidOn.slice(0, 7);
  const rows = readings
    .filter((r) => r.utilityId === utilityId && !r.opening && r.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date));
  return rows[0]?.id ?? null;
}

export function previousMonth(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Seasonal Calder household history. Payments exist only once the due date has arrived. */
export type CalderReading = {
  stamp: string;
  readOn: string;
  meter: number | null;
  amountCents: number;
  opening: boolean;
  cells: Record<string, number>;
};

export type CalderUtility = {
  key: string;
  name: string;
  unit: string;
  provider: string;
  parentKey: string | null;
  template: string;
  tiers: RateTier[];
  renames?: { key: string; label: string }[];
  extraColumns?: { key: string; label: string; kind: ColumnKind; unit?: string; formula?: string; rollup?: Rollup }[];
  formulaEdits?: { key: string; formula: string }[];
  dropRollups?: Rollup[];
  readings: CalderReading[];
  payments: { stamp: string; paidOn: string; amountCents: number }[];
  bill: { id: string; merchant: string; category: string; account: "checking" | "card"; memo: string; amountCents: number } | null;
};

const POWER: RateTier[] = [
  { name: "First 400", upTo: 400, rateCents: 12.4 },
  { name: "Over 400", upTo: null, rateCents: 18.6 },
];

const HOUSE: Record<number, { kwh: number; ev: number; gen: number; therms: number }> = {
  1: { kwh: 820, ev: 248, gen: 42, therms: 68 },
  2: { kwh: 760, ev: 232, gen: 71, therms: 55 },
  3: { kwh: 680, ev: 214, gen: 118, therms: 41 },
  4: { kwh: 540, ev: 196, gen: 162, therms: 27 },
  5: { kwh: 490, ev: 184, gen: 188, therms: 16 },
  6: { kwh: 570, ev: 172, gen: 206, therms: 11 },
  7: { kwh: 750, ev: 168, gen: 214, therms: 9 },
  8: { kwh: 810, ev: 164, gen: 198, therms: 10 },
  9: { kwh: 690, ev: 176, gen: 154, therms: 14 },
  10: { kwh: 560, ev: 182, gen: 112, therms: 22 },
  11: { kwh: 610, ev: 204, gen: 68, therms: 36 },
  12: { kwh: 790, ev: 236, gen: 40, therms: 62 },
};

const WATER_CCF: Record<number, number> = { 1: 8, 2: 7, 3: 7, 4: 8, 5: 11, 6: 15, 7: 19, 8: 18, 9: 14, 10: 11, 11: 8, 12: 8 };

function onDay(today: string, monthsBack: number, day: number): string {
  const [y, m] = today.split("-").map(Number);
  const cursor = new Date(Date.UTC(y!, (m ?? 1) - 1 - monthsBack, 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, last));
  return cursor.toISOString().slice(0, 10);
}

function addIsoDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  cursor.setUTCDate(cursor.getUTCDate() + n);
  return cursor.toISOString().slice(0, 10);
}

function datesOn(today: string, day: number): string[] {
  const out: string[] = [];
  for (let back = 21; back >= 0; back -= 1) {
    const date = onDay(today, back, day);
    if (date <= today) out.push(date);
  }
  return out;
}

function dollars(cents: number): number {
  return Math.round(cents) / 100;
}

function electricParts(month: number, usage: number, therms: number) {
  const energy = tierChargeCents(usage, POWER);
  const delivery = Math.round((usage * 0.108 + 14.2) * 100);
  const riders = Math.round((usage * 0.031 + 3.5) * 100);
  const gas = therms ? Math.round((therms * 2.18 + 11.5) * 100) : 0;
  const taxes = Math.round((energy + delivery + riders + gas) * 0.072);
  const shownTaxes = month === 8 ? taxes - 640 : taxes;
  return { energy, delivery, riders, gas, taxes: shownTaxes, statement: energy + delivery + riders + gas + taxes };
}

function waterParts(ccf: number) {
  const water = Math.round((ccf * 4.15 + 22) * 100);
  const sewer = Math.round((ccf * 1.85 + 31) * 100);
  const storm = 540;
  const taxes = Math.round((water + sewer + storm) * 0.05);
  return { water, sewer, storm, taxes, statement: water + sewer + storm + taxes };
}

export function calderUtilityHistory(today: string): CalderUtility[] {
  const electricDates = datesOn(today, 6);
  const waterDates = datesOn(today, 8);
  const billDates = datesOn(today, 1);
  let electricMeter = 41280;
  let evMeter = 860;
  let waterMeter = 2214;
  const electric: CalderReading[] = [];
  const ev: CalderReading[] = [];
  const electricPays: CalderUtility["payments"] = [];
  const firstElectric = electricDates[0];
  if (firstElectric) {
    const open = addIsoDays(firstElectric, -32);
    electric.push({ stamp: "open", readOn: open, meter: electricMeter, amountCents: 0, opening: true, cells: {} });
    ev.push({ stamp: "open", readOn: open, meter: evMeter, amountCents: 0, opening: true, cells: {} });
  }
  for (const readOn of electricDates) {
    const month = Number(readOn.slice(5, 7));
    const use = HOUSE[month]!;
    electricMeter += use.kwh;
    evMeter += use.ev;
    const parts = electricParts(month, use.kwh, use.therms);
    const stamp = readOn.slice(0, 7).replace("-", "");
    electric.push({
      stamp,
      readOn,
      meter: electricMeter,
      amountCents: parts.statement,
      opening: false,
      cells: {
        generation_kwh: use.gen,
        energy_charge: dollars(parts.energy),
        delivery_charge: dollars(parts.delivery),
        riders: dollars(parts.riders),
        taxes_fees: dollars(parts.taxes),
        gas_therms: use.therms,
        gas_charge: dollars(parts.gas),
      },
    });
    ev.push({ stamp, readOn, meter: evMeter, amountCents: 0, opening: false, cells: {} });
    const paidOn = addIsoDays(readOn, 12);
    if (paidOn <= today) electricPays.push({ stamp, paidOn, amountCents: parts.statement });
  }
  const water: CalderReading[] = [];
  const waterPays: CalderUtility["payments"] = [];
  const firstWater = waterDates[0];
  if (firstWater) water.push({ stamp: "open", readOn: addIsoDays(firstWater, -31), meter: waterMeter, amountCents: 0, opening: true, cells: {} });
  for (const readOn of waterDates) {
    const ccf = WATER_CCF[Number(readOn.slice(5, 7))] ?? 8;
    waterMeter += ccf;
    const parts = waterParts(ccf);
    const stamp = readOn.slice(0, 7).replace("-", "");
    water.push({
      stamp,
      readOn,
      meter: waterMeter,
      amountCents: parts.statement,
      opening: false,
      cells: {
        water_charge: dollars(parts.water),
        sewer_charge: dollars(parts.sewer),
        stormwater: dollars(parts.storm),
        taxes_fees: dollars(parts.taxes),
      },
    });
    const paidOn = addIsoDays(readOn, 14);
    if (paidOn <= today) waterPays.push({ stamp, paidOn, amountCents: parts.statement });
  }
  const phone: CalderReading[] = [];
  const net: CalderReading[] = [];
  const phonePays: CalderUtility["payments"] = [];
  const netPays: CalderUtility["payments"] = [];
  for (const readOn of billDates) {
    const month = Number(readOn.slice(5, 7));
    const stamp = readOn.slice(0, 7).replace("-", "");
    const equipment = month === 6 ? 18 : 0;
    const phoneCents = (80 + 15 + equipment) * 100;
    phone.push({
      stamp,
      readOn,
      meter: null,
      amountCents: phoneCents,
      opening: false,
      cells: {
        plan_amount: 80,
        equipment,
        surcharges: 15,
        minutes: 760 + month * 18,
        data_mb: 24000 + month * 900,
      },
    });
    const netEquipment = month === 3 ? 15 : 10;
    const netTaxes = month % 6 === 0 ? 4.8 : 0;
    const netCents = Math.round((70 + netEquipment + netTaxes) * 100);
    net.push({
      stamp,
      readOn,
      meter: null,
      amountCents: netCents,
      opening: false,
      cells: { subscription: 70, add_ons: netEquipment, taxes_fees: netTaxes },
    });
    const phonePaid = `${readOn.slice(0, 8)}06`;
    const netPaid = `${readOn.slice(0, 8)}09`;
    if (phonePaid <= today) phonePays.push({ stamp, paidOn: phonePaid, amountCents: phoneCents });
    if (netPaid <= today) netPays.push({ stamp, paidOn: netPaid, amountCents: netCents });
  }
  const latest = (rows: CalderReading[]) => rows.filter((r) => !r.opening).at(-1)?.amountCents ?? 0;
  return [
    {
      key: "pge",
      name: "PG&E electric",
      unit: "kWh",
      provider: "PG&E",
      parentKey: null,
      template: "electric",
      tiers: POWER,
      extraColumns: [
        { key: "gas_therms", label: "Gas therms", kind: "number", unit: "therms" },
        { key: "gas_charge", label: "Gas charge", kind: "money", unit: "$" },
      ],
      formulaEdits: [{ key: "bill_sum", formula: "{energy_charge} + {delivery_charge} + {riders} + {taxes_fees} + {gas_charge}" }],
      readings: electric,
      payments: electricPays,
      bill: { id: "b_pge", merchant: "PG&E", category: "Utilities", account: "checking", memo: "Electric and gas", amountCents: latest(electric) },
    },
    {
      key: "ev",
      name: "Garage charger",
      unit: "kWh",
      provider: "Home charger",
      parentKey: "pge",
      template: "blank",
      tiers: [],
      dropRollups: ["bill"],
      readings: ev,
      payments: [],
      bill: null,
    },
    {
      key: "water",
      name: "EBMUD water",
      unit: "CCF",
      provider: "EBMUD",
      parentKey: null,
      template: "water",
      tiers: [],
      readings: water,
      payments: waterPays,
      bill: { id: "b_water", merchant: "EBMUD", category: "Utilities", account: "checking", memo: "Water and wastewater", amountCents: latest(water) },
    },
    {
      key: "phone",
      name: "T-Mobile",
      unit: "none",
      provider: "T-Mobile",
      parentKey: null,
      template: "cellular",
      tiers: [],
      extraColumns: [
        { key: "read_on", label: "Bill date", kind: "date", rollup: "readDate" },
        { key: "charges_sum", label: "Charges sum", kind: "calculated", unit: "$", formula: "{plan_amount} + {equipment} + {surcharges}", rollup: "charges" },
      ],
      readings: phone,
      payments: phonePays,
      bill: { id: "b_phone", merchant: "T-Mobile", category: "Phone", account: "card", memo: "Family plan", amountCents: latest(phone) },
    },
    {
      key: "net",
      name: "Xfinity",
      unit: "none",
      provider: "Xfinity",
      parentKey: null,
      template: "streaming",
      tiers: [],
      renames: [
        { key: "subscription", label: "Internet" },
        { key: "add_ons", label: "Equipment" },
        { key: "taxes_fees", label: "Taxes" },
      ],
      extraColumns: [
        { key: "read_on", label: "Bill date", kind: "date", rollup: "readDate" },
        { key: "charges_sum", label: "Charges sum", kind: "calculated", unit: "$", formula: "{subscription} + {add_ons} + {taxes_fees}", rollup: "charges" },
      ],
      readings: net,
      payments: netPays,
      bill: { id: "b_net", merchant: "Xfinity", category: "Internet", account: "checking", memo: "Internet", amountCents: latest(net) },
    },
  ];
}

const UTILITY_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Columns a CSV may fill. Calculated, day-count, child-sum, and the read date stay out. */
export function importTargets<T extends { kind: string; rollup: string; fromChildren?: boolean }>(columns: T[]): T[] {
  return columns.filter((column) =>
    (column.kind === "number" || column.kind === "money") &&
    column.rollup !== "readDate" &&
    column.rollup !== "days" &&
    !column.fromChildren,
  );
}

/** The latest read dated before this one. That is the "last month" a new read can copy. */
export function priorRead<T extends { readOn: string }>(readings: T[], readOn: string): T | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readOn)) return null;
  let best: T | null = null;
  for (const reading of readings) {
    if (reading.readOn >= readOn) continue;
    if (!best || reading.readOn > best.readOn) best = reading;
  }
  return best;
}

/** A column's typed value on a read. Meter and bill fall back to the stored rollup. */
export function carriedValue(
  column: { key: string; rollup: string },
  reading: { meter: number | null; amountCents: number; cells: Record<string, number> },
): number | null {
  const cell = reading.cells[column.key];
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  if (column.rollup === "meter" && reading.meter != null && Number.isFinite(reading.meter)) return reading.meter;
  if (column.rollup === "bill" && Number.isFinite(reading.amountCents)) return reading.amountCents / 100;
  return null;
}

/** A utility CSV date. Month and year are required. A missing day becomes the first of the month. */
export function utilityReadDate(raw: string): { month: string; readOn: string } | null {
  const text = raw.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  const iso = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/.exec(text);
  if (iso) return packUtilityDate(iso[1]!, iso[2]!, iso[3]);
  const us = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (us) {
    const first = Number(us[1]);
    const second = Number(us[2]);
    if (first > 12 && second <= 12) return packUtilityDate(us[3]!, us[2]!, us[1]);
    return packUtilityDate(us[3]!, us[1]!, us[2]);
  }
  const monthYear = /^(\d{1,2})[-/](\d{4})$/.exec(text);
  if (monthYear) return packUtilityDate(monthYear[2]!, monthYear[1]!);
  const named = /^([a-z]+)\s+(\d{4})$/i.exec(text);
  if (named) {
    const month = UTILITY_MONTHS[named[1]!.toLowerCase()];
    if (month) return packUtilityDate(named[2]!, String(month));
  }
  const namedDay = /^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/i.exec(text);
  if (namedDay) {
    const month = UTILITY_MONTHS[namedDay[1]!.toLowerCase()];
    if (month) return packUtilityDate(namedDay[3]!, String(month), namedDay[2]);
  }
  const dayNamed = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(text);
  if (dayNamed) {
    const month = UTILITY_MONTHS[dayNamed[2]!.toLowerCase()];
    if (month) return packUtilityDate(dayNamed[3]!, String(month), dayNamed[1]);
  }
  return null;
}

function packUtilityDate(yearRaw: string, monthRaw: string, dayRaw?: string): { month: string; readOn: string } | null {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = dayRaw == null || dayRaw === "" ? 1 : Number(dayRaw);
  if (!Number.isInteger(day) || day < 1 || day > last) return null;
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return { month: `${year}-${monthText}`, readOn: `${year}-${monthText}-${dayText}` };
}

/** Blank means the cell is ignored. An error means the cell was present but not a number. */
export function parseUtilityNumber(raw: string): { blank: true } | { value: number } | { error: true } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "–") return { blank: true };
  const negative = /^\(.*\)$/.test(trimmed);
  const n = Number(trimmed.replace(/[$,\s]/g, "").replace(/[()]/g, ""));
  if (!Number.isFinite(n)) return { error: true };
  return { value: negative ? -Math.abs(n) : n };
}

export function readCsvTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]!).map((cell, index) => cell || `Column ${index + 1}`);
  const rows = lines.slice(1).map(splitCsvLine).filter((row) => row.some((cell) => cell.trim()));
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function columnName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Suggest a date column and value columns from the header labels. */
export function guessUtilityMap(
  headers: string[],
  columns: { key: string; label: string }[],
): { dateIndex: number | null; mapping: Record<number, string> } {
  let dateIndex: number | null = null;
  headers.forEach((header, index) => {
    if (dateIndex != null) return;
    const name = columnName(header);
    if (name === "date" || name === "read date" || name === "read on" || name === "bill date" || name === "month" || name.endsWith(" date")) dateIndex = index;
  });
  const mapping: Record<number, string> = {};
  const used = new Set<string>();
  headers.forEach((header, index) => {
    if (index === dateIndex) return;
    const name = columnName(header);
    const hit = columns.find((column) => !used.has(column.key) && (columnName(column.label) === name || columnName(column.key) === name));
    if (!hit) return;
    used.add(hit.key);
    mapping[index] = hit.key;
  });
  return { dateIndex, mapping };
}

export type UtilityCsvDiff = { key: string; before: number | null; after: number };

export type UtilityCsvRow = {
  line: number;
  month: string;
  readOn: string;
  readingId: string | null;
  blocked: string;
  problems: string[];
  values: Record<string, number>;
  diffs: UtilityCsvDiff[];
};

/** Match CSV rows to reads by calendar month. A later row for a month already in the file is left for the user to pick. */
export function planUtilityCsv(
  tableRows: string[][],
  dateIndex: number,
  mapping: { index: number; key: string }[],
  readings: { id: string; readOn: string; cells: Record<string, number> }[],
): UtilityCsvRow[] {
  const byMonth = new Map<string, { id: string; cells: Record<string, number> }[]>();
  for (const reading of readings) {
    const month = reading.readOn.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push({ id: reading.id, cells: reading.cells });
    byMonth.set(month, list);
  }
  return tableRows.map((cells, index) => {
    const line = index + 2;
    const parsed = utilityReadDate(cells[dateIndex] ?? "");
    if (!parsed) {
      return { line, month: "", readOn: "", readingId: null, blocked: "This row needs a month and a year.", problems: [], values: {}, diffs: [] };
    }
    const problems: string[] = [];
    const values: Record<string, number> = {};
    for (const column of mapping) {
      const parsedNumber = parseUtilityNumber(cells[column.index] ?? "");
      if ("error" in parsedNumber) problems.push(column.key);
      else if ("value" in parsedNumber) values[column.key] = parsedNumber.value;
    }
    if (problems.length) {
      return { line, month: parsed.month, readOn: parsed.readOn, readingId: null, blocked: "A mapped cell is not a number.", problems, values: {}, diffs: [] };
    }
    const hits = byMonth.get(parsed.month) ?? [];
    if (hits.length > 1) {
      return { line, month: parsed.month, readOn: parsed.readOn, readingId: null, blocked: "This month already has more than one read, so it was left alone.", problems: [], values, diffs: [] };
    }
    const hit = hits[0];
    const diffs: UtilityCsvDiff[] = [];
    if (hit) {
      for (const [key, after] of Object.entries(values)) {
        const before = hit.cells[key] ?? null;
        if (before == null || Math.abs(before - after) >= 0.0005) diffs.push({ key, before, after });
      }
    }
    return { line, month: parsed.month, readOn: parsed.readOn, readingId: hit?.id ?? null, blocked: "", problems: [], values, diffs };
  });
}

