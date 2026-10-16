import type {
  Account,
  Asset,
  Bill,
  Category,
  CreditScore,
  FilingStatus,
  Goal,
  PlanMonth,
  Profile,
  Reminder,
  Rule,
  Txn,
  Watch,
} from "./types";

export const DEPOSITORY = new Set(["checking", "savings", "cash", "investment"]);
export const DEBT = new Set(["credit", "loan", "mortgage"]);

const RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
/** Tops of the 10% through 35% brackets for tax year 2026 (IRS Rev. Proc. 2025-32). */
const BRACKET_TOPS: Record<FilingStatus, number[]> = {
  single: [12400, 50400, 105700, 201775, 256225, 640600],
  mfj: [24800, 100800, 211400, 403550, 512450, 768700],
  mfs: [12400, 50400, 105700, 201775, 256225, 384350],
  hoh: [17700, 67450, 105700, 201750, 256200, 640600],
};
export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 1610000,
  mfj: 3220000,
  mfs: 1610000,
  hoh: 2415000,
};

const MERCHANT_DICT: [string, string][] = [
  ["whole foods", "Groceries"],
  ["trader joe", "Groceries"],
  ["safeway", "Groceries"],
  ["costco", "Groceries"],
  ["grocery", "Groceries"],
  ["netflix", "Subscriptions"],
  ["spotify", "Subscriptions"],
  ["hulu", "Subscriptions"],
  ["icloud", "Subscriptions"],
  ["pg&e", "Utilities"],
  ["pge", "Utilities"],
  ["pacific gas", "Utilities"],
  ["ebmud", "Utilities"],
  ["water", "Utilities"],
  ["comcast", "Internet"],
  ["xfinity", "Internet"],
  ["verizon", "Phone"],
  ["t-mobile", "Phone"],
  ["at&t", "Phone"],
  ["shell", "Gas"],
  ["chevron", "Gas"],
  ["uber", "Transit"],
  ["lyft", "Transit"],
  ["starbucks", "Dining"],
  ["blue bottle", "Dining"],
  ["doordash", "Dining"],
  ["restaurant", "Dining"],
  ["payroll", "Paycheck"],
  ["gusto", "Paycheck"],
  ["direct dep", "Paycheck"],
  ["dividend", "Dividends"],
  ["interest paid", "Interest"],
  ["geico", "Insurance"],
  ["state farm", "Insurance"],
  ["kaiser", "Health"],
  ["pharmacy", "Health"],
  ["cvs", "Health"],
  ["target", "Shopping"],
  ["amazon", "Shopping"],
  ["home depot", "Shopping"],
  ["goodwill", "Charity"],
  ["charity", "Charity"],
  ["mortgage interest", "Mortgage interest"],
  ["property tax", "Property tax"],
];

export function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

export function signedMoney(cents: number, currency = "USD"): string {
  const abs = money(Math.abs(cents), currency);
  if (cents > 0) return `+${abs}`;
  if (cents < 0) return `−${abs}`;
  return abs;
}

export function dollarsToCents(raw: string): number {
  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmtISO(d);
}

export function prettyDate(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseISODate(iso));
}

export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, (m || 1) - 1, 1)));
}

export function periodOf(iso: string, startDay: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  let year = y;
  let month = m;
  if ((d || 1) < Math.max(1, startDay)) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodStart(period: string, startDay: number): string {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(1, startDay), last);
  return fmtISO(new Date(Date.UTC(y, m - 1, d)));
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodEnd(period: string, startDay: number): string {
  return addDays(periodStart(shiftPeriod(period, 1), startDay), -1);
}

export function inRange(iso: string, from: string, to: string): boolean {
  return iso >= from && iso <= to;
}

export function stepDue(iso: string, cadence: string): string {
  if (cadence === "weekly") return addDays(iso, 7);
  if (cadence === "biweekly") return addDays(iso, 14);
  if (cadence === "quarterly") return addMonths(iso, 3);
  if (cadence === "yearly") return addMonths(iso, 12);
  return addMonths(iso, 1);
}

export function occurrences(nextDue: string, cadence: string, from: string, until: string): string[] {
  let d = nextDue;
  let guard = 0;
  while (d < from && guard < 400) {
    d = stepDue(d, cadence);
    guard += 1;
  }
  const out: string[] = [];
  while (d <= until && guard < 800) {
    out.push(d);
    d = stepDue(d, cadence);
    guard += 1;
  }
  return out;
}

export function monthlyEquivalent(amountCents: number, cadence: string): number {
  if (cadence === "weekly") return Math.round((amountCents * 52) / 12);
  if (cadence === "biweekly") return Math.round((amountCents * 26) / 12);
  if (cadence === "quarterly") return Math.round(amountCents / 3);
  if (cadence === "yearly") return Math.round(amountCents / 12);
  return amountCents;
}

export function zillowHref(address: string): string {
  const q = encodeURIComponent(address.trim());
  return `https://www.zillow.com/homes/${q}_rb/`;
}

export function parsePairs(json: string): { k: string; v: string }[] {
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is { k: string; v?: unknown } => !!x && typeof x === "object" && "k" in x)
      .map((x) => ({ k: String(x.k), v: String(x.v ?? "") }));
  } catch {
    return [];
  }
}

