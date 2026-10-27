import { createHash, randomBytes } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { balanceDelta, holdingTerm, LEDGER_LINES, annotateJar, historyStart, importMatches, matchCategory, otherTransferAccount, packTags, parseTags, portfolioPerformance, shiftDays, stepDue, todayISO, transferMatches } from "./calc";
import { readReceipt, removeReceipt, removeUserFiles, writeReceipt } from "./files.server";
import { parseTiers, starterColumns, templateUnit, DAYS_FORMULA, USAGE_FORMULA } from "./utility";
import { clearHousehold, ensureJars, ensureLeaseInvoices, ensureSampleBusiness, ensureSampleInvestments, ensureSamplePeople, ensureSampleSale, ensureSampleTags, ensureSampleUtilities, seedBlank, seedHousehold, seedPersonalCategories, seedStarter } from "./seed";
import { recordAudit } from "./care.server";
import { personEmail } from "./person";
import type {
  AccessRow,
  Account,
  Action,
  ActionResult,
  AiMessage,
  ApiKeyPublic,
  Asset,
  Bill,
  Category,
  Contact,
  Contribution,
  CreditScore,
  DocumentRow,
  Draw,
  FilingStatus,
  Goal,
  Invoice,
  Lease,
  LedgerBook,
  Lot,
  MileageTrip,
  Milestone,
  Payment,
  Person,
  PlanMonth,
  PortfolioFlow,
  Profile,
  Realization,
  Reminder,
  Report,
  RetirementSketch,
  Role,
  Rule,
  SecurityPrice,
  Snapshot,
  Txn,
  UtilityColumn,
  Valuation,
  Watch,
  Workspace,
} from "./types";

const FILING = new Set(["single", "mfj", "mfs", "hoh"]);
const AI = new Set(["grok", "openai", "ollama"]);

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}
function str(v: unknown, max = 240): string {
  return String(v ?? "").trim().slice(0, max);
}
function dateOr(v: unknown, fallback: string): string {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}
function nid(): string {
  return randomBytes(9).toString("hex");
}
function symbolOf(v: unknown): string {
  return str(v, 12).toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}
function stamp(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s || null;
}

async function scope(sql: Sql, userId: string, ownerId?: string): Promise<{ owner: string; role: Role }> {
  const owner = ownerId && ownerId !== userId ? ownerId : userId;
  if (owner === userId) return { owner, role: "owner" };
  const rows = await sql<{ role: string }>`
    select role from book_access
    where owner_user_id = ${owner} and member_user_id = ${userId} and status = 'active'
  `;
  const role = rows[0]?.role;
  if (role !== "editor" && role !== "viewer" && role !== "advisor") {
    throw new Error("You don't have access to that household.");
  }
  return { owner, role };
}

function assertEdit(role: Role) {
  if (role !== "owner" && role !== "editor") throw new Error("You have view-only access.");
}
function assertOwner(role: Role) {
  if (role !== "owner") throw new Error("Only the household owner can change that.");
}

async function ensureProfile(sql: Sql, userId: string) {
  await sql`insert into profiles (user_id) values (${userId}) on conflict do nothing`;
}

async function ensureSeed(sql: Sql, userId: string) {
  const rows = await sql<{ initialized: boolean; seeded: boolean }>`select initialized, seeded from profiles where user_id = ${userId}`;
  if (!rows[0]?.initialized) {
    await seedBlank(sql, userId);
    return;
  }
  if (!rows[0].seeded) {
    await ensureJars(sql, userId);
    await ensureLeaseInvoices(sql, userId);
    return;
  }
  await ensureSamplePeople(sql, userId);
  await ensureSampleTags(sql, userId);
  await ensureSampleInvestments(sql, userId);
  await ensureSampleBusiness(sql, userId);
  await ensureSampleSale(sql, userId);
  await ensureSampleUtilities(sql, userId);
  const plain = await sql`
    select 1 from utility_columns
    where user_id = ${userId} and kind = 'number' and formula = '' and rollup in ('days', 'usage')
    limit 1
  `;
  if (plain.length) {
    await sql`
      update utility_columns set kind = 'calculated', formula = ${DAYS_FORMULA}
      where user_id = ${userId} and rollup = 'days' and kind = 'number' and formula = ''
        and meter_id in (select meter_id from utility_columns where user_id = ${userId} and rollup = 'meter')
    `;
    await sql`
      update utility_columns set kind = 'calculated', formula = ${USAGE_FORMULA}
      where user_id = ${userId} and rollup = 'usage' and kind = 'number' and formula = ''
        and meter_id in (select meter_id from utility_columns where user_id = ${userId} and rollup = 'meter')
    `;
  }
  await ensureJars(sql, userId);
  await ensureLeaseInvoices(sql, userId);
}

function mapProfile(row: Record<string, unknown>): Profile {
  const filing = String(row.filing_status);
  const ai = String(row.ai_provider);
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    currency: String(row.currency || "USD"),
    filingStatus: (FILING.has(filing) ? filing : "single") as FilingStatus,
    stateCode: String(row.state_code ?? ""),
    dependents: num(row.dependents),
    wagesCents: num(row.wages_cents),
    otherIncomeCents: num(row.other_income_cents),
    withholdingCents: num(row.withholding_cents),
    estimatedPaidCents: num(row.estimated_paid_cents),
    priorYearTaxCents: num(row.prior_year_tax_cents),
    deductionMode: (["auto", "standard", "itemized"].includes(String(row.deduction_mode))
      ? String(row.deduction_mode)
      : "auto") as Profile["deductionMode"],
    saltCapCents: num(row.salt_cap_cents, 1000000),
    stateRateBps: num(row.state_rate_bps),
    navHidden: String(row.nav_hidden ?? ""),
    aiProvider: (AI.has(ai) ? ai : "grok") as Profile["aiProvider"],
    openaiKeySet: String(row.openai_key ?? "").length > 0,
    openaiModel: String(row.openai_model || "gpt-4.1-mini"),
    ollamaUrl: String(row.ollama_url || "http://127.0.0.1:11434"),
    ollamaModel: String(row.ollama_model || "llama3.1"),
    vaultSalt: String(row.vault_salt ?? ""),
    vaultVerifier: String(row.vault_verifier ?? ""),
    seeded: Boolean(row.seeded),
    initialized: Boolean(row.initialized),
    monthStartDay: Math.min(28, Math.max(1, num(row.month_start_day, 1))),
  };
}

export async function loadWorkspace(
  userId: string,
  ownerId?: string,
  opts?: { window?: boolean; focusLedgerId?: string; txnSince?: string },
): Promise<Workspace> {
  return readWorkspace(await getSql(), userId, ownerId, opts);
}

export async function readWorkspace(
  sql: Sql,
  userId: string,
  ownerId?: string,
  opts?: { window?: boolean; focusLedgerId?: string; txnSince?: string },
): Promise<Workspace> {
  await ensureProfile(sql, userId);
  const scoped = await scope(sql, userId, ownerId);
  if (scoped.owner === userId) await ensureSeed(sql, userId);
  const owner = scoped.owner;
  const today = todayISO();
  const since = opts?.window ? (opts.txnSince && /^\d{4}-\d{2}-\d{2}$/.test(opts.txnSince) && opts.txnSince < historyStart(today) ? opts.txnSince : historyStart(today)) : "";
  const profileRows = await sql<Record<string, unknown>>`select * from profiles where user_id = ${owner}`;
  if (!profileRows[0]) throw new Error("Household not found.");

  const [accounts, categories, rules, people, transactions, bills, payments, assets, valuations, snapshots, goals, contributions, plan, watches, reads, reminders, documents, scores, milestones, lots, prices, flows, sketches, ledgers, draws, reports, invoices, mileage, leases, realizations, keys, messages, invites, shared, meters, utilColumns, utilReadings] =
    await Promise.all([
      sql<Record<string, unknown>>`select * from accounts where user_id = ${owner} order by name`,
      sql<Record<string, unknown>>`select * from categories where user_id = ${owner} order by sort, name`,
      sql<Record<string, unknown>>`select * from rules where user_id = ${owner} order by priority desc`,
      sql<Record<string, unknown>>`select * from people where user_id = ${owner} order by sort, name`,
      since
        ? sql<Record<string, unknown>>`select * from transactions where user_id = ${owner} and posted_on >= ${since} order by posted_on desc, merchant`
        : sql<Record<string, unknown>>`select * from transactions where user_id = ${owner} order by posted_on desc, merchant`,
      sql<Record<string, unknown>>`select * from bills where user_id = ${owner} order by next_due`,
      sql<Record<string, unknown>>`select * from bill_payments where user_id = ${owner} order by paid_on desc`,
      sql<Record<string, unknown>>`select * from assets where user_id = ${owner} order by name`,
      sql<Record<string, unknown>>`select * from valuations where user_id = ${owner} order by as_of`,
      sql<Record<string, unknown>>`select * from snapshots where user_id = ${owner} order by as_of`,
      sql<Record<string, unknown>>`select * from goals where user_id = ${owner} order by priority, name`,
      sql<Record<string, unknown>>`select * from contributions where user_id = ${owner} order by contributed_on desc`,
      sql<Record<string, unknown>>`select * from plan_months where user_id = ${owner}`,
      sql<Record<string, unknown>>`select * from watchlists where user_id = ${owner} order by name`,
      sql<{ alert_key: string }>`select alert_key from alert_reads where user_id = ${owner}`,
      sql<Record<string, unknown>>`select * from reminders where user_id = ${owner} order by due_on`,
      sql<Record<string, unknown>>`select * from documents where user_id = ${owner} order by title`,
      sql<Record<string, unknown>>`select * from credit_scores where user_id = ${owner} order by as_of`,
      sql<Record<string, unknown>>`select * from milestones where user_id = ${owner} order by name`,
      sql<Record<string, unknown>>`select * from lots where user_id = ${owner} order by acquired_on, symbol`,
      sql<Record<string, unknown>>`select * from prices where user_id = ${owner} order by as_of, symbol`,
      sql<Record<string, unknown>>`select * from portfolio_flows where user_id = ${owner} order by posted_on, symbol`,
      sql<Record<string, unknown>>`select * from retirement_sketches where user_id = ${owner} order by name`,
      sql<Record<string, unknown>>`select * from ledgers where user_id = ${owner} order by sort, name`,
      sql<Record<string, unknown>>`select * from draws where user_id = ${owner} order by posted_on desc`,
      sql<Record<string, unknown>>`select * from reports where user_id = ${owner} order by name`,
      sql<Record<string, unknown>>`select * from invoices where user_id = ${owner} order by issued_on desc`,
      sql<Record<string, unknown>>`select * from mileage where user_id = ${owner} order by trip_on desc`,
      sql<Record<string, unknown>>`select * from leases where user_id = ${owner} order by tenant`,
      sql<Record<string, unknown>>`select * from realizations where user_id = ${owner} order by sold_on desc`,
      sql<Record<string, unknown>>`select id, name, prefix, created_at, last_used, expires_at from api_keys where user_id = ${owner} order by created_at desc`,
      sql<Record<string, unknown>>`select * from ai_messages where user_id = ${owner} order by created_at desc limit 40`,
      sql<Record<string, unknown>>`
        select a.*, coalesce(p.display_name, 'Household') as household_name
        from book_access a
        left join profiles p on p.user_id = a.owner_user_id
        where a.owner_user_id = ${owner}
        order by a.created_at desc
      `,
      sql<Record<string, unknown>>`
        select a.*, coalesce(p.display_name, 'Household') as household_name
        from book_access a
        left join profiles p on p.user_id = a.owner_user_id
        where a.member_user_id = ${userId} and a.status = 'active'
      `,
      sql<Record<string, unknown>>`select * from utility_meters where user_id = ${owner} order by name`,
      sql<Record<string, unknown>>`select * from utility_columns where user_id = ${owner} order by sort, label`,
      sql<Record<string, unknown>>`select * from utility_readings where user_id = ${owner} order by read_on`,
    ]);
  const contactRows = await sql<Record<string, unknown>>`select * from contacts where user_id = ${owner} order by name`;

  const mapAccess = (row: Record<string, unknown>): AccessRow => ({
    id: num(row.id),
    ownerUserId: String(row.owner_user_id),
    memberUserId: row.member_user_id ? String(row.member_user_id) : null,
    memberEmail: String(row.member_email ?? ""),
    role: String(row.role),
    inviteCode: String(row.invite_code),
    status: String(row.status),
    householdName: String(row.household_name ?? "Household"),
  });

  const startDay = Math.min(28, Math.max(1, num(profileRows[0].month_start_day, 1)));
  let books = assembleLedgers(ledgers, accounts, categories, transactions, bills, draws, rules, plan, goals, milestones, watches, reminders, documents, reports, invoices, mileage, leases, meters, utilColumns, utilReadings).map((book) =>
    annotateJar(book, today, startDay),
  );
  let txnHasMore = false;
  if (opts?.window) {
    const focus = opts.focusLedgerId || "";
    if (focus) {
      const older = await sql`select 1 from transactions where user_id = ${owner} and ledger_id = ${focus} and posted_on < ${since} limit 1`;
      txnHasMore = older.length > 0;
    }
    books = books.map((book) => (focus && book.id === focus ? book : { ...book, transactions: [] }));
  }
  const primary = books.find((b) => b.kind === "personal" && !b.archived) ?? books.find((b) => b.kind === "personal");

  return {
    today,
    ownerId: owner,
    role: scoped.role,
    profile: mapProfile(profileRows[0]),
    invites: scoped.role === "owner" ? invites.map(mapAccess) : [],
    shared: shared.map(mapAccess),
    accounts: primary?.accounts ?? [],
    categories: primary?.categories ?? [],
    rules: primary?.rules ?? [],
    people: people.map(mapPerson),
    contacts: contactRows.map(mapContact),
    transactions: primary?.transactions ?? [],
    bills: primary?.bills ?? [],
    payments: payments.map(mapPayment),
    meters: primary?.meters ?? [],
    columns: primary?.columns ?? [],
    readings: primary?.readings ?? [],
    assets: assets.map(mapAsset),
    valuations: valuations.map(mapValuation),
    snapshots: snapshots.map(mapSnapshot),
    goals: primary?.goals ?? [],
    contributions: contributions.map(mapContribution),
    plan: primary?.plan ?? [],
    watches: primary?.watches ?? [],
    readAlerts: reads.map((r) => r.alert_key),
    reminders: primary?.reminders ?? [],
    documents: primary?.documents ?? [],
    scores: scores.map(mapScore),
    milestones: primary?.milestones ?? [],
    lots: lots.map(mapLot),
    prices: prices.map(mapPrice),
    flows: flows.map(mapFlow),
    realizations: realizations.map(mapRealization),
    sketches: sketches.map(mapSketch),
    ledgers: books,
    reports: primary?.reports ?? [],
    keys: keys.map(mapKey),
    messages: messages.map(mapMessage).reverse(),
    txnHasMore,
  };
}

function mapAccount(r: Record<string, unknown>): Account {
  return {
    id: String(r.id),
    name: String(r.name),
    institution: String(r.institution ?? ""),
    kind: String(r.kind),
    mask: String(r.mask ?? ""),
    balanceCents: num(r.balance_cents),
    limitCents: r.limit_cents == null ? null : num(r.limit_cents),
    aprBps: r.apr_bps == null ? null : num(r.apr_bps),
    connected: Boolean(r.connected),
    archived: Boolean(r.archived),
    openedOn: r.opened_on ? String(r.opened_on).slice(0, 10) : null,
    customJson: String(r.custom_json ?? "[]"),
  };
}
function mapCategory(r: Record<string, unknown>): Category {
  return {
    id: String(r.id),
    name: String(r.name),
    section: String(r.section ?? "Everyday"),
    flow: String(r.flow ?? "out"),
    taxSchedule: String(r.tax_schedule ?? ""),
    taxLine: String(r.tax_line ?? ""),
    icon: String(r.icon ?? "tag"),
    monthlyCents: num(r.monthly_cents),
    rollover: Boolean(r.rollover),
    sort: num(r.sort),
    archived: Boolean(r.archived),
  };
}
function mapPerson(r: Record<string, unknown>): Person {
  const relation = String(r.relation ?? "adult");
  return {
    id: String(r.id),
    name: String(r.name),
    relation: ["adult", "child", "other"].includes(relation) ? relation : "adult",
    email: String(r.email ?? ""),
    linkedUserId: r.linked_user_id ? String(r.linked_user_id) : null,
    archived: Boolean(r.archived),
    sort: num(r.sort),
  };
}
function mapContact(r: Record<string, unknown>): Contact {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    kind: String(r.kind ?? "merchant"),
    phone: String(r.phone ?? ""),
    website: String(r.website ?? ""),
    email: String(r.email ?? ""),
    street: String(r.street ?? ""),
    city: String(r.city ?? ""),
    region: String(r.region ?? ""),
    postal: String(r.postal ?? ""),
    hours: String(r.hours ?? ""),
    notes: String(r.notes ?? ""),
  };
}
function mapRule(r: Record<string, unknown>): Rule {
  return { id: String(r.id), pattern: String(r.pattern), categoryId: String(r.category_id), priority: num(r.priority) };
}
function mapTxn(r: Record<string, unknown>): Txn {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    categoryId: r.category_id ? String(r.category_id) : null,
    postedOn: String(r.posted_on).slice(0, 10),
    amountCents: num(r.amount_cents),
    merchant: String(r.merchant ?? ""),
    memo: String(r.memo ?? ""),
    pending: Boolean(r.pending),
    taxSchedule: String(r.tax_schedule ?? ""),
    taxLine: String(r.tax_line ?? ""),
    reviewed: Boolean(r.reviewed),
    source: String(r.source ?? "manual"),
    personId: r.person_id ? String(r.person_id) : null,
    tags: parseTags(r.tags),
  };
}
function mapBill(r: Record<string, unknown>): Bill {
  return {
    id: String(r.id),
    name: String(r.name),
    payee: String(r.payee ?? ""),
    kind: String(r.kind ?? "bill"),
    direction: String(r.direction ?? "out"),
    categoryId: r.category_id ? String(r.category_id) : null,
    accountId: r.account_id ? String(r.account_id) : null,
    debtAccountId: r.debt_account_id ? String(r.debt_account_id) : null,
    amountCents: num(r.amount_cents),
    principalCents: r.principal_cents == null ? null : num(r.principal_cents),
    cadence: String(r.cadence ?? "monthly"),
    nextDue: String(r.next_due).slice(0, 10),
    autopay: Boolean(r.autopay),
    status: String(r.status ?? "active"),
    variable: Boolean(r.variable),
    notes: String(r.notes ?? ""),
    url: String(r.url ?? ""),
    personId: r.person_id ? String(r.person_id) : null,
    meterId: r.meter_id ? String(r.meter_id) : null,
    flatPay: Boolean(r.flat_pay),
  };
}
function mapPayment(r: Record<string, unknown>): Payment {
  return {
    id: String(r.id),
    billId: String(r.bill_id),
    paidOn: String(r.paid_on).slice(0, 10),
    amountCents: num(r.amount_cents),
    accountId: r.account_id ? String(r.account_id) : null,
    transactionId: r.transaction_id ? String(r.transaction_id) : null,
    readingId: r.reading_id ? String(r.reading_id) : null,
    status: String(r.status ?? "paid"),
  };
}
function parseBag(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function parseCells(raw: unknown): Record<string, number> {
  const value = parseBag(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(item);
    if (Number.isFinite(n)) out[key.slice(0, 40)] = n;
  }
  return out;
}
function mapMeter(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    name: String(r.name),
    unit: String(r.unit || "kWh"),
    provider: String(r.provider ?? ""),
    parentId: r.parent_id ? String(r.parent_id) : null,
    tiers: parseTiers(parseBag(r.tiers_json)),
  };
}
function mapUtilColumn(r: Record<string, unknown>): UtilityColumn {
  const kind = String(r.kind);
  const rollup = String(r.rollup ?? "");
  const allowed = ["meter", "usage", "bill", "days", "readDate", "charges"] as const;
  return {
    id: String(r.id),
    meterId: String(r.meter_id),
    key: String(r.key),
    label: String(r.label),
    kind: kind === "money" || kind === "calculated" || kind === "date" ? kind : "number",
    unit: String(r.unit ?? ""),
    formula: String(r.formula ?? ""),
    rollup: allowed.find((item) => item === rollup) ?? "",
    fromChildren: Boolean(r.from_children),
    sort: num(r.sort),
  };
}
function mapUtilReading(r: Record<string, unknown>) {
  const meter = r.meter_value == null || r.meter_value === "" ? null : Number(r.meter_value);
  return {
    id: String(r.id),
    meterId: String(r.meter_id),
    readOn: String(r.read_on).slice(0, 10),
    meter: meter != null && Number.isFinite(meter) ? meter : null,
    amountCents: num(r.amount_cents),
    opening: Boolean(r.opening),
    cells: parseCells(r.cells_json),
  };
}
function mapAsset(r: Record<string, unknown>): Asset {
  return {
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
    valueCents: num(r.value_cents),
    asOf: String(r.as_of).slice(0, 10),
    loanAccountId: r.loan_account_id ? String(r.loan_account_id) : null,
    address: String(r.address ?? ""),
    zillowUrl: String(r.zillow_url ?? ""),
    zestimateCents: r.zestimate_cents == null ? null : num(r.zestimate_cents),
    detail: String(r.detail ?? ""),
    customJson: String(r.custom_json ?? "[]"),
  };
}
function mapValuation(r: Record<string, unknown>): Valuation {
  return { id: String(r.id), assetId: String(r.asset_id), asOf: String(r.as_of).slice(0, 10), valueCents: num(r.value_cents), source: String(r.source ?? "manual") };
}
function mapSnapshot(r: Record<string, unknown>): Snapshot {
  return { id: String(r.id), asOf: String(r.as_of).slice(0, 10), assetsCents: num(r.assets_cents), debtsCents: num(r.debts_cents) };
}
function mapGoal(r: Record<string, unknown>): Goal {
  return {
    id: String(r.id),
    name: String(r.name),
    targetCents: num(r.target_cents),
    savedCents: num(r.saved_cents),
    targetDate: r.target_date ? String(r.target_date).slice(0, 10) : null,
    monthlyCents: num(r.monthly_cents),
    priority: num(r.priority),
    notes: String(r.notes ?? ""),
    archived: Boolean(r.archived),
  };
}
function mapContribution(r: Record<string, unknown>): Contribution {
  return { id: String(r.id), goalId: String(r.goal_id), amountCents: num(r.amount_cents), contributedOn: String(r.contributed_on).slice(0, 10), note: String(r.note ?? "") };
}
function mapPlan(r: Record<string, unknown>): PlanMonth {
  return { id: String(r.id), categoryId: String(r.category_id), month: String(r.month), assignedCents: num(r.assigned_cents) };
}
function mapWatch(r: Record<string, unknown>): Watch {
  return {
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
    refId: String(r.ref_id ?? ""),
    refName: String(r.ref_name ?? ""),
    comparator: String(r.comparator ?? "gt"),
    thresholdCents: num(r.threshold_cents),
    enabled: Boolean(r.enabled),
    note: String(r.note ?? ""),
  };
}
function mapReminder(r: Record<string, unknown>): Reminder {
  return {
    id: String(r.id),
    title: String(r.title),
    dueOn: String(r.due_on).slice(0, 10),
    href: String(r.href ?? ""),
    relatedType: String(r.related_type ?? ""),
    relatedId: String(r.related_id ?? ""),
    done: Boolean(r.done),
    repeat: String(r.repeat ?? "none"),
    notes: String(r.notes ?? ""),
  };
}
function mapDocument(r: Record<string, unknown>): DocumentRow {
  return {
    id: String(r.id),
    title: String(r.title),
    kind: String(r.kind ?? "other"),
    year: r.year == null ? null : num(r.year),
    relatedType: String(r.related_type ?? ""),
    relatedId: String(r.related_id ?? ""),
    notes: String(r.notes ?? ""),
    body: String(r.body ?? ""),
    encrypted: Boolean(r.encrypted),
    fileName: String(r.file_name ?? ""),
    mime: String(r.mime ?? ""),
  };
}
function mapScore(r: Record<string, unknown>): CreditScore {
  return {
    id: String(r.id),
    bureau: String(r.bureau),
    score: num(r.score),
    asOf: String(r.as_of).slice(0, 10),
    factors: String(r.factors ?? ""),
    personId: r.person_id ? String(r.person_id) : null,
  };
}
function mapMilestone(r: Record<string, unknown>): Milestone {
  return {
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
    targetCents: num(r.target_cents),
    targetDate: r.target_date ? String(r.target_date).slice(0, 10) : null,
    currentCents: num(r.current_cents),
    monthlyCents: num(r.monthly_cents),
    annualReturnBps: num(r.annual_return_bps),
    notes: String(r.notes ?? ""),
  };
}
function mapLot(r: Record<string, unknown>): Lot {
  return {
    id: String(r.id),
    accountId: r.account_id ? String(r.account_id) : null,
    symbol: String(r.symbol ?? "").toUpperCase(),
    name: String(r.name ?? ""),
    acquiredOn: String(r.acquired_on).slice(0, 10),
    sharesMicros: num(r.shares_micros),
    costCents: num(r.cost_cents),
    closedOn: r.closed_on ? String(r.closed_on).slice(0, 10) : null,
    notes: String(r.notes ?? ""),
  };
}
function mapPrice(r: Record<string, unknown>): SecurityPrice {
  return {
    id: String(r.id),
    symbol: String(r.symbol ?? "").toUpperCase(),
    asOf: String(r.as_of).slice(0, 10),
    priceCents: num(r.price_cents),
  };
}
function mapFlow(r: Record<string, unknown>): PortfolioFlow {
  return {
    id: String(r.id),
    lotId: r.lot_id ? String(r.lot_id) : null,
    accountId: r.account_id ? String(r.account_id) : null,
    symbol: String(r.symbol ?? "").toUpperCase(),
    kind: String(r.kind),
    postedOn: String(r.posted_on).slice(0, 10),
    amountCents: num(r.amount_cents),
    external: Boolean(r.external),
    transactionId: r.transaction_id ? String(r.transaction_id) : null,
    memo: String(r.memo ?? ""),
  };
}
function mapSketch(r: Record<string, unknown>): RetirementSketch {
  return {
    id: String(r.id),
    name: String(r.name),
    monthlyCents: num(r.monthly_cents),
    annualReturnBps: num(r.annual_return_bps, 500),
    years: Math.min(60, Math.max(1, num(r.years, 30))),
    targetCents: num(r.target_cents),
    usePortfolio: Boolean(r.use_portfolio),
    startCents: num(r.start_cents),
  };
}
function mapReport(r: Record<string, unknown>): Report {
  return {
    id: String(r.id),
    name: String(r.name),
    metric: String(r.metric),
    rangeKey: String(r.range_key ?? "month"),
    groupBy: String(r.group_by ?? "category"),
    filtersJson: String(r.filters_json ?? "{}"),
  };
}
function mapDraw(r: Record<string, unknown>): Draw {
  return {
    id: String(r.id),
    ledgerId: String(r.ledger_id),
    postedOn: String(r.posted_on).slice(0, 10),
    direction: String(r.direction),
    amountCents: num(r.amount_cents),
    bizAccountId: String(r.biz_account_id),
    homeAccountId: String(r.home_account_id),
  };
}

function mapInvoice(r: Record<string, unknown>): Invoice {
  let lines: Invoice["lines"] = [];
  try {
    const parsed = JSON.parse(String(r.lines_json ?? "[]"));
    if (Array.isArray(parsed)) {
      lines = parsed
        .map((item) => ({ description: str(item?.description, 120), amountCents: Math.max(0, num(item?.amountCents)) }))
        .filter((item) => item.description && item.amountCents > 0);
    }
  } catch {
    lines = [];
  }
  return {
    id: String(r.id),
    ledgerId: String(r.ledger_id),
    number: String(r.number),
    client: String(r.client),
    clientEmail: String(r.client_email ?? ""),
    clientAddress: String(r.client_address ?? ""),
    clientCity: String(r.client_city ?? ""),
    clientRegion: String(r.client_region ?? ""),
    clientPostal: String(r.client_postal ?? ""),
    issuedOn: String(r.issued_on).slice(0, 10),
    dueOn: String(r.due_on).slice(0, 10),
    status: String(r.status || "open"),
    notes: String(r.notes ?? ""),
    lines,
    accountId: r.account_id ? String(r.account_id) : null,
    transactionId: r.transaction_id ? String(r.transaction_id) : null,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
    leaseId: r.lease_id ? String(r.lease_id) : null,
  };
}

function mapLease(r: Record<string, unknown>): Lease {
  return {
    id: String(r.id),
    ledgerId: String(r.ledger_id),
    tenant: String(r.tenant),
    email: String(r.email ?? ""),
    address: String(r.address ?? ""),
    city: String(r.city ?? ""),
    region: String(r.region ?? ""),
    postal: String(r.postal ?? ""),
    unit: String(r.unit ?? ""),
    rentCents: num(r.rent_cents),
    dueDay: Math.min(28, Math.max(1, num(r.due_day) || 1)),
    startOn: String(r.start_on).slice(0, 10),
    endOn: r.end_on ? String(r.end_on).slice(0, 10) : null,
    depositCents: num(r.deposit_cents),
    depositHeldCents: num(r.deposit_held_cents),
    status: String(r.status || "active"),
    lastInvoiced: String(r.last_invoiced ?? ""),
    notes: String(r.notes ?? ""),
  };
}

function mapRealization(r: Record<string, unknown>): Realization {
  return {
    id: String(r.id),
    lotId: r.lot_id ? String(r.lot_id) : null,
    accountId: r.account_id ? String(r.account_id) : null,
    symbol: String(r.symbol),
    acquiredOn: String(r.acquired_on).slice(0, 10),
    soldOn: String(r.sold_on).slice(0, 10),
    sharesMicros: num(r.shares_micros),
    basisCents: num(r.basis_cents),
    proceedsCents: num(r.proceeds_cents),
    gainCents: num(r.gain_cents),
    term: String(r.term || "short"),
  };
}

function mapTrip(r: Record<string, unknown>): MileageTrip {
  return {
    id: String(r.id),
    ledgerId: String(r.ledger_id),
    on: String(r.trip_on).slice(0, 10),
    purpose: String(r.purpose),
    destination: String(r.destination ?? ""),
    use: String(r.use_type || "business"),
    milesHundredths: num(r.miles_hundredths),
    parkingCents: num(r.parking_cents),
    tollsCents: num(r.tolls_cents),
  };
}