export function matchCategory(
  merchant: string,
  memo: string,
  rules: Pick<Rule, "pattern" | "categoryId" | "priority">[],
  categories: Pick<Category, "id" | "name">[],
): string | null {
  const hay = `${merchant} ${memo}`.toLowerCase();
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    const needle = rule.pattern.trim().toLowerCase();
    if (needle && hay.includes(needle)) return rule.categoryId;
  }
  for (const [needle, name] of MERCHANT_DICT) {
    if (!hay.includes(needle)) continue;
    const cat = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (cat) return cat.id;
  }
  return null;
}

export function balanceDelta(kind: string, amountCents: number): number {
  if (DEPOSITORY.has(kind)) return amountCents;
  if (DEBT.has(kind)) return -amountCents;
  return amountCents;
}

export function isLiquid(kind: string): boolean {
  return kind === "checking" || kind === "savings" || kind === "cash";
}

export function netWorthParts(accounts: Account[], assets: Asset[]) {
  let cash = 0;
  let investments = 0;
  let debts = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    if (isLiquid(a.kind)) cash += a.balanceCents;
    else if (a.kind === "investment") investments += a.balanceCents;
    else if (DEBT.has(a.kind)) debts += a.balanceCents;
  }
  const property = assets.reduce((s, a) => s + a.valueCents, 0);
  const assetsTotal = cash + investments + property;
  return {
    cash,
    investments,
    property,
    debts,
    assets: assetsTotal,
    net: assetsTotal - debts,
  };
}

export function assetEquity(asset: Asset, accounts: Account[]): number {
  const loan = accounts.find((a) => a.id === asset.loanAccountId);
  return asset.valueCents - (loan ? loan.balanceCents : 0);
}

export type SpendSlice = { id: string; name: string; cents: number };