function assembleLedgers(
  ledgers: Record<string, unknown>[],
  accounts: Record<string, unknown>[],
  categories: Record<string, unknown>[],
  transactions: Record<string, unknown>[],
  bills: Record<string, unknown>[],
  draws: Record<string, unknown>[],
  rules: Record<string, unknown>[],
  plan: Record<string, unknown>[],
  goals: Record<string, unknown>[],
  milestones: Record<string, unknown>[],
  watches: Record<string, unknown>[],
  reminders: Record<string, unknown>[],
  documents: Record<string, unknown>[],
  reports: Record<string, unknown>[],
  invoices: Record<string, unknown>[],
  mileage: Record<string, unknown>[],
  leases: Record<string, unknown>[],
  meterRows: Record<string, unknown>[],
  columnRows: Record<string, unknown>[],
  readingRows: Record<string, unknown>[],
): LedgerBook[] {
  return ledgers.map((row) => {
    const id = String(row.id);
    const kind = String(row.kind) === "personal" ? "personal" : String(row.kind) === "property" ? "property" : "business";
    const form = String(row.tax_form || "C").toUpperCase();
    return {
      id,
      name: String(row.name),
      kind,
      taxForm: kind === "personal" ? "" : form === "E" || form === "F" ? form : "C",
      activity: String(row.activity ?? ""),
      archived: Boolean(row.archived),
      accounts: accounts.filter((a) => String(a.ledger_id) === id).map(mapAccount),
      categories: categories.filter((c) => String(c.ledger_id) === id).map(mapCategory),
      transactions: transactions.filter((t) => String(t.ledger_id) === id).map(mapTxn),
      bills: bills.filter((b) => String(b.ledger_id) === id).map(mapBill),
      rules: rules.filter((r) => String(r.ledger_id ?? "") === id).map(mapRule),
      plan: plan.filter((p) => String(p.ledger_id ?? "") === id).map(mapPlan),
      goals: goals.filter((g) => String(g.ledger_id ?? "") === id).map(mapGoal),
      milestones: milestones.filter((m) => String(m.ledger_id ?? "") === id).map(mapMilestone),
      watches: watches.filter((w) => String(w.ledger_id ?? "") === id).map(mapWatch),
      reminders: reminders.filter((r) => String(r.ledger_id ?? "") === id).map(mapReminder),
      documents: documents.filter((d) => String(d.ledger_id ?? "") === id).map(mapDocument),
      reports: reports.filter((r) => String(r.ledger_id ?? "") === id).map(mapReport),
      invoices: invoices.filter((item) => String(item.ledger_id) === id).map(mapInvoice),
      trips: mileage.filter((item) => String(item.ledger_id) === id).map(mapTrip),
      leases: leases.filter((item) => String(item.ledger_id) === id).map(mapLease),
      draws: draws.filter((d) => String(d.ledger_id) === id).map(mapDraw),
      meters: meterRows.filter((m) => String(m.ledger_id) === id).map(mapMeter),
      columns: columnRows.filter((c) => meterRows.some((m) => String(m.ledger_id) === id && String(m.id) === String(c.meter_id))).map(mapUtilColumn),
      readings: readingRows.filter((r) => meterRows.some((m) => String(m.ledger_id) === id && String(m.id) === String(r.meter_id))).map(mapUtilReading),
      monthSpentCents: 0,
      yearSpentCents: 0,
      yearProfitCents: 0,
      monthIncomeCents: 0,
      monthExpenseCents: 0,
      yearIncomeCents: 0,
      yearExpenseCents: 0,
    };
  });
}

async function depositCategory(sql: Sql, owner: string, ledgerId: string) {
  const rows = await sql<{ id: string }>`
    select id from categories where user_id = ${owner} and ledger_id = ${ledgerId} and tax_line = 'deposit' limit 1
  `;
  if (rows[0]) return rows[0].id;
  const id = nid();
  await sql`
    insert into categories (id, user_id, name, section, flow, tax_schedule, tax_line, icon, monthly_cents, rollover, sort, archived, ledger_id)
    values (${id}, ${owner}, 'Security deposit', 'Equity', 'transfer', '', 'deposit', 'tag', 0, false, 90, false, ${ledgerId})
  `;
  return id;
}

async function businessLedger(sql: Sql, owner: string, ledgerId: string) {
  const rows = await sql<{ id: string; tax_form: string; kind: string }>`
    select id, tax_form, kind from ledgers where id = ${ledgerId} and user_id = ${owner} and archived = false
  `;
  if (!rows[0] || rows[0].kind === "personal") throw new Error("Invoices and mileage belong on a business or property jar.");
  return rows[0];
}

async function seedLedgerCategories(sql: Sql, owner: string, ledgerId: string, taxForm: string) {
  const lines = LEDGER_LINES[taxForm] ?? LEDGER_LINES.C!;
  let sort = 0;
  for (const [name, flow, line] of lines) {
    sort += 1;
    const section = flow === "in" ? "Income" : flow === "transfer" ? "Equity" : "Expenses";
    await sql`
      insert into categories (id, user_id, name, section, flow, tax_schedule, tax_line, icon, monthly_cents, rollover, sort, archived, ledger_id)
      values (${nid()}, ${owner}, ${name}, ${section}, ${flow}, ${flow === "transfer" ? "" : taxForm}, ${line}, 'tag', 0, false, ${sort}, false, ${ledgerId})
    `;
  }
}

function mapKey(r: Record<string, unknown>): ApiKeyPublic {
  return {
    id: String(r.id),
    name: String(r.name),
    prefix: String(r.prefix),
    createdAt: stamp(r.created_at) ?? "",
    lastUsed: stamp(r.last_used),
    expiresAt: stamp(r.expires_at),
  };
}
function mapMessage(r: Record<string, unknown>): AiMessage {
  return { id: String(r.id), role: String(r.role), content: String(r.content), createdAt: stamp(r.created_at) ?? "" };
}

async function adjust(sql: Sql, owner: string, accountId: string, amountCents: number) {
  const rows = await sql<{ kind: string }>`select kind from accounts where id = ${accountId} and user_id = ${owner}`;
  if (!rows[0]) throw new Error("Pick an account that belongs to this household.");
  const delta = balanceDelta(rows[0].kind, amountCents);
  await sql`update accounts set balance_cents = balance_cents + ${delta} where id = ${accountId} and user_id = ${owner}`;
}

async function deleteLinkedReceipts(sql: Sql, owner: string, relatedType: string, relatedId: string) {
  const docs = await sql<{ id: string }>`select id from documents where user_id = ${owner} and related_type = ${relatedType} and related_id = ${relatedId}`;
  for (const doc of docs) await removeReceipt(owner, String(doc.id));
  if (docs.length) await sql`delete from documents where user_id = ${owner} and related_type = ${relatedType} and related_id = ${relatedId}`;
}

export async function applyAction(userId: string, action: Action): Promise<ActionResult> {
  const sql = await getSql();
  await ensureProfile(sql, userId);
  if (action.type === "invite.accept") return acceptInvite(sql, userId, action.code);

  const scoped = await scope(sql, userId, action.ownerId);
  const owner = scoped.owner;
  const ownerOnly = new Set(["profile.update", "invite.create", "invite.revoke", "apikey.create", "apikey.revoke", "sample.clear", "sample.load", "household.begin", "household.blank", "account.delete", "recovery.issue"]);
  if (ownerOnly.has(action.type)) assertOwner(scoped.role);
  else assertEdit(scoped.role);

  async function openJar(): Promise<string> {
    const requested = str((action as { ledgerId?: string }).ledgerId, 80);
    if (requested) {
      const hit = await sql<{ id: string }>`select id from ledgers where id = ${requested} and user_id = ${owner} and archived = false`;
      if (hit[0]) return hit[0].id;
    }
    const personal = await sql<{ id: string }>`select id from ledgers where user_id = ${owner} and kind = 'personal' and archived = false order by sort, name limit 1`;
    if (!personal[0]) throw new Error("Add a personal jar first.");
    return personal[0].id;
  }

  switch (action.type) {
    case "profile.update": {
      const p = action.patch;
      const cur = await sql<Record<string, unknown>>`select * from profiles where user_id = ${owner}`;
      const row = cur[0];
      if (!row) throw new Error("Household not found.");
      const filing = p.filingStatus && FILING.has(p.filingStatus) ? p.filingStatus : String(row.filing_status);
      const ai = p.aiProvider && AI.has(p.aiProvider) ? p.aiProvider : String(row.ai_provider);
      const mode = p.deductionMode && ["auto", "standard", "itemized"].includes(p.deductionMode) ? p.deductionMode : String(row.deduction_mode);
      const openai = p.openaiKey === undefined ? String(row.openai_key ?? "") : str(p.openaiKey, 300);
      await sql`
        update profiles set
          display_name = ${str(p.displayName ?? row.display_name, 80) || "My household"},
          currency = ${str(p.currency ?? row.currency, 8) || "USD"},
          filing_status = ${filing},
          state_code = ${str(p.stateCode ?? row.state_code, 8).toUpperCase()},
          dependents = ${p.dependents === undefined ? num(row.dependents) : Math.max(0, num(p.dependents))},
          wages_cents = ${p.wagesCents === undefined ? num(row.wages_cents) : Math.max(0, num(p.wagesCents))},
          other_income_cents = ${p.otherIncomeCents === undefined ? num(row.other_income_cents) : num(p.otherIncomeCents)},
          withholding_cents = ${p.withholdingCents === undefined ? num(row.withholding_cents) : Math.max(0, num(p.withholdingCents))},
          estimated_paid_cents = ${p.estimatedPaidCents === undefined ? num(row.estimated_paid_cents) : Math.max(0, num(p.estimatedPaidCents))},
          prior_year_tax_cents = ${p.priorYearTaxCents === undefined ? num(row.prior_year_tax_cents) : Math.max(0, num(p.priorYearTaxCents))},
          deduction_mode = ${mode},
          salt_cap_cents = ${p.saltCapCents === undefined ? num(row.salt_cap_cents) : Math.max(0, num(p.saltCapCents))},
          state_rate_bps = ${p.stateRateBps === undefined ? num(row.state_rate_bps) : Math.max(0, Math.min(2000, num(p.stateRateBps)))},
          nav_hidden = ${str(p.navHidden ?? row.nav_hidden, 400)},
          ai_provider = ${ai},
          openai_key = ${openai},
          openai_model = ${str(p.openaiModel ?? row.openai_model, 60) || "gpt-4.1-mini"},
          ollama_url = ${str(p.ollamaUrl ?? row.ollama_url, 200) || "http://127.0.0.1:11434"},
          ollama_model = ${str(p.ollamaModel ?? row.ollama_model, 80) || "llama3.1"},
          vault_salt = ${p.vaultSalt === undefined ? String(row.vault_salt ?? "") : str(p.vaultSalt, 200)},
          vault_verifier = ${p.vaultVerifier === undefined ? String(row.vault_verifier ?? "") : str(p.vaultVerifier, 500)},
          month_start_day = ${Math.min(28, Math.max(1, p.monthStartDay === undefined ? num(row.month_start_day, 1) : num(p.monthStartDay, 1)))}
        where user_id = ${owner}
      `;
      return {};
    }
    case "account.save": {
      const a = action.account;
      const id = str(a.id, 80) || nid();
      const kinds = ["checking", "savings", "credit", "loan", "mortgage", "cash", "investment"];
      const kind = kinds.includes(String(a.kind)) ? a.kind : "checking";
      const existing = await sql`select id from accounts where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update accounts set
            name = ${str(a.name, 80)},
            institution = ${str(a.institution, 80)},
            kind = ${kind},
            mask = ${str(a.mask, 8)},
            balance_cents = ${num(a.balanceCents)},
            limit_cents = ${a.limitCents == null ? null : num(a.limitCents)},
            apr_bps = ${a.aprBps == null ? null : num(a.aprBps)},
            connected = ${Boolean(a.connected)},
            opened_on = ${a.openedOn ? dateOr(a.openedOn, todayISO()) : null},
            custom_json = ${str(a.customJson, 2000) || "[]"}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into accounts (id, user_id, name, institution, kind, mask, balance_cents, limit_cents, apr_bps, connected, archived, opened_on, custom_json, ledger_id)
          values (${id}, ${owner}, ${str(a.name, 80)}, ${str(a.institution, 80)}, ${kind}, ${str(a.mask, 8)}, ${num(a.balanceCents)}, ${a.limitCents == null ? null : num(a.limitCents)}, ${a.aprBps == null ? null : num(a.aprBps)}, ${Boolean(a.connected)}, false, ${a.openedOn ? dateOr(a.openedOn, todayISO()) : null}, ${str(a.customJson, 2000) || "[]"}, ${await openJar()})
        `;
      }
      return {};
    }
    case "account.archive": {
      await sql`update accounts set archived = ${action.archived} where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "category.save": {
      const c = action.category;
      const id = str(c.id, 80) || nid();
      const flow = ["in", "out", "transfer"].includes(String(c.flow)) ? String(c.flow) : "out";
      const existing = await sql`select id from categories where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update categories set
            name = ${str(c.name, 60)},
            section = ${str(c.section, 40) || "Everyday"},
            flow = ${flow},
            tax_schedule = ${str(c.taxSchedule, 2).toUpperCase()},
            tax_line = ${str(c.taxLine, 40)},
            icon = ${str(c.icon, 20) || "tag"},
            monthly_cents = ${Math.max(0, num(c.monthlyCents))},
            rollover = ${c.rollover !== false},
            sort = ${num(c.sort)},
            archived = ${Boolean(c.archived)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into categories (id, user_id, name, section, flow, tax_schedule, tax_line, icon, monthly_cents, rollover, sort, archived, ledger_id)
          values (${id}, ${owner}, ${str(c.name, 60)}, ${str(c.section, 40) || "Everyday"}, ${flow}, ${str(c.taxSchedule, 2).toUpperCase()}, ${str(c.taxLine, 40)}, ${str(c.icon, 20) || "tag"}, ${Math.max(0, num(c.monthlyCents))}, ${c.rollover !== false}, ${num(c.sort)}, false, ${await openJar()})
        `;
      }
      return {};
    }
    case "category.delete": {
      await sql`update transactions set category_id = null where category_id = ${action.id} and user_id = ${owner}`;
      await sql`delete from rules where category_id = ${action.id} and user_id = ${owner}`;
      await sql`delete from plan_months where category_id = ${action.id} and user_id = ${owner}`;
      await sql`delete from categories where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "rule.save": {
      const id = str(action.rule.id, 80) || nid();
      const pattern = str(action.rule.pattern, 80).toLowerCase();
      if (!pattern) throw new Error("A rule needs text to match.");
      const existing = await sql`select id from rules where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`update rules set pattern = ${pattern}, category_id = ${action.rule.categoryId}, priority = ${num(action.rule.priority)} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`insert into rules (id, user_id, pattern, category_id, priority, ledger_id) values (${id}, ${owner}, ${pattern}, ${action.rule.categoryId}, ${num(action.rule.priority)}, ${await openJar()})`;
      }
      return {};
    }
    case "rule.delete": {
      await sql`delete from rules where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "person.save": {
      const p = action.person;
      const id = str(p.id, 80) || nid();
      const name = str(p.name, 80);
      if (!name) throw new Error("A person needs a name.");
      const relation = ["adult", "child", "other"].includes(String(p.relation)) ? String(p.relation) : "adult";
      const email = personEmail(relation, p.email);
      let linked: string | null = null;
      if (email) {
        const members = await sql<{ member_user_id: string }>`
          select member_user_id from book_access
          where owner_user_id = ${owner} and lower(member_email) = ${email} and status = 'active' and member_user_id is not null
          limit 1
        `;
        linked = members[0]?.member_user_id ?? null;
      }
      const existing = await sql`select id from people where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`update people set name = ${name}, relation = ${relation}, email = ${email}, linked_user_id = ${linked}, sort = ${num(p.sort)} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`insert into people (id, user_id, name, relation, email, linked_user_id, archived, sort) values (${id}, ${owner}, ${name}, ${relation}, ${email}, ${linked}, false, ${num(p.sort)})`;
      }
      return {};
    }
    case "contact.save": {
      const c = action.contact;
      const id = str(c.id, 80) || nid();
      const name = str(c.name, 120);
      if (!name) throw new Error("Name the contact.");
      const kind = ["bank", "merchant", "utility", "other"].includes(String(c.kind)) ? String(c.kind) : "merchant";
      const existing = await sql`select id from contacts where id = ${id} and user_id = ${owner}`;
      const fields = {
        name,
        kind,
        phone: str(c.phone, 40),
        website: str(c.website, 200),
        email: str(c.email, 120),
        street: str(c.street, 120),
        city: str(c.city, 80),
        region: str(c.region, 40),
        postal: str(c.postal, 20),
        hours: str(c.hours, 240),
        notes: str(c.notes, 400),
      };
      if (existing.length) {
        await sql`
          update contacts set
            name = ${fields.name}, kind = ${fields.kind}, phone = ${fields.phone}, website = ${fields.website},
            email = ${fields.email}, street = ${fields.street}, city = ${fields.city}, region = ${fields.region},
            postal = ${fields.postal}, hours = ${fields.hours}, notes = ${fields.notes}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into contacts (id, user_id, name, kind, phone, website, email, street, city, region, postal, hours, notes)
          values (${id}, ${owner}, ${fields.name}, ${fields.kind}, ${fields.phone}, ${fields.website}, ${fields.email}, ${fields.street}, ${fields.city}, ${fields.region}, ${fields.postal}, ${fields.hours}, ${fields.notes})
        `;
      }
      return {};
    }
    case "contact.delete": {
      await sql`delete from contacts where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "contact.lookup": {
      const { lookupBusiness } = await import("./lookup");
      const lookup = await lookupBusiness(str(action.name, 120));
      if (!lookup.phone && !lookup.street && !lookup.website) throw new Error("No public phone, address, or website was found for that name.");
      return { lookup };
    }
    case "person.delete": {
      await sql`update transactions set person_id = null where person_id = ${action.id} and user_id = ${owner}`;
      await sql`update bills set person_id = null where person_id = ${action.id} and user_id = ${owner}`;
      await sql`update credit_scores set person_id = null where person_id = ${action.id} and user_id = ${owner}`;
      await sql`delete from people where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "txn.save": {
      const t = action.txn;
      const id = str(t.id, 80) || nid();
      const posted = dateOr(t.postedOn, todayISO());
      const amount = num(t.amountCents);
      const personId = str(t.personId, 80) || null;
      const tagsJson = Array.isArray(t.tags) ? packTags(t.tags) : null;
      const existing = await sql<{ account_id: string; amount_cents: number }>`
        select account_id, amount_cents from transactions where id = ${id} and user_id = ${owner}
      `;
      if (existing[0]) {
        await adjust(sql, owner, existing[0].account_id, -num(existing[0].amount_cents));
      }
      await adjust(sql, owner, t.accountId, amount);
      if (existing[0]) {
        await sql`
          update transactions set
            account_id = ${t.accountId},
            category_id = ${t.categoryId || null},
            posted_on = ${posted},
            amount_cents = ${amount},
            merchant = ${str(t.merchant, 120)},
            memo = ${str(t.memo, 240)},
            pending = ${Boolean(t.pending)},
            tax_schedule = ${str(t.taxSchedule, 2).toUpperCase()},
            tax_line = ${str(t.taxLine, 40)},
            reviewed = ${t.reviewed !== false},
            source = ${str(t.source, 20) || "manual"},
            person_id = ${personId},
            tags = coalesce(${tagsJson}, tags)
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        const acct = await sql<{ ledger_id: string }>`select ledger_id from accounts where id = ${t.accountId} and user_id = ${owner}`;
        const jar = acct[0]?.ledger_id || (await openJar());
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags, ledger_id)
          values (${id}, ${owner}, ${t.accountId}, ${t.categoryId || null}, ${posted}, ${amount}, ${str(t.merchant, 120)}, ${str(t.memo, 240)}, ${Boolean(t.pending)}, ${str(t.taxSchedule, 2).toUpperCase()}, ${str(t.taxLine, 40)}, ${t.reviewed !== false}, ${str(t.source, 20) || "manual"}, ${personId}, ${tagsJson ?? "[]"}, ${jar})
        `;
      }
      const saved = await sql<Record<string, unknown>>`select * from transactions where id = ${id} and user_id = ${owner}`;
      const accountIds = [...new Set([t.accountId, existing[0]?.account_id].filter((item): item is string => Boolean(item)))];
      const accounts: Record<string, unknown>[] = [];
      for (const accountId of accountIds) {
        const rows = await sql<Record<string, unknown>>`select * from accounts where id = ${accountId} and user_id = ${owner}`;
        if (rows[0]) accounts.push(rows[0]);
      }
      return { patch: { transactions: saved.map(mapTxn), accounts: accounts.map(mapAccount) } };
    }
    case "txn.delete": {
      const existing = await sql<{ account_id: string; amount_cents: number }>`
        select account_id, amount_cents from transactions where id = ${action.id} and user_id = ${owner}
      `;
      if (existing[0]) await adjust(sql, owner, existing[0].account_id, -num(existing[0].amount_cents));
      await deleteLinkedReceipts(sql, owner, "txn", action.id);
      await sql`delete from transactions where id = ${action.id} and user_id = ${owner}`;
      const accounts = existing[0]
        ? await sql<Record<string, unknown>>`select * from accounts where id = ${existing[0].account_id} and user_id = ${owner}`
        : [];
      return { patch: { deletedTransactionIds: [action.id], accounts: accounts.map(mapAccount) } };
    }
    case "txn.get": {
      const rows = await sql<Record<string, unknown>>`select * from transactions where id = ${action.id} and user_id = ${owner}`;
      const txn = rows[0] ? mapTxn(rows[0]) : undefined;
      return txn ? { txn, patch: { transactions: [txn] } } : {};
    }
    case "txn.match": {
      const probes = action.rows.slice(0, 500).filter((row) => row.key && row.accountId && row.postedOn);
      if (!probes.length) return { matches: [] };
      let min = probes[0]!.postedOn;
      let max = probes[0]!.postedOn;
      for (const row of probes) {
        if (row.postedOn < min) min = row.postedOn;
        if (row.postedOn > max) max = row.postedOn;
      }
      const from = shiftDays(min, -7);
      const to = shiftDays(max, 7);
      const accounts = await sql<{ id: string; name: string; mask: string }>`select id, name, mask from accounts where user_id = ${owner}`;
      const needed = new Set(probes.map((row) => row.accountId));
      for (const row of probes) {
        const other = otherTransferAccount(`${row.merchant} ${row.memo ?? ""}`, row.accountId, accounts);
        if (other) needed.add(other.id);
      }
      const found: Txn[] = [];
      for (const accountId of needed) {
        const raw = await sql<Record<string, unknown>>`
          select * from transactions
          where user_id = ${owner} and account_id = ${accountId} and posted_on >= ${from} and posted_on <= ${to}
        `;
        found.push(...raw.map(mapTxn));
      }
      return {
        matches: probes.map((row) => ({
          key: row.key,
          txns: [
            ...importMatches({ ...row, amountCents: num(row.amountCents) }, found),
            ...transferMatches({ ...row, amountCents: num(row.amountCents) }, found, accounts),
          ].slice(0, 8),
        })),
      };
    }
    case "txn.import": {
      const rows = action.rows.slice(0, 500);
      const created: Txn[] = [];
      const touched = new Set<string>();
      const directory = await sql<{ id: string; name: string; mask: string; ledger_id: string }>`
        select id, name, mask, ledger_id from accounts where user_id = ${owner}
      `;
      for (const row of rows) {
        const accountId = str(row.accountId, 80) || action.accountId;
        const posted = dateOr(row.postedOn, "");
        if (!posted || !accountId) continue;
        const acct = directory.find((account) => account.id === accountId);
        if (!acct) continue;
        const jar = acct.ledger_id || (await openJar());
        const cats = await sql<{ id: string; name: string }>`select id, name from categories where user_id = ${owner} and ledger_id = ${jar}`;
        const rules = await sql<{ pattern: string; category_id: string; priority: number }>`select pattern, category_id, priority from rules where user_id = ${owner} and ledger_id = ${jar}`;
        const chosen = str(row.categoryId, 80);
        const categoryId = chosen || matchCategory(row.merchant, row.memo, rules.map((r) => ({ pattern: r.pattern, categoryId: r.category_id, priority: num(r.priority) })), cats) || null;
        const personId = str(row.personId, 80) || null;
        const tags = packTags(row.tags ?? []);
        const id = nid();
        const amount = num(row.amountCents);
        await adjust(sql, owner, accountId, amount);
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags, ledger_id)
          values (${id}, ${owner}, ${accountId}, ${categoryId}, ${posted}, ${amount}, ${str(row.merchant, 120)}, ${str(row.memo, 240)}, false, '', '', ${categoryId ? true : false}, 'import', ${personId}, ${tags}, ${jar})
        `;
        const saved = await sql<Record<string, unknown>>`select * from transactions where id = ${id} and user_id = ${owner}`;
        created.push(...saved.map(mapTxn));
        touched.add(accountId);
        const other = otherTransferAccount(`${row.merchant} ${row.memo ?? ""}`, accountId, directory);
        const inBatch = !!other && rows.some((item) => {
          if (item === row) return false;
          const itemAccount = str(item.accountId, 80) || action.accountId;
          const itemPosted = dateOr(item.postedOn, "");
          if (itemAccount !== other.id || !itemPosted || num(item.amountCents) !== -amount) return false;
          if (itemPosted < shiftDays(posted, -7) || itemPosted > shiftDays(posted, 7)) return false;
          return otherTransferAccount(`${item.merchant} ${item.memo ?? ""}`, itemAccount, directory)?.id === accountId;
        });
        if (!other || inBatch) continue;
        const prior = await sql<{ merchant: string }>`
          select merchant from transactions
          where user_id = ${owner} and account_id = ${other.id} and amount_cents = ${-amount}
            and posted_on >= ${shiftDays(posted, -7)} and posted_on <= ${shiftDays(posted, 7)}
        `;
        if (prior.some((item) => /\b(transfer|xfer|tfr)\b/i.test(String(item.merchant)))) continue;
        const otherJar = other.ledger_id || jar;
        const transferCat = await sql<{ id: string }>`
          select id from categories where user_id = ${owner} and ledger_id = ${otherJar} and flow = 'transfer' order by name limit 1
        `;
        const last4 = acct.mask.replace(/\D/g, "").slice(-4);
        const mirror = `Transfer with ${acct.name}${last4 ? ` -${last4}` : ""}`;
        const mirrorId = nid();
        await adjust(sql, owner, other.id, -amount);
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags, ledger_id)
          values (${mirrorId}, ${owner}, ${other.id}, ${transferCat[0]?.id ?? null}, ${posted}, ${-amount}, ${mirror}, ${""}, false, '', '', true, 'import', ${personId}, ${tags}, ${otherJar})
        `;
        const mirrored = await sql<Record<string, unknown>>`select * from transactions where id = ${mirrorId} and user_id = ${owner}`;
        created.push(...mirrored.map(mapTxn));
        touched.add(other.id);
      }
      const accounts: Record<string, unknown>[] = [];
      for (const accountId of touched) {
        const fresh = await sql<Record<string, unknown>>`select * from accounts where id = ${accountId} and user_id = ${owner}`;
        if (fresh[0]) accounts.push(fresh[0]);
      }
      return { patch: { transactions: created, accounts: accounts.map(mapAccount) } };
    }
    case "txn.recategorize": {
      const jar = await openJar();
      const cats = await sql<{ id: string; name: string }>`select id, name from categories where user_id = ${owner} and ledger_id = ${jar}`;
      const rules = await sql<{ pattern: string; category_id: string; priority: number }>`select pattern, category_id, priority from rules where user_id = ${owner} and ledger_id = ${jar}`;
      const txns = await sql<{ id: string; merchant: string; memo: string; category_id: string | null; reviewed: boolean }>`
        select id, merchant, memo, category_id, reviewed from transactions where user_id = ${owner} and ledger_id = ${jar}
      `;
      const uncat = cats.find((c) => c.name === "Uncategorized")?.id;
      let changed = 0;
      for (const t of txns) {
        const loose = !t.category_id || t.category_id === uncat || !t.reviewed;
        if (!loose) continue;
        const next = matchCategory(t.merchant, String(t.memo ?? ""), rules.map((r) => ({ pattern: r.pattern, categoryId: r.category_id, priority: num(r.priority) })), cats);
        if (next && next !== t.category_id) {
          await sql`update transactions set category_id = ${next}, reviewed = true where id = ${t.id} and user_id = ${owner}`;
          changed += 1;
        }
      }
      if (!changed) throw new Error("Nothing new to categorize. Add a rule or leave a transaction uncategorized.");
      return {};
    }
    case "bill.save": {
      const b = action.bill;
      const id = str(b.id, 80) || nid();
      const cadence = ["weekly", "biweekly", "monthly", "quarterly", "yearly"].includes(String(b.cadence)) ? String(b.cadence) : "monthly";
      const existing = await sql`select id from bills where id = ${id} and user_id = ${owner}`;
      const fields = {
        name: str(b.name, 80),
        payee: str(b.payee, 80),
        kind: ["bill", "subscription", "utility"].includes(String(b.kind)) ? String(b.kind) : "bill",
        direction: b.direction === "in" ? "in" : "out",
        category_id: b.categoryId || null,
        account_id: b.accountId || null,
        debt_account_id: b.debtAccountId || null,
        amount_cents: Math.max(0, num(b.amountCents)),
        principal_cents: b.principalCents == null ? null : Math.max(0, num(b.principalCents)),
        cadence,
        next_due: dateOr(b.nextDue, todayISO()),
        autopay: Boolean(b.autopay),
        status: b.status === "paused" ? "paused" : "active",
        variable: Boolean(b.variable),
        notes: str(b.notes, 500),
        url: str(b.url, 200),
        person_id: str(b.personId, 80) || null,
        flat_pay: Boolean(b.flatPay),
      };
      const jarForBill = existing.length
        ? String((await sql<{ ledger_id: string }>`select ledger_id from bills where id = ${id} and user_id = ${owner}`)[0]?.ledger_id ?? "")
        : await openJar();
      const requestedMeter = str(b.meterId, 80);
      let meterId: string | null = null;
      if (requestedMeter) {
        const hit = await sql<{ parent_id: string | null }>`select parent_id from utility_meters where id = ${requestedMeter} and user_id = ${owner} and ledger_id = ${jarForBill}`;
        if (!hit.length) throw new Error("That meter is not on this jar.");
        if (hit[0]?.parent_id) throw new Error("Link the parent meter. A child meter is not its own bill.");
        meterId = requestedMeter;
      }
      if (existing.length) {
        await sql`
          update bills set
            name = ${fields.name}, payee = ${fields.payee}, kind = ${fields.kind}, direction = ${fields.direction},
            category_id = ${fields.category_id}, account_id = ${fields.account_id}, debt_account_id = ${fields.debt_account_id},
            amount_cents = ${fields.amount_cents}, principal_cents = ${fields.principal_cents}, cadence = ${fields.cadence},
            next_due = ${fields.next_due}, autopay = ${fields.autopay}, status = ${fields.status}, variable = ${fields.variable},
            notes = ${fields.notes}, url = ${fields.url}, person_id = ${fields.person_id},
            meter_id = ${meterId}, flat_pay = ${fields.flat_pay}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into bills (id, user_id, name, payee, kind, direction, category_id, account_id, debt_account_id, amount_cents, principal_cents, cadence, next_due, autopay, status, variable, notes, url, person_id, ledger_id, meter_id, flat_pay)
          values (${id}, ${owner}, ${fields.name}, ${fields.payee}, ${fields.kind}, ${fields.direction}, ${fields.category_id}, ${fields.account_id}, ${fields.debt_account_id}, ${fields.amount_cents}, ${fields.principal_cents}, ${fields.cadence}, ${fields.next_due}, ${fields.autopay}, ${fields.status}, ${fields.variable}, ${fields.notes}, ${fields.url}, ${fields.person_id}, ${jarForBill}, ${meterId}, ${fields.flat_pay})
        `;
      }
      return {};
    }
    case "bill.delete": {
      await deleteLinkedReceipts(sql, owner, "bill", action.id);
      await sql`delete from bills where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "bill.pay": {
      const rows = await sql<Record<string, unknown>>`select * from bills where id = ${action.id} and user_id = ${owner}`;
      const bill = rows[0] ? mapBill(rows[0]) : null;
      if (!bill) throw new Error("That bill is gone.");
      if (!bill.accountId) throw new Error("Choose an account to pay from.");
      const amount = Math.max(0, action.amountCents == null ? bill.amountCents : num(action.amountCents));
      const signed = bill.direction === "in" ? amount : -amount;
      const paidOn = dateOr(action.paidOn, todayISO());
      let readingId: string | null = null;
      if (action.readingId) {
        if (!bill.meterId) throw new Error("Link a meter on this bill before attaching a read.");
        const hit = await sql`select id from utility_readings where id = ${str(action.readingId, 80)} and user_id = ${owner} and meter_id = ${bill.meterId}`;
        if (!hit.length) throw new Error("That read is not on this bill's meter.");
        readingId = str(action.readingId, 80);
      }
      const jar = String(rows[0].ledger_id ?? "") || (await openJar());
      const txnId = nid();
      await adjust(sql, owner, bill.accountId, signed);
      await sql`
        insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, ledger_id)
        values (${txnId}, ${owner}, ${bill.accountId}, ${bill.categoryId}, ${paidOn}, ${signed}, ${bill.payee || bill.name}, ${"Recorded from " + bill.name}, false, '', '', true, 'bill', ${bill.personId}, ${jar})
      `;
      if (bill.direction !== "in" && bill.debtAccountId && bill.principalCents) {
        const principal = Math.min(bill.principalCents, amount);
        await sql`update accounts set balance_cents = greatest(0, balance_cents - ${principal}) where id = ${bill.debtAccountId} and user_id = ${owner}`;
      }
      await sql`
        insert into bill_payments (id, user_id, bill_id, paid_on, amount_cents, account_id, transaction_id, status, reading_id)
        values (${nid()}, ${owner}, ${bill.id}, ${paidOn}, ${amount}, ${bill.accountId}, ${txnId}, 'paid', ${readingId})
      `;
      const next = stepDue(bill.nextDue < paidOn ? paidOn : bill.nextDue, bill.cadence);
      await sql`update bills set next_due = ${next} where id = ${bill.id} and user_id = ${owner}`;
      return {};
    }
    case "meter.save": {
      const m = action.meter;
      const id = str(m.id, 80) || nid();
      const existing = await sql<{ ledger_id: string }>`select ledger_id from utility_meters where id = ${id} and user_id = ${owner}`;
      const jar = existing[0]?.ledger_id || (await openJar());
      const name = str(m.name, 80);
      if (!name) throw new Error("Name is required.");
      let parentId = str(m.parentId, 80) || null;
      if (parentId) {
        if (parentId === id) throw new Error("A meter cannot be its own parent.");
        const parent = await sql<{ parent_id: string | null; ledger_id: string }>`select parent_id, ledger_id from utility_meters where id = ${parentId} and user_id = ${owner}`;
        if (!parent[0] || parent[0].ledger_id !== jar) throw new Error("The parent meter is not on this jar.");
        if (parent[0].parent_id) throw new Error("A child meter cannot be a parent.");
      }
      const unit = str(m.unit, 20) || "kWh";
      const provider = str(m.provider, 80) || name;
      if (existing.length) {
        await sql`
          update utility_meters set name = ${name}, unit = ${unit}, provider = ${provider}, parent_id = ${parentId}
          where id = ${id} and user_id = ${owner}
        `;
        return {};
      }
      await sql`
        insert into utility_meters (id, user_id, ledger_id, name, unit, provider, parent_id, tiers_json)
        values (${id}, ${owner}, ${jar}, ${name}, ${unit}, ${provider}, ${parentId}, ${JSON.stringify(parseTiers(m.tiers ?? []))})
      `;
      const slug = str(action.template, 20) || "blank";
      const cols = starterColumns(id, slug, unit || templateUnit(slug));
      let sort = 0;
      for (const column of cols) {
        sort += 1;
        await sql`
          insert into utility_columns (id, user_id, meter_id, key, label, kind, unit, formula, rollup, from_children, sort)
          values (${nid()}, ${owner}, ${id}, ${column.key}, ${column.label}, ${column.kind}, ${column.unit}, ${column.formula}, ${column.rollup}, ${column.fromChildren}, ${sort})
        `;
      }
      return {};
    }
    case "meter.delete": {
      const owned = await sql<{ id: string; parent_id: string | null }>`select id, parent_id from utility_meters where user_id = ${owner}`;
      if (!owned.some((row) => row.id === action.id)) return {};
      const drop = new Set<string>([action.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const row of owned) {
          if (row.parent_id && drop.has(row.parent_id) && !drop.has(row.id)) {
            drop.add(row.id);
            grew = true;
          }
        }
      }
      for (const id of drop) {
        const reads = await sql<{ id: string }>`select id from utility_readings where user_id = ${owner} and meter_id = ${id}`;
        for (const read of reads) {
          await sql`update bill_payments set reading_id = null where user_id = ${owner} and reading_id = ${read.id}`;
        }
        await sql`delete from utility_readings where user_id = ${owner} and meter_id = ${id}`;
        await sql`delete from utility_columns where user_id = ${owner} and meter_id = ${id}`;
        await sql`update bills set meter_id = null where user_id = ${owner} and meter_id = ${id}`;
        await sql`delete from utility_meters where user_id = ${owner} and id = ${id}`;
      }
      return {};
    }
    case "meter.tiers": {
      const tiers = JSON.stringify(parseTiers(action.tiers));
      await sql`update utility_meters set tiers_json = ${tiers} where id = ${str(action.id, 80)} and user_id = ${owner}`;
      return {};
    }
    case "column.save": {
      const c = action.column;
      const meterId = str(c.meterId, 80);
      const meter = await sql`select id from utility_meters where id = ${meterId} and user_id = ${owner}`;
      if (!meter.length) throw new Error("That meter is gone.");
      const label = str(c.label, 60);
      if (!label) throw new Error("A label is required.");
      const kind = c.kind === "money" || c.kind === "calculated" || c.kind === "date" ? c.kind : "number";
      const id = str(c.id, 80) || nid();
      const current = await sql<{ id: string; key: string; rollup: string }>`select id, key, rollup from utility_columns where id = ${id} and user_id = ${owner}`;
      const key = current[0]?.key || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
      if (kind === "date") {
        const taken = await sql<{ id: string }>`select id from utility_columns where user_id = ${owner} and meter_id = ${meterId} and (rollup = 'readDate' or key = 'read_on') and id <> ${id}`;
        if (taken.length) throw new Error("This meter already has a read date.");
      }
      const rollup = kind === "date" ? "readDate" : ["meter", "usage", "bill", "days", "readDate", "charges"].includes(String(c.rollup)) ? String(c.rollup) : (current[0]?.rollup ?? "");
      const fields = {
        label,
        kind,
        unit: kind === "date" ? "" : str(c.unit, 20),
        formula: kind === "calculated" ? str(c.formula, 200) : "",
        rollup,
        from_children: kind === "date" ? false : Boolean(c.fromChildren),
      };
      if (current.length) {
        await sql`
          update utility_columns set label = ${fields.label}, kind = ${fields.kind}, unit = ${fields.unit}, formula = ${fields.formula}, rollup = ${fields.rollup}, from_children = ${fields.from_children}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        const top = await sql<{ sort: number }>`select coalesce(max(sort), 0) as sort from utility_columns where user_id = ${owner} and meter_id = ${meterId}`;
        await sql`
          insert into utility_columns (id, user_id, meter_id, key, label, kind, unit, formula, rollup, from_children, sort)
          values (${id}, ${owner}, ${meterId}, ${key}, ${fields.label}, ${fields.kind}, ${fields.unit}, ${fields.formula}, ${fields.rollup}, ${fields.from_children}, ${num(top[0]?.sort) + 1})
        `;
      }
      return {};
    }
    case "column.delete": {
      await sql`delete from utility_columns where id = ${str(action.id, 80)} and user_id = ${owner}`;
      return {};
    }
    case "column.move": {
      const id = str(action.id, 80);
      const current = await sql<{ meter_id: string; sort: number }>`select meter_id, sort from utility_columns where id = ${id} and user_id = ${owner}`;
      if (!current[0]) return {};
      const siblings = await sql<{ id: string; sort: number }>`select id, sort from utility_columns where user_id = ${owner} and meter_id = ${current[0].meter_id} order by sort, label`;
      const index = siblings.findIndex((row) => row.id === id);
      const swap = siblings[index + (action.direction === "up" ? -1 : 1)];
      if (index < 0 || !swap) return {};
      await sql`update utility_columns set sort = ${swap.sort} where id = ${id} and user_id = ${owner}`;
      await sql`update utility_columns set sort = ${current[0].sort} where id = ${swap.id} and user_id = ${owner}`;
      return {};
    }
    case "reading.save": {
      const r = action.reading;
      const meterId = str(r.meterId, 80);
      const meter = await sql`select id from utility_meters where id = ${meterId} and user_id = ${owner}`;
      if (!meter.length) throw new Error("That meter is gone.");
      const readOn = dateOr(r.readOn, "");
      if (!readOn) throw new Error("The read needs a date.");
      const id = str(r.id, 80) || nid();
      const meterValue = r.meter == null || r.meter === ("" as unknown) ? null : Number(r.meter);
      if (meterValue != null && !Number.isFinite(meterValue)) throw new Error("The meter read should be a number.");
      const amount = Math.max(0, num(r.amountCents));
      const opening = Boolean(r.opening);
      const cells = JSON.stringify(parseCells(r.cells ?? {}));
      const existing = await sql`select id from utility_readings where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update utility_readings set read_on = ${readOn}, meter_value = ${meterValue}, amount_cents = ${opening ? 0 : amount}, opening = ${opening}, cells_json = ${cells}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into utility_readings (id, user_id, meter_id, read_on, meter_value, amount_cents, opening, cells_json)
          values (${id}, ${owner}, ${meterId}, ${readOn}, ${meterValue}, ${opening ? 0 : amount}, ${opening}, ${cells})
        `;
      }
      return {};
    }
    case "reading.cells": {
      const id = str(action.id, 80);
      const rows = await sql<{ meter_id: string; amount_cents: number; meter_value: number | null }>`select meter_id, amount_cents, meter_value from utility_readings where id = ${id} and user_id = ${owner}`;
      if (!rows[0]) return {};
      const cells = parseCells(action.cells);
      const cols = await sql<{ key: string; rollup: string }>`select key, rollup from utility_columns where user_id = ${owner} and meter_id = ${rows[0].meter_id}`;
      const meterKey = cols.find((c) => c.rollup === "meter")?.key;
      const billKey = cols.find((c) => c.rollup === "bill")?.key;
      const meterValue = meterKey && cells[meterKey] != null ? cells[meterKey]! : rows[0].meter_value;
      const amount = billKey && cells[billKey] != null ? Math.round(cells[billKey]! * 100) : num(rows[0].amount_cents);
      await sql`
        update utility_readings set cells_json = ${JSON.stringify(cells)}, meter_value = ${meterValue}, amount_cents = ${amount}
        where id = ${id} and user_id = ${owner}
      `;
      const saved = await sql<Record<string, unknown>>`select * from utility_readings where id = ${id} and user_id = ${owner}`;
      return { patch: { readings: saved.map(mapUtilReading) } };
    }
    case "reading.date": {
      const readOn = dateOr(action.readOn, "");
      if (!readOn) return {};
      const id = str(action.id, 80);
      await sql`update utility_readings set read_on = ${readOn} where id = ${id} and user_id = ${owner}`;
      const saved = await sql<Record<string, unknown>>`select * from utility_readings where id = ${id} and user_id = ${owner}`;
      return { patch: { readings: saved.map(mapUtilReading) } };
    }
    case "reading.delete": {
      const id = str(action.id, 80);
      await sql`update bill_payments set reading_id = null where user_id = ${owner} and reading_id = ${id}`;
      await sql`delete from utility_readings where id = ${id} and user_id = ${owner}`;
      return {};
    }
    case "asset.save": {
      const a = action.asset;
      const id = str(a.id, 80) || nid();
      const kind = ["home", "vehicle", "other"].includes(String(a.kind)) ? a.kind : "other";
      const existing = await sql`select id from assets where id = ${id} and user_id = ${owner}`;
      const asOf = dateOr(a.asOf, todayISO());
      if (existing.length) {
        await sql`
          update assets set
            name = ${str(a.name, 80)}, kind = ${kind}, value_cents = ${num(a.valueCents)}, as_of = ${asOf},
            loan_account_id = ${a.loanAccountId || null}, address = ${str(a.address, 160)},
            zillow_url = ${str(a.zillowUrl, 300)}, zestimate_cents = ${a.zestimateCents == null ? null : num(a.zestimateCents)},
            detail = ${str(a.detail, 200)}, custom_json = ${str(a.customJson, 2000) || "[]"}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into assets (id, user_id, name, kind, value_cents, as_of, loan_account_id, address, zillow_url, zestimate_cents, detail, custom_json)
          values (${id}, ${owner}, ${str(a.name, 80)}, ${kind}, ${num(a.valueCents)}, ${asOf}, ${a.loanAccountId || null}, ${str(a.address, 160)}, ${str(a.zillowUrl, 300)}, ${a.zestimateCents == null ? null : num(a.zestimateCents)}, ${str(a.detail, 200)}, ${str(a.customJson, 2000) || "[]"})
        `;
      }
      return {};
    }
    case "asset.delete": {
      await sql`delete from valuations where asset_id = ${action.id} and user_id = ${owner}`;
      await sql`delete from assets where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "valuation.add": {
      const asOf = dateOr(action.asOf, todayISO());
      const value = num(action.valueCents);
      await sql`
        insert into valuations (id, user_id, asset_id, as_of, value_cents, source)
        values (${nid()}, ${owner}, ${action.assetId}, ${asOf}, ${value}, ${str(action.source, 20) || "manual"})
      `;
      if (action.source === "zillow") {
        await sql`update assets set zestimate_cents = ${value}, value_cents = ${value}, as_of = ${asOf} where id = ${action.assetId} and user_id = ${owner}`;
      } else {
        await sql`update assets set value_cents = ${value}, as_of = ${asOf} where id = ${action.assetId} and user_id = ${owner}`;
      }
      return {};
    }
    case "goal.save": {
      const g = action.goal;
      const id = str(g.id, 80) || nid();
      const existing = await sql`select id from goals where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update goals set name = ${str(g.name, 80)}, target_cents = ${Math.max(0, num(g.targetCents))}, saved_cents = ${Math.max(0, num(g.savedCents))},
            target_date = ${g.targetDate ? dateOr(g.targetDate, todayISO()) : null}, monthly_cents = ${Math.max(0, num(g.monthlyCents))},
            priority = ${num(g.priority)}, notes = ${str(g.notes, 400)}, archived = ${Boolean(g.archived)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into goals (id, user_id, name, target_cents, saved_cents, target_date, monthly_cents, priority, notes, archived, ledger_id)
          values (${id}, ${owner}, ${str(g.name, 80)}, ${Math.max(0, num(g.targetCents))}, ${Math.max(0, num(g.savedCents))}, ${g.targetDate ? dateOr(g.targetDate, todayISO()) : null}, ${Math.max(0, num(g.monthlyCents))}, ${num(g.priority)}, ${str(g.notes, 400)}, false, ${await openJar()})
        `;
      }
      return {};
    }
    case "goal.delete": {
      await sql`delete from contributions where goal_id = ${action.id} and user_id = ${owner}`;
      await sql`delete from goals where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "goal.contribute": {
      const amount = num(action.amountCents);
      await sql`
        insert into contributions (id, user_id, goal_id, amount_cents, contributed_on, note)
        values (${nid()}, ${owner}, ${action.goalId}, ${amount}, ${dateOr(action.on, todayISO())}, ${str(action.note, 160)})
      `;
      await sql`update goals set saved_cents = greatest(0, saved_cents + ${amount}) where id = ${action.goalId} and user_id = ${owner}`;
      return {};
    }
    case "plan.set": {
      const month = str(action.month, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Pick a month.");
      const jar = await openJar();
      const id = `plan_${action.categoryId}_${month}`;
      const assigned = Math.max(0, num(action.assignedCents));
      await sql`
        insert into plan_months (id, user_id, category_id, month, assigned_cents, ledger_id)
        values (${id}, ${owner}, ${action.categoryId}, ${month}, ${assigned}, ${jar})
        on conflict (user_id, category_id, month) do update set assigned_cents = ${assigned}, ledger_id = ${jar}
      `;
      return {};
    }
    case "watch.save": {
      const w = action.watch;
      const id = str(w.id, 80) || nid();
      const existing = await sql`select id from watchlists where id = ${id} and user_id = ${owner}`;
      const kind = ["merchant", "category", "balance", "goal", "custom"].includes(String(w.kind)) ? String(w.kind) : "custom";
      if (existing.length) {
        await sql`
          update watchlists set name = ${str(w.name, 80)}, kind = ${kind}, ref_id = ${str(w.refId, 80)}, ref_name = ${str(w.refName, 80)},
            comparator = ${str(w.comparator, 8) || "gt"}, threshold_cents = ${num(w.thresholdCents)}, enabled = ${w.enabled !== false}, note = ${str(w.note, 240)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into watchlists (id, user_id, name, kind, ref_id, ref_name, comparator, threshold_cents, enabled, note, ledger_id)
          values (${id}, ${owner}, ${str(w.name, 80)}, ${kind}, ${str(w.refId, 80)}, ${str(w.refName, 80)}, ${str(w.comparator, 8) || "gt"}, ${num(w.thresholdCents)}, true, ${str(w.note, 240)}, ${await openJar()})
        `;
      }
      return {};
    }
    case "watch.delete": {
      await sql`delete from watchlists where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "alert.read": {
      await sql`insert into alert_reads (user_id, alert_key) values (${owner}, ${str(action.key, 120)}) on conflict do nothing`;
      return {};
    }
    case "reminder.save": {
      const r = action.reminder;
      const id = str(r.id, 80) || nid();
      const existing = await sql`select id from reminders where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update reminders set title = ${str(r.title, 120)}, due_on = ${dateOr(r.dueOn, todayISO())}, href = ${str(r.href, 200)},
            related_type = ${str(r.relatedType, 20)}, related_id = ${str(r.relatedId, 80)}, done = ${Boolean(r.done)},
            repeat = ${str(r.repeat, 20) || "none"}, notes = ${str(r.notes, 400)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into reminders (id, user_id, title, due_on, href, related_type, related_id, done, repeat, notes, ledger_id)
          values (${id}, ${owner}, ${str(r.title, 120)}, ${dateOr(r.dueOn, todayISO())}, ${str(r.href, 200)}, ${str(r.relatedType, 20)}, ${str(r.relatedId, 80)}, ${Boolean(r.done)}, ${str(r.repeat, 20) || "none"}, ${str(r.notes, 400)}, ${await openJar()})
        `;
      }
      return {};
    }
    case "reminder.delete": {
      await sql`delete from reminders where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "document.save": {
      const d = action.document;
      const id = str(d.id, 80) || nid();
      const body = str(d.body, 100000);
      const existing = await sql`select id from documents where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update documents set title = ${str(d.title, 120)}, kind = ${str(d.kind, 20) || "other"}, year = ${d.year == null ? null : num(d.year)},
            related_type = ${str(d.relatedType, 20)}, related_id = ${str(d.relatedId, 80)}, notes = ${str(d.notes, 500)},
            body = ${body}, encrypted = ${Boolean(d.encrypted)}, file_name = ${str(d.fileName, 120)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into documents (id, user_id, title, kind, year, related_type, related_id, notes, body, encrypted, file_name, ledger_id)
          values (${id}, ${owner}, ${str(d.title, 120)}, ${str(d.kind, 20) || "other"}, ${d.year == null ? null : num(d.year)}, ${str(d.relatedType, 20)}, ${str(d.relatedId, 80)}, ${str(d.notes, 500)}, ${body}, ${Boolean(d.encrypted)}, ${str(d.fileName, 120)}, ${await openJar()})
        `;
      }
      return {};
    }
    case "document.delete": {
      await removeReceipt(owner, action.id);
      await sql`delete from documents where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "receipt.save": {
      const relatedType = action.relatedType === "bill" ? "bill" : "txn";
      const relatedId = str(action.relatedId, 80);
      if (!relatedId) throw new Error("Save the transaction or bill before attaching a file.");
      const mime = str(action.mime, 80).toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].includes(mime)) {
        throw new Error("Attach a JPEG, PNG, WebP, GIF, or PDF.");
      }
      const bytes = Buffer.from(String(action.dataBase64 ?? "").replace(/^data:[^,]*,/, ""), "base64");
      if (!bytes.length || bytes.length > 8_000_000) throw new Error("That file is empty or larger than 8 MB.");
      const linked = relatedType === "txn"
        ? await sql<{ ledger_id: string }>`select ledger_id from transactions where id = ${relatedId} and user_id = ${owner}`
        : await sql<{ ledger_id: string }>`select ledger_id from bills where id = ${relatedId} and user_id = ${owner}`;
      if (!linked[0]) throw new Error("That transaction or bill is not in this household.");
      const id = nid();
      const fileName = str(action.fileName, 120) || "receipt";
      await writeReceipt(owner, id, bytes);
      await sql`
        insert into documents (id, user_id, title, kind, year, related_type, related_id, notes, body, encrypted, file_name, mime, ledger_id)
        values (${id}, ${owner}, ${fileName}, 'receipt', ${num(todayISO().slice(0, 4))}, ${relatedType}, ${relatedId}, '', '', true, ${fileName}, ${mime}, ${linked[0].ledger_id || (await openJar())})
      `;
      return {};
    }
    case "receipt.open": {
      const rows = await sql<{ file_name: string; mime: string }>`
        select file_name, mime from documents where id = ${action.id} and user_id = ${owner} and kind = 'receipt'
      `;
      if (!rows[0]) throw new Error("That receipt is gone.");
      const bytes = await readReceipt(owner, action.id);
      return { file: { mime: String(rows[0].mime), fileName: String(rows[0].file_name), dataBase64: bytes.toString("base64") }, patch: {} };
    }
    case "receipt.delete": {
      const rows = await sql`select id from documents where id = ${action.id} and user_id = ${owner}`;
      if (!rows.length) return {};
      await removeReceipt(owner, action.id);
      await sql`delete from documents where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "score.save": {
      const s = action.score;
      const id = str(s.id, 80) || nid();
      const existing = await sql`select id from credit_scores where id = ${id} and user_id = ${owner}`;
      const score = Math.max(300, Math.min(850, num(s.score)));
      const personId = str(s.personId, 80) || null;
      if (existing.length) {
        await sql`update credit_scores set bureau = ${str(s.bureau, 40)}, score = ${score}, as_of = ${dateOr(s.asOf, todayISO())}, factors = ${str(s.factors, 400)}, person_id = ${personId} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`insert into credit_scores (id, user_id, bureau, score, as_of, factors, person_id) values (${id}, ${owner}, ${str(s.bureau, 40)}, ${score}, ${dateOr(s.asOf, todayISO())}, ${str(s.factors, 400)}, ${personId})`;
      }
      return {};
    }
    case "score.delete": {
      await sql`delete from credit_scores where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "milestone.save": {
      const m = action.milestone;
      const id = str(m.id, 80) || nid();
      const existing = await sql`select id from milestones where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update milestones set name = ${str(m.name, 80)}, kind = ${str(m.kind, 20)}, target_cents = ${Math.max(0, num(m.targetCents))},
            target_date = ${m.targetDate ? dateOr(m.targetDate, todayISO()) : null}, current_cents = ${num(m.currentCents)},
            monthly_cents = ${num(m.monthlyCents)}, annual_return_bps = ${num(m.annualReturnBps)}, notes = ${str(m.notes, 400)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into milestones (id, user_id, name, kind, target_cents, target_date, current_cents, monthly_cents, annual_return_bps, notes, ledger_id)
          values (${id}, ${owner}, ${str(m.name, 80)}, ${str(m.kind, 20) || "savings"}, ${Math.max(0, num(m.targetCents))}, ${m.targetDate ? dateOr(m.targetDate, todayISO()) : null}, ${num(m.currentCents)}, ${num(m.monthlyCents)}, ${num(m.annualReturnBps, 500)}, ${str(m.notes, 400)}, ${await openJar()})
        `;
      }
      return {};
    }
    case "milestone.delete": {
      await sql`delete from milestones where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "lot.save": {
      const lot = action.lot;
      const id = str(lot.id, 80) || nid();
      const symbol = symbolOf(lot.symbol);
      if (!symbol) throw new Error("A lot needs a ticker.");
      const acquired = dateOr(lot.acquiredOn, "");
      if (!acquired) throw new Error("A lot needs the date you bought it.");
      const shares = Math.max(0, num(lot.sharesMicros));
      const cost = Math.max(0, num(lot.costCents));
      if (shares <= 0) throw new Error("Enter the number of shares.");
      const closed = lot.closedOn ? dateOr(lot.closedOn, "") || null : null;
      const accountId = str(lot.accountId, 80) || null;
      const existing = await sql`select id from lots where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update lots set
            account_id = ${accountId}, symbol = ${symbol}, name = ${str(lot.name, 80)},
            acquired_on = ${acquired}, shares_micros = ${shares}, cost_cents = ${cost},
            closed_on = ${closed}, notes = ${str(lot.notes, 240)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into lots (id, user_id, account_id, symbol, name, acquired_on, shares_micros, cost_cents, closed_on, notes)
          values (${id}, ${owner}, ${accountId}, ${symbol}, ${str(lot.name, 80)}, ${acquired}, ${shares}, ${cost}, ${closed}, ${str(lot.notes, 240)})
        `;
        if (action.recordBuy !== false && cost > 0) {
          await sql`
            insert into portfolio_flows (id, user_id, lot_id, account_id, symbol, kind, posted_on, amount_cents, external, transaction_id, memo)
            values (${nid()}, ${owner}, ${id}, ${accountId}, ${symbol}, 'buy', ${acquired}, ${cost}, true, null, ${"Cost of " + symbol})
          `;
        }
      }
      return {};
    }
    case "lot.delete": {
      await sql`update portfolio_flows set lot_id = null where lot_id = ${action.id} and user_id = ${owner}`;
      await sql`delete from lots where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "lot.sell": {
      const rows = await sql<{ account_id: string | null; symbol: string; acquired_on: string; shares_micros: number; cost_cents: number; closed_on: string | null }>`
        select account_id, symbol, acquired_on, shares_micros, cost_cents, closed_on from lots where id = ${action.id} and user_id = ${owner}
      `;
      const lot = rows[0];
      if (!lot || lot.closed_on) throw new Error("That lot is not open.");
      const soldOn = dateOr(action.soldOn, "");
      if (!soldOn || soldOn < String(lot.acquired_on).slice(0, 10)) throw new Error("The sale has to be on or after the purchase.");
      const shares = Math.max(0, num(lot.shares_micros));
      const sold = Math.max(0, num(action.sharesMicros));
      if (sold <= 0 || sold > shares) throw new Error("Sell some of the shares still in the lot, not more.");
      const proceeds = Math.max(0, num(action.proceedsCents));
      const basis = Math.round((num(lot.cost_cents) * sold) / shares);
      const gain = proceeds - basis;
      const accountId = str(action.accountId, 80) || (lot.account_id ? String(lot.account_id) : "");
      if (!accountId) throw new Error("Pick the account that received the proceeds.");
      const account = await sql`select id from accounts where id = ${accountId} and user_id = ${owner}`;
      if (!account[0]) throw new Error("That account is not in this household.");
      const leftShares = shares - sold;
      const leftCost = Math.max(0, num(lot.cost_cents) - basis);
      const acquired = String(lot.acquired_on).slice(0, 10);
      const term = holdingTerm(acquired, soldOn);
      if (leftShares === 0) {
        await sql`update lots set shares_micros = 0, cost_cents = 0, closed_on = ${soldOn} where id = ${action.id} and user_id = ${owner}`;
      } else {
        await sql`update lots set shares_micros = ${leftShares}, cost_cents = ${leftCost} where id = ${action.id} and user_id = ${owner}`;
      }
      await sql`
        insert into realizations (id, user_id, lot_id, account_id, symbol, acquired_on, sold_on, shares_micros, basis_cents, proceeds_cents, gain_cents, term)
        values (${nid()}, ${owner}, ${action.id}, ${accountId}, ${lot.symbol}, ${acquired}, ${soldOn}, ${sold}, ${basis}, ${proceeds}, ${gain}, ${term})
      `;
      await sql`
        insert into portfolio_flows (id, user_id, lot_id, account_id, symbol, kind, posted_on, amount_cents, external, transaction_id, memo)
        values (${nid()}, ${owner}, ${action.id}, ${accountId}, ${lot.symbol}, 'sell', ${soldOn}, ${proceeds}, true, null, ${"Sale of " + lot.symbol})
      `;
      await adjust(sql, owner, accountId, proceeds);
      return {};
    }
    case "price.save": {
      const p = action.price;
      const id = str(p.id, 80) || nid();
      const symbol = symbolOf(p.symbol);
      const asOf = dateOr(p.asOf, "");
      if (!symbol || !asOf) throw new Error("A price needs a ticker and a date.");
      const cents = Math.max(0, num(p.priceCents));
      const existing = await sql`select id from prices where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`update prices set symbol = ${symbol}, as_of = ${asOf}, price_cents = ${cents} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`insert into prices (id, user_id, symbol, as_of, price_cents) values (${id}, ${owner}, ${symbol}, ${asOf}, ${cents})`;
      }
      return {};
    }
    case "price.delete": {
      await sql`delete from prices where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "flow.save": {
      const f = action.flow;
      const kinds = ["buy", "contribution", "withdrawal", "dividend", "fee"];
      const kind = kinds.includes(String(f.kind)) ? String(f.kind) : "";
      if (!kind) throw new Error("Pick what kind of cash flow this is.");
      const posted = dateOr(f.postedOn, "");
      if (!posted) throw new Error("A cash flow needs a date.");
      const amount = Math.max(0, num(f.amountCents));
      if (amount <= 0) throw new Error("Enter an amount.");
      const id = str(f.id, 80) || nid();
      const symbol = symbolOf(f.symbol);
      const accountId = str(f.accountId, 80) || null;
      const external = f.external !== false;
      const existing = await sql<{ transaction_id: string | null }>`select transaction_id from portfolio_flows where id = ${id} and user_id = ${owner}`;
      let transactionId = existing[0]?.transaction_id ?? null;
      if (!existing.length && action.recordInBooks && kind === "dividend") {
        if (!accountId) throw new Error("Pick the cash account that received the dividend.");
        const acct = await sql<{ ledger_id: string }>`select ledger_id from accounts where id = ${accountId} and user_id = ${owner}`;
        const cats = await sql<{ id: string }>`select id from categories where user_id = ${owner} and ledger_id = ${acct[0]?.ledger_id ?? ""} and lower(name) = 'dividends' limit 1`;
        transactionId = nid();
        const merchant = symbol ? `${symbol} dividend` : "Dividend";
        await adjust(sql, owner, accountId, amount);
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, ledger_id)
          values (${transactionId}, ${owner}, ${accountId}, ${cats[0]?.id ?? null}, ${posted}, ${amount}, ${merchant}, ${str(f.memo, 240) || "Portfolio dividend"}, false, 'B', 'dividends', true, 'investment', null, ${acct[0]?.ledger_id ?? ""})
        `;
      }
      if (existing.length) {
        await sql`
          update portfolio_flows set
            lot_id = ${str(f.lotId, 80) || null}, account_id = ${accountId}, symbol = ${symbol},
            kind = ${kind}, posted_on = ${posted}, amount_cents = ${amount}, external = ${external}, memo = ${str(f.memo, 240)}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into portfolio_flows (id, user_id, lot_id, account_id, symbol, kind, posted_on, amount_cents, external, transaction_id, memo)
          values (${id}, ${owner}, ${str(f.lotId, 80) || null}, ${accountId}, ${symbol}, ${kind}, ${posted}, ${amount}, ${external}, ${transactionId}, ${str(f.memo, 240)})
        `;
      }
      return {};
    }
    case "flow.delete": {
      const rows = await sql<{ transaction_id: string | null }>`select transaction_id from portfolio_flows where id = ${action.id} and user_id = ${owner}`;
      const txnId = rows[0]?.transaction_id;
      if (txnId) {
        const txn = await sql<{ account_id: string; amount_cents: number }>`select account_id, amount_cents from transactions where id = ${txnId} and user_id = ${owner}`;
        if (txn[0]) await adjust(sql, owner, txn[0].account_id, -num(txn[0].amount_cents));
        await sql`delete from transactions where id = ${txnId} and user_id = ${owner}`;
      }
      await sql`delete from portfolio_flows where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "sketch.save": {
      const s = action.sketch;
      const id = str(s.id, 80) || nid();
      const name = str(s.name, 80);
      if (!name) throw new Error("Name the sketch.");
      const years = Math.min(60, Math.max(1, num(s.years, 30)));
      const bps = Math.max(0, Math.min(3000, num(s.annualReturnBps, 500)));
      const existing = await sql`select id from retirement_sketches where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update retirement_sketches set
            name = ${name}, monthly_cents = ${Math.max(0, num(s.monthlyCents))}, annual_return_bps = ${bps},
            years = ${years}, target_cents = ${Math.max(0, num(s.targetCents))},
            use_portfolio = ${s.usePortfolio !== false}, start_cents = ${Math.max(0, num(s.startCents))}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into retirement_sketches (id, user_id, name, monthly_cents, annual_return_bps, years, target_cents, use_portfolio, start_cents)
          values (${id}, ${owner}, ${name}, ${Math.max(0, num(s.monthlyCents))}, ${bps}, ${years}, ${Math.max(0, num(s.targetCents))}, ${s.usePortfolio !== false}, ${Math.max(0, num(s.startCents))})
        `;
      }
      return {};
    }
    case "sketch.delete": {
      await sql`delete from retirement_sketches where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "portfolio.sync": {
      const accountId = str(action.accountId, 80);
      const acct = await sql`select id from accounts where id = ${accountId} and user_id = ${owner}`;
      if (!acct[0]) throw new Error("Pick an account that belongs to this household.");
      const lotRows = await sql<Record<string, unknown>>`select * from lots where user_id = ${owner} and account_id = ${accountId}`;
      const priceRows = await sql<Record<string, unknown>>`select * from prices where user_id = ${owner}`;
      const open = lotRows.map(mapLot).filter((lot) => !lot.closedOn);
      if (!open.length) throw new Error("That account has no open lots.");
      const perf = portfolioPerformance({ lots: open, prices: priceRows.map(mapPrice), flows: [], today: todayISO() });
      await sql`update accounts set balance_cents = ${perf.marketCents} where id = ${accountId} and user_id = ${owner}`;
      return {};
    }
    case "report.save": {
      const r = action.report;
      const id = str(r.id, 80) || nid();
      const existing = await sql`select id from reports where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`
          update reports set name = ${str(r.name, 80)}, metric = ${str(r.metric, 20)}, range_key = ${str(r.rangeKey, 20) || "month"},
            group_by = ${str(r.groupBy, 20) || "category"}, filters_json = ${str(r.filtersJson, 1000) || "{}"}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into reports (id, user_id, name, metric, range_key, group_by, filters_json, ledger_id)
          values (${id}, ${owner}, ${str(r.name, 80)}, ${str(r.metric, 20) || "spending"}, ${str(r.rangeKey, 20) || "month"}, ${str(r.groupBy, 20) || "category"}, ${str(r.filtersJson, 1000) || "{}"}, ${await openJar()})
        `;
      }
      return {};
    }
    case "report.delete": {
      await sql`delete from reports where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "invite.create": {
      const role = action.role === "editor" || action.role === "advisor" ? action.role : "viewer";
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = randomBytes(8);
      const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
      await sql`
        insert into book_access (owner_user_id, member_email, role, invite_code, status)
        values (${owner}, ${str(action.email, 120).toLowerCase()}, ${role}, ${code}, 'pending')
      `;
      await recordAudit(sql, owner, "invite.create", role);
      return { code };
    }
    case "invite.revoke": {
      const prior = await sql<{ member_email: string; member_user_id: string | null }>`
        select member_email, member_user_id from book_access where id = ${action.id} and owner_user_id = ${owner}
      `;
      await sql`update book_access set status = 'revoked' where id = ${action.id} and owner_user_id = ${owner}`;
      const email = String(prior[0]?.member_email ?? "").trim().toLowerCase();
      if (email) {
        await sql`update people set linked_user_id = null where user_id = ${owner} and lower(email) = ${email}`;
      }
      await recordAudit(sql, owner, "invite.revoke", String(action.id));
      return {};
    }
    case "apikey.create": {
      const token = `hj_${randomBytes(24).toString("base64url")}`;
      const hash = createHash("sha256").update(token).digest("hex");
      const days = Math.min(3650, Math.max(0, Math.floor(Number(action.expiresInDays) || 0)));
      const expires = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
      await sql`
        insert into api_keys (id, user_id, name, prefix, token_hash, expires_at)
        values (${nid()}, ${owner}, ${str(action.name, 60) || "Key"}, ${token.slice(0, 10)}, ${hash}, ${expires})
      `;
      await recordAudit(sql, owner, "apikey.create", days ? `${days}d` : "no expiry");
      return { token };
    }
    case "apikey.revoke": {
      await sql`delete from api_keys where id = ${action.id} and user_id = ${owner}`;
      await recordAudit(sql, owner, "apikey.revoke", action.id);
      return {};
    }
    case "recovery.issue": {
      const { hasLocalPassword, issueRecoveryCode } = await import("./care.server");
      if (!(await hasLocalPassword(sql, owner))) {
        throw new Error("This sign-in uses a directory and has no HoneyJar password.");
      }
      const code = await issueRecoveryCode(sql, owner);
      return { code };
    }
    case "account.delete": {
      const { deleteOwnedAccount } = await import("./care.server");
      await deleteOwnedAccount(sql, owner, action.confirm);
      return {};
    }
    case "sample.clear": {
      await clearHousehold(sql, owner);
      await removeUserFiles(owner);
      await seedBlank(sql, owner);
      await sql`
        update profiles set
          seeded = false,
          initialized = true,
          wages_cents = 0,
          other_income_cents = 0,
          withholding_cents = 0,
          estimated_paid_cents = 0,
          prior_year_tax_cents = 0,
          filing_status = 'single',
          state_code = '',
          dependents = 0,
          state_rate_bps = 0,
          deduction_mode = 'auto'
        where user_id = ${owner}
      `;
      return {};
    }
    case "sample.load": {
      await removeUserFiles(owner);
      await seedHousehold(sql, owner);
      return {};
    }
    case "household.begin": {
      const name = str(action.name, 80);
      if (!name) throw new Error("Name the household.");
      await sql`update profiles set display_name = ${name}, initialized = true where user_id = ${owner}`;
      await sql`update ledgers set name = ${name} where user_id = ${owner} and kind = 'personal'`;
      return {};
    }
    case "household.blank": {
      const name = str(action.name, 80);
      if (!name) throw new Error("Name the household.");
      await clearHousehold(sql, owner);
      await removeUserFiles(owner);
      await sql`
        update profiles set
          display_name = ${name},
          seeded = false,
          initialized = true,
          wages_cents = 0,
          other_income_cents = 0,
          withholding_cents = 0,
          estimated_paid_cents = 0,
          prior_year_tax_cents = 0,
          filing_status = 'single',
          state_code = '',
          dependents = 0,
          state_rate_bps = 0,
          deduction_mode = 'auto'
        where user_id = ${owner}
      `;
      await seedBlank(sql, owner);
      return {};
    }
    case "advisor.log": {
      await sql`insert into ai_messages (id, user_id, role, content) values (${nid()}, ${owner}, 'user', ${str(action.question, 4000)})`;
      await sql`insert into ai_messages (id, user_id, role, content) values (${nid()}, ${owner}, 'assistant', ${str(action.answer, 8000)})`;
      return {};
    }
    case "ledger.save": {
      const name = str(action.ledger.name, 80);
      if (!name) throw new Error("Name the jar.");
      const id = str(action.ledger.id, 80) || nid();
      const activity = str(action.ledger.activity, 80);
      const kind = action.ledger.kind === "personal" ? "personal" : action.ledger.kind === "property" ? "property" : "business";
      const requested = str(action.ledger.taxForm, 1).toUpperCase();
      const taxForm = kind === "personal" ? "" : kind === "property" ? "E" : requested === "E" || requested === "F" ? requested : "C";
      const existing = await sql`select id from ledgers where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`update ledgers set name = ${name}, activity = ${activity} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`
          insert into ledgers (id, user_id, name, tax_form, activity, archived, sort, kind)
          values (${id}, ${owner}, ${name}, ${taxForm}, ${activity}, false, 0, ${kind})
        `;
        if (kind === "personal") await seedPersonalCategories(sql, owner, id);
        else await seedLedgerCategories(sql, owner, id, taxForm);
      }
      return {};
    }
    case "ledger.archive": {
      const row = await sql<{ kind: string }>`select kind from ledgers where id = ${action.id} and user_id = ${owner}`;
      if (!row[0]) throw new Error("That jar is already gone.");
      if (action.archived && row[0].kind === "personal") {
        const others = await sql`select id from ledgers where user_id = ${owner} and kind = 'personal' and archived = false and id <> ${action.id}`;
        if (!others.length) throw new Error("Keep one personal jar. Add another before archiving this one.");
      }
      await sql`update ledgers set archived = ${Boolean(action.archived)} where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "invoice.save": {
      const ledger = await businessLedger(sql, owner, action.ledgerId);
      const client = str(action.invoice.client, 80);
      if (!client) throw new Error("Name the client.");
      const issued = dateOr(action.invoice.issuedOn, "");
      const due = dateOr(action.invoice.dueOn, "");
      if (!issued || !due) throw new Error("An invoice needs an issue date and a due date.");
      const lines = (action.invoice.lines ?? [])
        .map((line) => ({ description: str(line.description, 120), amountCents: Math.max(0, num(line.amountCents)) }))
        .filter((line) => line.description && line.amountCents > 0)
        .slice(0, 30);
      if (!lines.length) throw new Error("Add at least one line with an amount.");
      const id = str(action.invoice.id, 80) || nid();
      const existing = await sql<{ status: string }>`select status from invoices where id = ${id} and user_id = ${owner} and ledger_id = ${ledger.id}`;
      if (existing[0]?.status === "paid") throw new Error("A paid invoice stays as it was recorded.");
      const notes = str(action.invoice.notes, 400);
      const email = str(action.invoice.clientEmail, 120);
      const address = str(action.invoice.clientAddress, 120);
      const city = str(action.invoice.clientCity, 60);
      const region = str(action.invoice.clientRegion, 40);
      const postal = str(action.invoice.clientPostal, 16);
      const body = JSON.stringify(lines);
      if (existing.length) {
        await sql`
          update invoices set client = ${client}, client_email = ${email}, client_address = ${address}, client_city = ${city}, client_region = ${region}, client_postal = ${postal}, issued_on = ${issued}, due_on = ${due}, notes = ${notes}, lines_json = ${body}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        const count = await sql<{ n: number }>`select count(*) as n from invoices where user_id = ${owner} and ledger_id = ${ledger.id}`;
        const number = `INV-${1001 + num(count[0]?.n)}`;
        await sql`
          insert into invoices (id, user_id, ledger_id, number, client, client_email, client_address, client_city, client_region, client_postal, issued_on, due_on, status, notes, lines_json)
          values (${id}, ${owner}, ${ledger.id}, ${number}, ${client}, ${email}, ${address}, ${city}, ${region}, ${postal}, ${issued}, ${due}, 'open', ${notes}, ${body})
        `;
      }
      return {};
    }
    case "invoice.pay": {
      const rows = await sql<Record<string, unknown>>`select * from invoices where id = ${action.id} and user_id = ${owner}`;
      const invoice = rows[0] ? mapInvoice(rows[0]) : null;
      if (!invoice || invoice.status !== "open") throw new Error("That invoice is not open.");
      const ledger = await businessLedger(sql, owner, invoice.ledgerId);
      const total = invoice.lines.reduce((sum, line) => sum + line.amountCents, 0);
      if (total <= 0) throw new Error("This invoice has nothing to collect.");
      const account = await sql`select id from accounts where id = ${action.accountId} and user_id = ${owner} and ledger_id = ${ledger.id}`;
      if (!account[0]) throw new Error("Pick an account on this business.");
      const income = await sql<{ id: string; tax_line: string }>`
        select id, tax_line from categories where user_id = ${owner} and ledger_id = ${ledger.id} and flow = 'in' order by sort limit 1
      `;
      if (!income[0]) throw new Error("This jar needs an income category before a payment can post.");
      const paidOn = dateOr(action.paidOn, todayISO());
      const txnId = nid();
      await adjust(sql, owner, action.accountId, total);
      await sql`
        insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags, ledger_id)
        values (${txnId}, ${owner}, ${action.accountId}, ${income[0].id}, ${paidOn}, ${total}, ${invoice.client}, ${invoice.number}, false, ${ledger.tax_form}, ${income[0].tax_line}, true, 'invoice', null, '[]', ${ledger.id})
      `;
      await sql`
        update invoices set status = 'paid', account_id = ${action.accountId}, transaction_id = ${txnId}, paid_on = ${paidOn}
        where id = ${invoice.id} and user_id = ${owner}
      `;
      return {};
    }
    case "invoice.void": {
      const rows = await sql<Record<string, unknown>>`select * from invoices where id = ${action.id} and user_id = ${owner}`;
      const invoice = rows[0] ? mapInvoice(rows[0]) : null;
      if (!invoice || invoice.status === "void") throw new Error("That invoice is already void.");
      await businessLedger(sql, owner, invoice.ledgerId);
      if (invoice.transactionId) {
        const txn = await sql<{ account_id: string; amount_cents: number }>`
          select account_id, amount_cents from transactions where id = ${invoice.transactionId} and user_id = ${owner} and ledger_id = ${invoice.ledgerId}
        `;
        if (txn[0]) await adjust(sql, owner, txn[0].account_id, -num(txn[0].amount_cents));
        await sql`delete from transactions where id = ${invoice.transactionId} and user_id = ${owner} and ledger_id = ${invoice.ledgerId}`;
      }
      await sql`
        update invoices set status = 'void', transaction_id = null, paid_on = null
        where id = ${invoice.id} and user_id = ${owner}
      `;
      return {};
    }
    case "mileage.save": {
      const ledger = await businessLedger(sql, owner, action.ledgerId);
      const on = dateOr(action.trip.on, "");
      if (!on) throw new Error("A trip needs a date.");
      const purpose = str(action.trip.purpose, 120);
      if (!purpose) throw new Error("Say what the trip was for.");
      const destination = str(action.trip.destination, 120);
      const use = action.trip.use === "commute" || action.trip.use === "personal" ? action.trip.use : "business";
      const miles = Math.max(0, num(action.trip.milesHundredths));
      if (miles <= 0) throw new Error("Enter the miles.");
      const parking = Math.max(0, num(action.trip.parkingCents));
      const tolls = Math.max(0, num(action.trip.tollsCents));
      const id = str(action.trip.id, 80) || nid();
      const existing = await sql`select id from mileage where id = ${id} and user_id = ${owner} and ledger_id = ${ledger.id}`;
      if (existing.length) {
        await sql`
          update mileage set trip_on = ${on}, purpose = ${purpose}, destination = ${destination}, use_type = ${use}, miles_hundredths = ${miles}, parking_cents = ${parking}, tolls_cents = ${tolls}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into mileage (id, user_id, ledger_id, trip_on, purpose, destination, use_type, miles_hundredths, parking_cents, tolls_cents)
          values (${id}, ${owner}, ${ledger.id}, ${on}, ${purpose}, ${destination}, ${use}, ${miles}, ${parking}, ${tolls})
        `;
      }
      return {};
    }
    case "mileage.delete": {
      await sql`delete from mileage where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "lease.save": {
      const ledger = await sql<{ kind: string }>`select kind from ledgers where id = ${action.ledgerId} and user_id = ${owner} and archived = false`;
      if (ledger[0]?.kind !== "property") throw new Error("A lease belongs on a property jar.");
      const tenant = str(action.lease.tenant, 80);
      if (!tenant) throw new Error("Name the tenant.");
      const rent = Math.max(0, num(action.lease.rentCents));
      if (rent <= 0) throw new Error("Enter the monthly rent.");
      const start = dateOr(action.lease.startOn, "");
      if (!start) throw new Error("A lease needs a start date.");
      const due = Math.min(28, Math.max(1, num(action.lease.dueDay) || 1));
      const end = action.lease.endOn ? dateOr(action.lease.endOn, "") || null : null;
      const id = str(action.lease.id, 80) || nid();
      const existing = await sql`select id from leases where id = ${id} and user_id = ${owner} and ledger_id = ${action.ledgerId}`;
      const fields = {
        tenant,
        email: str(action.lease.email, 120),
        address: str(action.lease.address, 120),
        city: str(action.lease.city, 60),
        region: str(action.lease.region, 40),
        postal: str(action.lease.postal, 16),
        unit: str(action.lease.unit, 40),
        notes: str(action.lease.notes, 400),
        deposit: Math.max(0, num(action.lease.depositCents)),
      };
      if (existing.length) {
        await sql`
          update leases set tenant = ${fields.tenant}, email = ${fields.email}, address = ${fields.address}, city = ${fields.city}, region = ${fields.region}, postal = ${fields.postal}, unit = ${fields.unit}, rent_cents = ${rent}, due_day = ${due}, start_on = ${start}, end_on = ${end}, deposit_cents = ${fields.deposit}, notes = ${fields.notes}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into leases (id, user_id, ledger_id, tenant, email, address, city, region, postal, unit, rent_cents, due_day, start_on, end_on, deposit_cents, deposit_held_cents, status, last_invoiced, notes)
          values (${id}, ${owner}, ${action.ledgerId}, ${fields.tenant}, ${fields.email}, ${fields.address}, ${fields.city}, ${fields.region}, ${fields.postal}, ${fields.unit}, ${rent}, ${due}, ${start}, ${end}, ${fields.deposit}, 0, 'active', '', ${fields.notes})
        `;
      }
      await ensureLeaseInvoices(sql, owner);
      return {};
    }
    case "lease.deposit": {
      const rows = await sql<Record<string, unknown>>`select * from leases where id = ${action.id} and user_id = ${owner}`;
      const lease = rows[0] ? mapLease(rows[0]) : null;
      if (!lease || lease.status !== "active") throw new Error("That lease is not active.");
      const amount = Math.max(0, num(action.amountCents));
      if (amount <= 0) throw new Error("Enter the deposit received.");
      const account = await sql`select id from accounts where id = ${action.accountId} and user_id = ${owner} and ledger_id = ${lease.ledgerId}`;
      if (!account[0]) throw new Error("Pick an account on this property.");
      const category = await depositCategory(sql, owner, lease.ledgerId);
      const posted = dateOr(action.postedOn, todayISO());
      await adjust(sql, owner, action.accountId, amount);
      await sql`
        insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags, ledger_id)
        values (${nid()}, ${owner}, ${action.accountId}, ${category}, ${posted}, ${amount}, ${lease.tenant}, 'Security deposit', false, '', 'deposit', true, 'deposit', null, '[]', ${lease.ledgerId})
      `;
      const held = lease.depositHeldCents + amount;
      const stated = Math.max(lease.depositCents, held);
      await sql`update leases set deposit_held_cents = ${held}, deposit_cents = ${stated} where id = ${lease.id} and user_id = ${owner}`;
      return {};
    }
    case "lease.return": {
      const rows = await sql<Record<string, unknown>>`select * from leases where id = ${action.id} and user_id = ${owner}`;
      const lease = rows[0] ? mapLease(rows[0]) : null;
      if (!lease) throw new Error("That lease is already gone.");
      const amount = Math.max(0, num(action.amountCents));
      if (amount <= 0 || amount > lease.depositHeldCents) throw new Error("Return no more than the deposit still held.");
      const account = await sql`select id from accounts where id = ${action.accountId} and user_id = ${owner} and ledger_id = ${lease.ledgerId}`;
      if (!account[0]) throw new Error("Pick an account on this property.");
      const category = await depositCategory(sql, owner, lease.ledgerId);
      const posted = dateOr(action.postedOn, todayISO());
      await adjust(sql, owner, action.accountId, -amount);
      await sql`
        insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags, ledger_id)
        values (${nid()}, ${owner}, ${action.accountId}, ${category}, ${posted}, ${-amount}, ${lease.tenant}, 'Deposit returned', false, '', 'deposit', true, 'deposit', null, '[]', ${lease.ledgerId})
      `;
      await sql`update leases set deposit_held_cents = ${lease.depositHeldCents - amount} where id = ${lease.id} and user_id = ${owner}`;
      return {};
    }
    case "lease.end": {
      await sql`update leases set status = 'ended' where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "biz.account.save": {
      const ledger = await sql`select id from ledgers where id = ${action.ledgerId} and user_id = ${owner}`;
      if (!ledger[0]) throw new Error("That business is not in this household.");
      const name = str(action.account.name, 80);
      if (!name) throw new Error("Name the account.");
      const kind = ["checking", "savings", "cash", "credit", "loan", "mortgage"].includes(String(action.account.kind)) ? String(action.account.kind) : "checking";
      const id = str(action.account.id, 80) || nid();
      const existing = await sql`select id from accounts where id = ${id} and user_id = ${owner} and ledger_id = ${action.ledgerId}`;
      if (existing.length) {
        await sql`update accounts set name = ${name}, kind = ${kind} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`
          insert into accounts (id, user_id, name, institution, kind, mask, balance_cents, connected, archived, custom_json, ledger_id)
          values (${id}, ${owner}, ${name}, '', ${kind}, '', 0, false, false, '[]', ${action.ledgerId})
        `;
      }
      return {};
    }
    case "biz.txn.save": {
      const ledger = await sql<{ tax_form: string }>`select tax_form from ledgers where id = ${action.ledgerId} and user_id = ${owner}`;
      if (!ledger[0]) throw new Error("That business is not in this household.");
      const t = action.txn;
      const acct = await sql`select id from accounts where id = ${t.accountId} and user_id = ${owner} and ledger_id = ${action.ledgerId}`;
      if (!acct[0]) throw new Error("Pick an account on this business.");
      const cat = t.categoryId
        ? await sql<{ tax_line: string; flow: string }>`select tax_line, flow from categories where id = ${t.categoryId} and user_id = ${owner} and ledger_id = ${action.ledgerId}`
        : [];
      if (t.categoryId && !cat[0]) throw new Error("Pick a category on this business.");
      if (cat[0]?.flow === "transfer") throw new Error("Draws and contributions use the draw form, so they stay off the profit and loss.");
      const id = str(t.id, 80) || nid();
      const posted = dateOr(t.postedOn, todayISO());
      const amount = num(t.amountCents);
      const schedule = String(ledger[0].tax_form || "C");
      const line = cat[0]?.tax_line ?? "";
      const existing = await sql<{ account_id: string; amount_cents: number; ledger_id: string }>`
        select account_id, amount_cents, ledger_id from transactions where id = ${id} and user_id = ${owner}
      `;
      if (existing[0] && existing[0].ledger_id !== action.ledgerId) throw new Error("That transaction is not on this business.");
      const paired = await sql`select id from draws where user_id = ${owner} and (biz_txn_id = ${id} or home_txn_id = ${id})`;
      if (paired[0]) throw new Error("Delete the owner draw. That removes both sides.");
      if (existing[0]) await adjust(sql, owner, existing[0].account_id, -num(existing[0].amount_cents));
      await adjust(sql, owner, t.accountId, amount);
      const personId = str(t.personId, 80) || null;
      if (existing[0]) {
        await sql`
          update transactions set
            account_id = ${t.accountId}, category_id = ${t.categoryId || null}, posted_on = ${posted},
            amount_cents = ${amount}, merchant = ${str(t.merchant, 120)}, memo = ${str(t.memo, 240)},
            tax_schedule = ${schedule}, tax_line = ${line}, person_id = ${personId}, reviewed = true, source = 'manual'
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags, ledger_id)
          values (${id}, ${owner}, ${t.accountId}, ${t.categoryId || null}, ${posted}, ${amount}, ${str(t.merchant, 120)}, ${str(t.memo, 240)}, false, ${schedule}, ${line}, true, 'manual', ${personId}, '[]', ${action.ledgerId})
        `;
      }
      return {};
    }
    case "biz.txn.delete": {
      const paired = await sql`select id from draws where user_id = ${owner} and (biz_txn_id = ${action.id} or home_txn_id = ${action.id})`;
      if (paired[0]) throw new Error("Delete the owner draw. That removes both sides.");
      const existing = await sql<{ account_id: string; amount_cents: number }>`
        select account_id, amount_cents from transactions where id = ${action.id} and user_id = ${owner} and ledger_id <> ''
      `;
      if (!existing[0]) throw new Error("That transaction is not on a business book.");
      await adjust(sql, owner, existing[0].account_id, -num(existing[0].amount_cents));
      await sql`delete from transactions where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "biz.draw": {
      const ledger = await sql<{ name: string }>`select name from ledgers where id = ${action.ledgerId} and user_id = ${owner}`;
      if (!ledger[0]) throw new Error("That business is not in this household.");
      const amount = Math.abs(num(action.amountCents));
      if (!amount) throw new Error("Enter an amount.");
      const direction = action.direction === "contribution" ? "contribution" : "draw";
      const bizSigned = direction === "draw" ? -amount : amount;
      const bizAcct = await sql`select id from accounts where id = ${action.bizAccountId} and user_id = ${owner} and ledger_id = ${action.ledgerId}`;
      const homeAcct = await sql<{ ledger_id: string }>`
        select a.ledger_id from accounts a
        join ledgers l on l.id = a.ledger_id and l.user_id = a.user_id
        where a.id = ${action.homeAccountId} and a.user_id = ${owner} and l.kind = 'personal' and l.archived = false
      `;
      if (!bizAcct[0] || !homeAcct[0]) throw new Error("Pick a business account and a personal-jar account.");
      const homeLedger = homeAcct[0].ledger_id;
      const equity = await sql<{ id: string }>`
        select id from categories where user_id = ${owner} and ledger_id = ${action.ledgerId} and tax_line = ${direction} limit 1
      `;
      const homeCat = await sql<{ id: string }>`
        select id from categories where user_id = ${owner} and ledger_id = ${homeLedger} and flow = 'transfer' order by name limit 1
      `;
      if (!equity[0] || !homeCat[0]) throw new Error("Missing the equity category, or that personal jar's Transfer category.");
      const posted = dateOr(action.postedOn, todayISO());
      const bizTxn = nid();
      const homeTxn = nid();
      const label = direction === "draw" ? "Owner draw" : "Owner contribution";
      await adjust(sql, owner, action.bizAccountId, bizSigned);
      await adjust(sql, owner, action.homeAccountId, -bizSigned);
      await sql`
        insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, tags, ledger_id)
        values (${bizTxn}, ${owner}, ${action.bizAccountId}, ${equity[0].id}, ${posted}, ${bizSigned}, ${label}, ${ledger[0].name}, false, '', ${direction}, true, 'draw', '[]', ${action.ledgerId})
      `;
      await sql`
        insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, tags, ledger_id)
        values (${homeTxn}, ${owner}, ${action.homeAccountId}, ${homeCat[0].id}, ${posted}, ${-bizSigned}, ${label}, ${ledger[0].name}, false, '', '', true, 'draw', '[]', ${homeLedger})
      `;
      await sql`
        insert into draws (id, user_id, ledger_id, posted_on, direction, amount_cents, biz_account_id, home_account_id, biz_txn_id, home_txn_id)
        values (${nid()}, ${owner}, ${action.ledgerId}, ${posted}, ${direction}, ${amount}, ${action.bizAccountId}, ${action.homeAccountId}, ${bizTxn}, ${homeTxn})
      `;
      return {};
    }
    case "biz.draw.delete": {
      const row = await sql<{ biz_txn_id: string; home_txn_id: string }>`
        select biz_txn_id, home_txn_id from draws where id = ${action.id} and user_id = ${owner}
      `;
      if (!row[0]) throw new Error("That draw is already gone.");
      for (const txnId of [row[0].biz_txn_id, row[0].home_txn_id]) {
        const txn = await sql<{ account_id: string; amount_cents: number }>`
          select account_id, amount_cents from transactions where id = ${txnId} and user_id = ${owner}
        `;
        if (txn[0]) {
          await adjust(sql, owner, txn[0].account_id, -num(txn[0].amount_cents));
          await sql`delete from transactions where id = ${txnId} and user_id = ${owner}`;
        }
      }
      await sql`delete from draws where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    default:
      return {};
  }
}

async function acceptInvite(sql: Sql, userId: string, code: string): Promise<ActionResult> {
  const clean = str(code, 16).toUpperCase();
  const rows = await sql<{ id: number; owner_user_id: string; member_email: string; status: string }>`
    select id, owner_user_id, member_email, status from book_access where invite_code = ${clean}
  `;
  const row = rows[0];
  if (!row || row.status === "revoked") throw new Error("That invite code is not active.");
  if (row.owner_user_id === userId) throw new Error("That's your own household.");
  await sql`update book_access set member_user_id = ${userId}, status = 'active' where id = ${row.id}`;
  const email = String(row.member_email ?? "").trim().toLowerCase();
  if (email) {
    await sql`
      update people set linked_user_id = ${userId}
      where user_id = ${row.owner_user_id} and lower(email) = ${email} and email <> ''
    `;
  }
  return {};
}

export async function advisorContext(userId: string, ownerId: string | undefined) {
  const ws = await loadWorkspace(userId, ownerId);
  return ws;
}