export function parseTags(raw: unknown): string[] {
  const s = Array.isArray(raw) ? raw.join(",") : String(raw ?? "").trim();
  if (!s) return [];
  let parts: string[] = [];
  if (!Array.isArray(raw) && s.startsWith("[")) {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) parts = v.map((x) => String(x));
    } catch {
      parts = s.split(",");
    }
  } else parts = s.split(",");
  const out: string[] = [];
  for (const p of parts) {
    const tag = p.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!tag) continue;
    if (out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function packTags(tags: unknown): string {
  return JSON.stringify(parseTags(tags));
}

export function hasTag(tags: string[], tag: string): boolean {
  const n = tag.trim().toLowerCase();
  if (!n) return true;
  return tags.some((t) => t.toLowerCase() === n);
}

export function allTags(txns: { tags: string[] }[]): string[] {
  const map = new Map<string, string>();
  for (const t of txns) {
    for (const tag of t.tags) {
      const key = tag.toLowerCase();
      if (!map.has(key)) map.set(key, tag);
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

export function matchTxnFilters(t: { personId: string | null; tags: string[] }, filters: { personId?: string; tag?: string }): boolean {
  if (filters.personId === "household" && t.personId) return false;
  if (filters.personId && filters.personId !== "household" && t.personId !== filters.personId) return false;
  if (filters.tag && !hasTag(t.tags, filters.tag)) return false;
  return true;
}

export function spendingByCategory(
  txns: Txn[],
  categories: Category[],
  from: string,
  to: string,
  flow: "out" | "in" = "out",
): SpendSlice[] {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (!inRange(t.postedOn, from, to)) continue;
    const cat = categories.find((c) => c.id === t.categoryId);
    const catFlow = cat?.flow ?? (t.amountCents >= 0 ? "in" : "out");
    if (flow === "out" && (catFlow === "in" || catFlow === "transfer" || t.amountCents >= 0)) continue;
    if (flow === "in" && (catFlow !== "in" || t.amountCents <= 0)) continue;
    const id = t.categoryId ?? "uncategorized";
    const amt = flow === "out" ? Math.abs(Math.min(0, t.amountCents)) : t.amountCents;
    map.set(id, (map.get(id) ?? 0) + amt);
  }
  return [...map.entries()]
    .map(([id, cents]) => ({
      id,
      name: categories.find((c) => c.id === id)?.name ?? "Uncategorized",
      cents,
    }))
    .filter((s) => s.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
}

export function topMerchants(txns: Txn[], from: string, to: string): SpendSlice[] {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (!inRange(t.postedOn, from, to) || t.amountCents >= 0) continue;
    const name = t.merchant || "Unknown";
    map.set(name, (map.get(name) ?? 0) + Math.abs(t.amountCents));
  }
  return [...map.entries()]
    .map(([name, cents]) => ({ id: name, name, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 6);
}

export type PlanRow = {
  category: Category;
  assigned: number;
  spent: number;
  rolloverIn: number;
  available: number;
};

export function planModel(
  categories: Category[],
  txns: Txn[],
  plan: PlanMonth[],
  month: string,
  startDay: number,
): { rows: PlanRow[]; income: number; assignedTotal: number; leftToAssign: number; leftInPlan: number } {
  const expense = categories.filter((c) => c.flow === "out" && !c.archived);
  const cache = new Map<string, number>();
  const earliestTxn = txns.reduce((min, t) => (!min || t.postedOn < min ? t.postedOn : min), "");
  const assignedOf = (cat: Category, m: string) => {
    const row = plan.find((p) => p.categoryId === cat.id && p.month === m);
    if (row) return row.assignedCents;
    return cat.monthlyCents;
  };
  const spentOf = (catId: string, m: string) => {
    const from = periodStart(m, startDay);
    const to = periodEnd(m, startDay);
    let s = 0;
    for (const t of txns) {
      if (t.categoryId === catId && inRange(t.postedOn, from, to) && t.amountCents < 0) {
        s += Math.abs(t.amountCents);
      }
    }
    return s;
  };
  const availableOf = (cat: Category, m: string): number => {
    const key = `${cat.id}:${m}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const assigned = assignedOf(cat, m);
    const spent = spentOf(cat.id, m);
    let rolloverIn = 0;
    if (cat.rollover) {
      const prev = shiftPeriod(m, -1);
      const prevEnd = periodEnd(prev, startDay);
      const floor = addMonths(periodStart(month, startDay), -14);
      if (earliestTxn && prevEnd >= earliestTxn && prevEnd >= floor) {
        rolloverIn = availableOf(cat, prev);
      }
    }
    const available = rolloverIn + assigned - spent;
    cache.set(key, available);
    return available;
  };
  const rows: PlanRow[] = expense
    .map((category) => {
      const assigned = assignedOf(category, month);
      const spent = spentOf(category.id, month);
      const available = availableOf(category, month);
      const rolloverIn = category.rollover ? available - assigned + spent : 0;
      return { category, assigned, spent, rolloverIn, available };
    })
    .sort((a, b) => a.category.sort - b.category.sort || a.category.name.localeCompare(b.category.name));

  const from = periodStart(month, startDay);
  const to = periodEnd(month, startDay);
  let income = 0;
  for (const t of txns) {
    if (!inRange(t.postedOn, from, to) || t.amountCents <= 0) continue;
    const cat = categories.find((c) => c.id === t.categoryId);
    if (cat && cat.flow !== "in") continue;
    income += t.amountCents;
  }
  const assignedTotal = rows.reduce((s, r) => s + r.assigned, 0);
  const leftInPlan = rows.reduce((s, r) => s + r.available, 0);
  const rtaCache = new Map<string, number>();
  const rta = (m: string): number => {
    const hit = rtaCache.get(m);
    if (hit !== undefined) return hit;
    const f = periodStart(m, startDay);
    const t = periodEnd(m, startDay);
    let inc = 0;
    for (const txn of txns) {
      if (!inRange(txn.postedOn, f, t) || txn.amountCents <= 0) continue;
      const cat = categories.find((c) => c.id === txn.categoryId);
      if (cat && cat.flow !== "in") continue;
      inc += txn.amountCents;
    }
    const hasPlan = plan.some((p) => p.month === m);
    const assigned =
      inc > 0 || hasPlan || m === month ? expense.reduce((s, c) => s + assignedOf(c, m), 0) : 0;
    const prev = shiftPeriod(m, -1);
    const prevEnd = periodEnd(prev, startDay);
    const carry = earliestTxn && prevEnd >= earliestTxn ? rta(prev) : 0;
    const value = inc + carry - assigned;
    rtaCache.set(m, value);
    return value;
  };
  return { rows, income, assignedTotal, leftToAssign: rta(month), leftInPlan };
}

export type CashPoint = { date: string; balance: number; label: string };

export function projectCash(opts: {
  today: string;
  days: number;
  accounts: Account[];
  bills: Bill[];
  categories: Category[];
  startDay: number;
}): { points: CashPoint[]; events: { date: string; label: string; cents: number }[]; low: CashPoint } {
  const liquid = opts.accounts.filter((a) => !a.archived && isLiquid(a.kind));
  let balance = liquid.reduce((s, a) => s + a.balanceCents, 0);
  const until = addDays(opts.today, opts.days);
  const events: { date: string; label: string; cents: number }[] = [];
  for (const bill of opts.bills) {
    if (bill.status !== "active") continue;
    const signed = bill.direction === "in" ? bill.amountCents : -bill.amountCents;
    for (const date of occurrences(bill.nextDue, bill.cadence, opts.today, until)) {
      events.push({ date, label: bill.name, cents: signed });
    }
  }
  const monthCursor = periodOf(opts.today, opts.startDay);
  for (let i = 0; i < 14; i++) {
    const m = shiftPeriod(monthCursor, i);
    const when = periodStart(m, opts.startDay);
    if (when < opts.today || when > until) continue;
    for (const cat of opts.categories) {
      if (cat.flow !== "out" || cat.archived || cat.monthlyCents <= 0) continue;
      const billed = opts.bills
        .filter((b) => b.status === "active" && b.categoryId === cat.id && b.direction !== "in")
        .reduce((s, b) => s + monthlyEquivalent(b.amountCents, b.cadence), 0);
      const extra = cat.monthlyCents - billed;
      if (extra > 0) events.push({ date: when, label: `Planned · ${cat.name}`, cents: -extra });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const points: CashPoint[] = [{ date: opts.today, balance, label: "Today" }];
  let low = points[0];
  const byDate = new Map<string, typeof events>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  for (let i = 0; i <= opts.days; i++) {
    const date = addDays(opts.today, i);
    const dayEvents = byDate.get(date);
    if (!dayEvents) continue;
    const delta = dayEvents.reduce((s, e) => s + e.cents, 0);
    balance += delta;
    const label = dayEvents.map((e) => e.label).join(", ");
    const point = { date, balance, label };
    points.push(point);
    if (point.balance < low.balance) low = point;
  }
  return { points, events, low };
}

export function federalTaxCents(taxableCents: number, status: FilingStatus): number {
  const taxable = Math.max(0, taxableCents) / 100;
  const tops = BRACKET_TOPS[status];
  const floors = [0, ...tops];
  let tax = 0;
  for (let i = 0; i < RATES.length; i++) {
    const lo = floors[i] ?? 0;
    const hi = i + 1 < floors.length ? floors[i + 1]! : Number.POSITIVE_INFINITY;
    if (taxable <= lo) break;
    tax += (Math.min(taxable, hi) - lo) * RATES[i]!;
  }
  return Math.round(tax * 100);
}

export function marginalRate(taxableCents: number, status: FilingStatus): number {
  const base = federalTaxCents(taxableCents, status);
  const next = federalTaxCents(taxableCents + 100000, status);
  return Math.round(((next - base) / 100000) * 1000) / 1000;
}

export type ScheduleLine = { line: string; cents: number; count: number };

export function taxLines(txns: Txn[], categories: Category[], year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const lines = new Map<string, ScheduleLine>();
  const bump = (schedule: string, line: string, cents: number) => {
    if (!schedule) return;
    const key = `${schedule}:${line || "other"}`;
    const cur = lines.get(key) ?? { line: line || "other", cents: 0, count: 0 };
    cur.cents += cents;
    cur.count += 1;
    lines.set(key, cur);
  };
  for (const t of txns) {
    if (!inRange(t.postedOn, from, to)) continue;
    const cat = categories.find((c) => c.id === t.categoryId);
    const schedule = t.taxSchedule || cat?.taxSchedule || "";
    const line = t.taxLine || cat?.taxLine || "";
    if (!schedule) continue;
    bump(schedule, line, Math.abs(t.amountCents));
  }
  const of = (schedule: string) =>
    [...lines.entries()]
      .filter(([k]) => k.startsWith(`${schedule}:`))
      .map(([, v]) => v);
  return { A: of("A"), B: of("B"), C: of("C"), D: of("D"), E: of("E"), F: of("F") };
}

export function lineSum(lines: ScheduleLine[], name: string): number {
  return lines.filter((l) => l.line === name).reduce((s, l) => s + l.cents, 0);
}

export type TaxEstimate = {
  agi: number;
  deduction: number;
  deductionLabel: string;
  taxable: number;
  federal: number;
  state: number;
  total: number;
  paid: number;
  remaining: number;
  marginal: number;
  itemized: number;
  medicalAllowed: number;
  saltAllowed: number;
  safeHarbor: number;
  nextVoucher: string;
  vouchersLeft: number;
};

export function estimateTax(profile: Profile, txns: Txn[], categories: Category[], today: string): TaxEstimate {
  const year = Number(today.slice(0, 4));
  const pack = taxLines(txns, categories, year);
  const agi = Math.max(0, profile.wagesCents + profile.otherIncomeCents);
  const medical = lineSum(pack.A, "medical");
  const medicalAllowed = Math.max(0, medical - Math.round(agi * 0.075));
  const saltAllowed = Math.min(lineSum(pack.A, "salt"), Math.max(0, profile.saltCapCents));
  const mortgage = lineSum(pack.A, "mortgage_interest");
  const charity = lineSum(pack.A, "charity");
  const itemized = medicalAllowed + saltAllowed + mortgage + charity + lineSum(pack.A, "other");
  const standard = STANDARD_DEDUCTION[profile.filingStatus];
  let deduction = standard;
  let deductionLabel = "Standard deduction";
  if (profile.deductionMode === "itemized" || (profile.deductionMode === "auto" && itemized > standard)) {
    deduction = itemized;
    deductionLabel = "Itemized (Schedule A)";
  }
  if (profile.deductionMode === "standard") {
    deduction = standard;
    deductionLabel = "Standard deduction";
  }
  const taxable = Math.max(0, agi - deduction);
  const federal = federalTaxCents(taxable, profile.filingStatus);
  const state = Math.round((taxable * profile.stateRateBps) / 10000);
  const total = federal + state;
  const paid = profile.withholdingCents + profile.estimatedPaidCents;
  const remaining = total - paid;
  const high = agi > 15_000_000;
  const safeHarbor = Math.round(profile.priorYearTaxCents * (high ? 1.1 : 1));
  const due = ["04-15", "06-15", "09-15", "01-15"];
  const md = today.slice(5);
  let vouchersLeft = 0;
  let nextVoucher = `${year + 1}-01-15`;
  for (const d of due) {
    const stamp = d === "01-15" ? `${year + 1}-01-15` : `${year}-${d}`;
    if (stamp >= today) {
      if (vouchersLeft === 0) nextVoucher = stamp;
      vouchersLeft += 1;
    }
  }
  if (md > "01-15" && md < "04-15" && today.endsWith(String(year))) {
    /* already counted */
  }
  return {
    agi,
    deduction,
    deductionLabel,
    taxable,
    federal,
    state,
    total,
    paid,
    remaining,
    marginal: marginalRate(taxable, profile.filingStatus),
    itemized,
    medicalAllowed,
    saltAllowed,
    safeHarbor,
    nextVoucher,
    vouchersLeft: Math.max(1, vouchersLeft),
  };
}

export type AlertItem = {
  key: string;
  title: string;
  body: string;
  href: string;
  severity: "info" | "warn" | "urgent";
};

export function evaluateAlerts(input: {
  today: string;
  startDay: number;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  bills: Bill[];
  goals: Goal[];
  watches: Watch[];
  reminders: Reminder[];
  scores: CreditScore[];
  planRows: PlanRow[];
}): AlertItem[] {
  const out: AlertItem[] = [];
  const month = periodOf(input.today, input.startDay);
  const from = periodStart(month, input.startDay);
  const to = periodEnd(month, input.startDay);
  for (const bill of input.bills) {
    if (bill.status !== "active" || bill.direction === "in") continue;
    const days = Math.round(
      (parseISODate(bill.nextDue).getTime() - parseISODate(input.today).getTime()) / 86400000,
    );
    if (days >= 0 && days <= 7) {
      out.push({
        key: `bill:${bill.id}:${bill.nextDue}`,
        title: days === 0 ? `${bill.name} is due today` : `${bill.name} is due in ${days} day${days === 1 ? "" : "s"}`,
        body: `${money(bill.amountCents)} · ${bill.kind}`,
        href: `/bills?bill=${bill.id}`,
        severity: days <= 2 ? "urgent" : "warn",
      });
    }
  }
  for (const row of input.planRows) {
    if (row.available < 0) {
      out.push({
        key: `over:${row.category.id}:${month}`,
        title: `${row.category.name} is over plan`,
        body: `${money(Math.abs(row.available))} past what's available`,
        href: `/plan?category=${row.category.id}`,
        severity: "warn",
      });
    }
  }
  for (const w of input.watches) {
    if (!w.enabled) continue;
    if (w.kind === "merchant") {
      const spent = input.txns
        .filter(
          (t) =>
            inRange(t.postedOn, from, to) &&
            t.amountCents < 0 &&
            t.merchant.toLowerCase().includes(w.refName.toLowerCase()),
        )
        .reduce((s, t) => s + Math.abs(t.amountCents), 0);
      if (compare(spent, w.comparator, w.thresholdCents)) {
        out.push({
          key: `watch:${w.id}:${month}`,
          title: w.name,
          body: `${w.refName} is ${money(spent)} this month`,
          href: `/transactions?q=${encodeURIComponent(w.refName)}`,
          severity: "warn",
        });
      }
    } else if (w.kind === "category") {
      const spent = input.txns
        .filter((t) => inRange(t.postedOn, from, to) && t.categoryId === w.refId && t.amountCents < 0)
        .reduce((s, t) => s + Math.abs(t.amountCents), 0);
      if (compare(spent, w.comparator, w.thresholdCents)) {
        out.push({
          key: `watch:${w.id}:${month}`,
          title: w.name,
          body: `${money(spent)} against ${money(w.thresholdCents)}`,
          href: `/transactions?category=${w.refId}`,
          severity: "warn",
        });
      }
    } else if (w.kind === "balance") {
      const acct = input.accounts.find((a) => a.id === w.refId);
      if (acct && compare(acct.balanceCents, w.comparator, w.thresholdCents)) {
        out.push({
          key: `watch:${w.id}:${input.today}`,
          title: w.name,
          body: `${acct.name} is ${money(acct.balanceCents)}`,
          href: `/accounts?account=${acct.id}`,
          severity: "urgent",
        });
      }
    } else if (w.kind === "goal") {
      const goal = input.goals.find((g) => g.id === w.refId);
      if (goal && goal.targetDate) {
        const pace = goalPace(goal, input.today);
        if (pace.behindCents > w.thresholdCents) {
          out.push({
            key: `watch:${w.id}:${month}`,
            title: w.name,
            body: `${goal.name} is ${money(pace.behindCents)} behind pace`,
            href: `/goals?goal=${goal.id}`,
            severity: "info",
          });
        }
      }
    }
  }
  for (const r of input.reminders) {
    if (r.done) continue;
    const days = Math.round(
      (parseISODate(r.dueOn).getTime() - parseISODate(input.today).getTime()) / 86400000,
    );
    if (days <= 3) {
      out.push({
        key: `rem:${r.id}:${r.dueOn}`,
        title: r.title,
        body: days < 0 ? "Overdue" : days === 0 ? "Today" : `In ${days} days`,
        href: r.href || `/reminders?reminder=${r.id}`,
        severity: days <= 0 ? "urgent" : "info",
      });
    }
  }
  const cards = input.accounts.filter((a) => a.kind === "credit" && !a.archived && a.limitCents);
  const owed = cards.reduce((s, a) => s + a.balanceCents, 0);
  const limit = cards.reduce((s, a) => s + (a.limitCents ?? 0), 0);
  if (limit > 0 && owed / limit > 0.3) {
    out.push({
      key: `util:${month}`,
      title: "Credit use is above 30%",
      body: `${Math.round((owed / limit) * 100)}% of your limits · see what is driving it`,
      href: "/credit",
      severity: "info",
    });
  }
  const seenPeople = new Set<string>();
  for (const s of [...input.scores].sort((a, b) => b.asOf.localeCompare(a.asOf))) {
    const who = s.personId || "household";
    if (seenPeople.has(who)) continue;
    seenPeople.add(who);
    if (s.score < 700) {
      out.push({
        key: `score:${s.id}`,
        title: `${s.bureau} score is ${s.score}`,
        body: s.factors || "Open credit for the factors on file",
        href: s.personId ? `/credit?person=${s.personId}` : "/credit",
        severity: "info",
      });
    }
  }
  const rank = { urgent: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 12);
}

function compare(value: number, op: string, threshold: number): boolean {
  if (op === "lt") return value < threshold;
  if (op === "gte") return value >= threshold;
  if (op === "lte") return value <= threshold;
  return value > threshold;
}

export function goalPace(goal: Goal, today: string): { behindCents: number; expected: number } {
  if (!goal.targetDate) return { behindCents: 0, expected: goal.savedCents };
  const start = addMonths(goal.targetDate, -12);
  const total = Math.max(1, parseISODate(goal.targetDate).getTime() - parseISODate(start).getTime());
  const elapsed = Math.min(total, Math.max(0, parseISODate(today).getTime() - parseISODate(start).getTime()));
  const expected = Math.round(goal.targetCents * (elapsed / total));
  return { behindCents: Math.max(0, expected - goal.savedCents), expected };
}

export function rangeFor(key: string, today: string, startDay: number): { from: string; to: string } {
  const period = periodOf(today, startDay);
  const year = today.slice(0, 4);
  if (key === "last") {
    const prev = shiftPeriod(period, -1);
    return { from: periodStart(prev, startDay), to: periodEnd(prev, startDay) };
  }
  if (key === "ytd") return { from: `${year}-01-01`, to: today };
  if (key === "12mo") return { from: addMonths(today, -12), to: today };
  if (key === "quarter") return { from: addMonths(today, -3), to: today };
  return { from: periodStart(period, startDay), to: periodEnd(period, startDay) };
}

export type ReportRow = { label: string; cents: number };

export function runReport(opts: {
  metric: string;
  groupBy: string;
  from: string;
  to: string;
  txns: Txn[];
  categories: Category[];
  accounts: Account[];
  people?: { id: string; name: string }[];
  personId?: string;
  tag?: string;
}): ReportRow[] {
  const rows = new Map<string, number>();
  const add = (label: string, cents: number) => rows.set(label, (rows.get(label) ?? 0) + cents);
  for (const t of opts.txns) {
    if (!inRange(t.postedOn, opts.from, opts.to)) continue;
    if (!matchTxnFilters(t, { personId: opts.personId, tag: opts.tag })) continue;
    const cat = opts.categories.find((c) => c.id === t.categoryId);
    if (cat?.flow === "transfer") continue;
    let cents = 0;
    if (opts.metric === "spending" && t.amountCents < 0) cents = Math.abs(t.amountCents);
    else if (opts.metric === "income" && t.amountCents > 0 && cat?.flow !== "out") cents = t.amountCents;
    else if (opts.metric === "net") cents = t.amountCents;
    else if (opts.metric === "merchant" && t.amountCents < 0) cents = Math.abs(t.amountCents);
    if (!cents) continue;
    if (opts.groupBy === "tag") {
      const tags = t.tags.length ? t.tags : ["Untagged"];
      for (const tag of tags) add(tag, cents);
      continue;
    }
    let label = "Other";
    if (opts.groupBy === "merchant" || opts.metric === "merchant") label = t.merchant || "Unknown";
    else if (opts.groupBy === "month") label = t.postedOn.slice(0, 7);
    else if (opts.groupBy === "account")
      label = opts.accounts.find((a) => a.id === t.accountId)?.name ?? "Account";
    else if (opts.groupBy === "person")
      label = opts.people?.find((p) => p.id === t.personId)?.name ?? "Household";
    else label = cat?.name ?? "Uncategorized";
    add(label, cents);
  }
  return [...rows.entries()]
    .map(([label, cents]) => ({ label, cents }))
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

export function personFlow(
  txns: Txn[],
  people: { id: string; name: string }[],
  from: string,
  to: string,
): { id: string; name: string; income: number; spending: number }[] {
  const buckets = new Map<string, { id: string; name: string; income: number; spending: number }>();
  for (const p of people) buckets.set(p.id, { id: p.id, name: p.name, income: 0, spending: 0 });
  const shared = { id: "", name: "Household", income: 0, spending: 0 };
  for (const t of txns) {
    if (t.postedOn < from || t.postedOn > to) continue;
    const bucket = (t.personId && buckets.get(t.personId)) || shared;
    if (t.amountCents > 0) bucket.income += t.amountCents;
    else bucket.spending += -t.amountCents;
  }
  const rows = [...buckets.values()];
  if (shared.income || shared.spending) rows.push(shared);
  return rows;
}

export function projectBalance(opts: {
  currentCents: number;
  monthlyCents: number;
  annualReturnBps: number;
  months: number;
  drag?: number;
}): { month: number; balanceCents: number }[] {
  const r = opts.annualReturnBps / 10000 / 12;
  const drag = opts.drag ?? 0;
  let bal = opts.currentCents;
  const points = [];
  for (let i = 1; i <= opts.months; i++) {
    const gain = bal * r;
    bal = bal + gain * (1 - drag) + opts.monthlyCents;
    points.push({ month: i, balanceCents: Math.round(bal) });
  }
  return points;
}

export function hitMonth(points: { month: number; balanceCents: number }[], target: number): number | null {
  return points.find((p) => p.balanceCents >= target)?.month ?? null;
}

export function utilization(accounts: Account[]): { owed: number; limit: number; ratio: number } {
  const cards = accounts.filter((a) => a.kind === "credit" && !a.archived);
  const owed = cards.reduce((s, a) => s + Math.max(0, a.balanceCents), 0);
  const limit = cards.reduce((s, a) => s + Math.max(0, a.limitCents ?? 0), 0);
  return { owed, limit, ratio: limit ? owed / limit : 0 };
}

export function parseCsv(text: string): { postedOn: string; amountCents: number; merchant: string; memo: string }[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0]!).map((h) => h.toLowerCase());
  const idx = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const dateI = idx("date", "posted");
  const descI = idx("merchant", "description", "name", "payee");
  const memoI = idx("memo", "note");
  const amtI = idx("amount");
  const debitI = idx("debit", "outflow");
  const creditI = idx("credit", "inflow");
  const start = dateI >= 0 || amtI >= 0 ? 1 : 0;
  const rows = [];
  for (const line of lines.slice(start)) {
    const cols = split(line);
    const rawDate = cols[dateI >= 0 ? dateI : 0] ?? "";
    const postedOn = normalizeDate(rawDate);
    if (!postedOn) continue;
    let amountCents = 0;
    if (amtI >= 0) amountCents = dollarsToCents(cols[amtI] ?? "0");
    else {
      const debit = dollarsToCents(cols[debitI] ?? "0");
      const credit = dollarsToCents(cols[creditI] ?? "0");
      amountCents = credit - Math.abs(debit);
    }
    const merchant = (cols[descI >= 0 ? descI : 1] ?? "Imported").replace(/^"|"$/g, "");
    const memo = memoI >= 0 ? (cols[memoI] ?? "") : "";
    rows.push({ postedOn, amountCents, merchant, memo });
  }
  return rows;
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const month = m[1]!.padStart(2, "0");
  const day = m[2]!.padStart(2, "0");
  let year = m[3]!;
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
}

export function advisorBrief(input: {
  profile: Profile;
  today: string;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  bills: Bill[];
  goals: Goal[];
  assets: Asset[];
  portfolio?: { marketCents: number; irr: number | null; dietz: number | null; dietzAnnual: number | null };
}): string {
  const nw = netWorthParts(input.accounts, input.assets);
  const month = periodOf(input.today, input.profile.monthStartDay);
  const from = periodStart(month, input.profile.monthStartDay);
  const spend = spendingByCategory(input.txns, input.categories, from, input.today);
  const upcoming = input.bills
    .filter((b) => b.status === "active")
    .slice()
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 8)
    .map((b) => `${b.name} ${b.direction === "in" ? "+" : "-"}${money(b.amountCents, input.profile.currency)} on ${b.nextDue}`)
    .join("; ");
  const accts = input.accounts
    .filter((a) => !a.archived)
    .map((a) => `${a.name} (${a.kind}) ${money(a.balanceCents, input.profile.currency)}`)
    .join("; ");
  const goalLine = input.goals
    .filter((g) => !g.archived)
    .map((g) => `${g.name} ${money(g.savedCents)} of ${money(g.targetCents)}`)
    .join("; ");
  const spendLine = spend
    .slice(0, 8)
    .map((s) => `${s.name} ${money(s.cents, input.profile.currency)}`)
    .join("; ");
  return [
    `Household: ${input.profile.displayName}. Today: ${input.today}. Currency: ${input.profile.currency}.`,
    `Net worth ${money(nw.net, input.profile.currency)} (assets ${money(nw.assets)} , debts ${money(nw.debts)}).`,
    `Accounts: ${accts || "none"}.`,
    `Spending so far in ${month}: ${spendLine || "none"}.`,
    `Upcoming bills and income: ${upcoming || "none"}.`,
    `Goals: ${goalLine || "none"}.`,
    input.portfolio
      ? `Portfolio market value ${money(input.portfolio.marketCents, input.profile.currency)}. Modified Dietz since inception ${input.portfolio.dietz == null ? "n/a" : `${(input.portfolio.dietz * 100).toFixed(1)}%`} (${input.portfolio.dietzAnnual == null ? "n/a" : `${(input.portfolio.dietzAnnual * 100).toFixed(1)}%`} annualized). Money-weighted ${input.portfolio.irr == null ? "n/a" : `${(input.portfolio.irr * 100).toFixed(1)}%`} annualized. Prices were typed by the household, not a live feed.`
      : "No portfolio lots on file.",
    `Filing status ${input.profile.filingStatus}. Do not invent numbers that are not here. If something is missing, say so.`,
  ].join("\n");
}

export const CHART_COLORS = ["#c4841d", "#2f6b4f", "#8c5a10", "#a33b2b", "#6f6458", "#1c1612", "#d7b56a", "#4e8f6d"];

const SHARE_MICROS = 1_000_000;

export function sharesToMicros(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * SHARE_MICROS);
}

export function formatShares(micros: number): string {
  const n = micros / SHARE_MICROS;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export type LotLike = {
  symbol: string;
  name?: string;
  acquiredOn: string;
  sharesMicros: number;
  costCents: number;
  closedOn: string | null;
  accountId?: string | null;
};

export type PriceLike = { symbol: string; asOf: string; priceCents: number };

export type FlowLike = {
  kind: string;
  postedOn: string;
  amountCents: number;
  external: boolean;
  symbol?: string;
};

function utcDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000;
}

export function latestPrice(prices: PriceLike[], symbol: string, today: string): number | null {
  const want = symbol.toUpperCase();
  let best: PriceLike | null = null;
  for (const p of prices) {
    if (p.symbol.toUpperCase() !== want || p.asOf > today) continue;
    if (!best || p.asOf > best.asOf) best = p;
  }
  return best ? best.priceCents : null;
}

export function lotMarketCents(lot: LotLike, priceCents: number | null): { cents: number; priced: boolean } {
  if (lot.closedOn) return { cents: 0, priced: true };
  if (lot.sharesMicros <= 0) return { cents: 0, priced: true };
  if (priceCents == null) return { cents: lot.costCents, priced: false };
  return { cents: Math.round((lot.sharesMicros / SHARE_MICROS) * priceCents), priced: true };
}

/** Money into the portfolio is positive. Money back to the household is negative. */
export function flowToPortfolio(kind: string, amountCents: number): number {
  const amt = Math.abs(amountCents);
  if (kind === "buy" || kind === "contribution") return amt;
  return -amt;
}

export function portfolioPerformance(opts: {
  lots: LotLike[];
  prices: PriceLike[];
  flows: FlowLike[];
  today: string;
}): {
  marketCents: number;
  costCents: number;
  gainCents: number;
  unpriced: string[];
  dietz: number | null;
  dietzAnnual: number | null;
  irr: number | null;
  dividendsYtd: number;
  since: string | null;
} {
  const unpriced = new Set<string>();
  let marketCents = 0;
  let costCents = 0;
  for (const lot of opts.lots) {
    if (lot.closedOn) continue;
    costCents += lot.costCents;
    const price = latestPrice(opts.prices, lot.symbol, opts.today);
    const valued = lotMarketCents(lot, price);
    marketCents += valued.cents;
    if (!valued.priced) unpriced.add(lot.symbol.toUpperCase());
  }
  const year = opts.today.slice(0, 4);
  const dividendsYtd = opts.flows
    .filter((f) => f.kind === "dividend" && f.postedOn.slice(0, 4) === year && f.postedOn <= opts.today)
    .reduce((s, f) => s + Math.abs(f.amountCents), 0);
  const external = opts.flows
    .filter((f) => f.external && f.amountCents !== 0 && f.postedOn <= opts.today)
    .map((f) => ({ date: f.postedOn, into: flowToPortfolio(f.kind, f.amountCents) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const since = external[0]?.date ?? null;
  const dietz = since ? modifiedDietz(since, opts.today, marketCents, external) : null;
  return {
    marketCents,
    costCents,
    gainCents: marketCents - costCents,
    unpriced: [...unpriced],
    dietz,
    dietzAnnual: since && dietz != null ? annualize(dietz, since, opts.today) : null,
    irr: since ? xirr(irrRows(external, opts.today, marketCents)) : null,
    dividendsYtd,
    since,
  };
}

function annualize(total: number, start: string, end: string): number | null {
  const days = utcDay(end) - utcDay(start);
  if (days <= 0) return null;
  const ann = Math.pow(1 + total, 365 / days) - 1;
  return Number.isFinite(ann) ? ann : null;
}

function irrRows(external: { date: string; into: number }[], today: string, marketCents: number) {
  const rows = external.map((f) => ({ date: f.date, amountCents: -f.into }));
  const last = rows[rows.length - 1];
  if (last && last.date === today) last.amountCents += marketCents;
  else rows.push({ date: today, amountCents: marketCents });
  return rows;
}

export function modifiedDietz(
  start: string,
  end: string,
  endValueCents: number,
  flows: { date: string; into: number }[],
): number | null {
  const days = utcDay(end) - utcDay(start);
  if (days <= 0) return null;
  let net = 0;
  let weighted = 0;
  for (const f of flows) {
    if (f.date < start || f.date > end) continue;
    const remain = utcDay(end) - utcDay(f.date);
    net += f.into;
    weighted += f.into * (remain / days);
  }
  if (weighted === 0) return null;
  const gain = endValueCents - net;
  const rate = gain / weighted;
  return Number.isFinite(rate) ? rate : null;
}

/** Annual money-weighted return. Null when the cash flows do not change sign. */
export function xirr(flows: { date: string; amountCents: number }[]): number | null {
  const rows = flows.filter((f) => f.amountCents !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) return null;
  if (!rows.some((r) => r.amountCents > 0) || !rows.some((r) => r.amountCents < 0)) return null;
  const t0 = utcDay(rows[0].date);
  const npv = (rate: number) =>
    rows.reduce((sum, row) => {
      const years = (utcDay(row.date) - t0) / 365;
      return sum + row.amountCents / Math.pow(1 + rate, years);
    }, 0);
  const slope = (rate: number) =>
    rows.reduce((sum, row) => {
      const years = (utcDay(row.date) - t0) / 365;
      return sum + (-years * row.amountCents) / Math.pow(1 + rate, years + 1);
    }, 0);
  let rate = 0.1;
  for (let i = 0; i < 60; i += 1) {
    const y = npv(rate);
    const dy = slope(rate);
    if (!Number.isFinite(y) || !Number.isFinite(dy) || Math.abs(dy) < 1e-8) return null;
    const next = rate - y / dy;
    if (!Number.isFinite(next) || next <= -0.999) return null;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = next;
  }
  return Number.isFinite(rate) ? rate : null;
}
