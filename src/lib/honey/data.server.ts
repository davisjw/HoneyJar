import { createHash, randomBytes } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { balanceDelta, LEDGER_LINES, matchCategory, packTags, parseTags, portfolioPerformance, stepDue, todayISO } from "./calc";
import { clearHousehold, ensureSampleBusiness, ensureSampleInvestments, ensureSamplePeople, ensureSampleTags, seedHousehold, seedStarter } from "./seed";
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
  Contribution,
  CreditScore,
  DocumentRow,
  Draw,
  FilingStatus,
  Goal,
  LedgerBook,
  Lot,
  Milestone,
  Payment,
  Person,
  PlanMonth,
  PortfolioFlow,
  Profile,
  Reminder,
  Report,
  RetirementSketch,
  Role,
  Rule,
  SecurityPrice,
  Snapshot,
  Txn,
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
  const rows = await sql<{ initialized: boolean }>`select initialized from profiles where user_id = ${userId}`;
  if (!rows[0]?.initialized) await seedHousehold(sql, userId);
  await ensureSamplePeople(sql, userId);
  await ensureSampleTags(sql, userId);
  await ensureSampleInvestments(sql, userId);
  await ensureSampleBusiness(sql, userId);
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

export async function loadWorkspace(userId: string, ownerId?: string): Promise<Workspace> {
  const sql = await getSql();
  await ensureProfile(sql, userId);
  const scoped = await scope(sql, userId, ownerId);
  if (scoped.owner === userId) await ensureSeed(sql, userId);
  const owner = scoped.owner;
  const profileRows = await sql<Record<string, unknown>>`select * from profiles where user_id = ${owner}`;
  if (!profileRows[0]) throw new Error("Household not found.");

  const [accounts, categories, rules, people, transactions, bills, payments, assets, valuations, snapshots, goals, contributions, plan, watches, reads, reminders, documents, scores, milestones, lots, prices, flows, sketches, ledgers, bizAccounts, bizCategories, bizTxns, bizBills, draws, reports, keys, messages, invites, shared] =
    await Promise.all([
      sql<Record<string, unknown>>`select * from accounts where user_id = ${owner} and ledger_id = '' order by name`,
      sql<Record<string, unknown>>`select * from categories where user_id = ${owner} and ledger_id = '' order by sort, name`,
      sql<Record<string, unknown>>`select * from rules where user_id = ${owner} order by priority desc`,
      sql<Record<string, unknown>>`select * from people where user_id = ${owner} order by sort, name`,
      sql<Record<string, unknown>>`select * from transactions where user_id = ${owner} and ledger_id = '' order by posted_on desc, merchant`,
      sql<Record<string, unknown>>`select * from bills where user_id = ${owner} and ledger_id = '' order by next_due`,
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
      sql<Record<string, unknown>>`select * from accounts where user_id = ${owner} and ledger_id <> '' order by name`,
      sql<Record<string, unknown>>`select * from categories where user_id = ${owner} and ledger_id <> '' order by sort, name`,
      sql<Record<string, unknown>>`select * from transactions where user_id = ${owner} and ledger_id <> '' order by posted_on desc, merchant`,
      sql<Record<string, unknown>>`select * from bills where user_id = ${owner} and ledger_id <> '' order by next_due`,
      sql<Record<string, unknown>>`select * from draws where user_id = ${owner} order by posted_on desc`,
      sql<Record<string, unknown>>`select * from reports where user_id = ${owner} order by name`,
      sql<Record<string, unknown>>`select id, name, prefix, created_at, last_used from api_keys where user_id = ${owner} order by created_at desc`,
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
    ]);

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

  return {
    today: todayISO(),
    ownerId: owner,
    role: scoped.role,
    profile: mapProfile(profileRows[0]),
    invites: scoped.role === "owner" ? invites.map(mapAccess) : [],
    shared: shared.map(mapAccess),
    accounts: accounts.map(mapAccount),
    categories: categories.map(mapCategory),
    rules: rules.map(mapRule),
    people: people.map(mapPerson),
    transactions: transactions.map(mapTxn),
    bills: bills.map(mapBill),
    payments: payments.map(mapPayment),
    assets: assets.map(mapAsset),
    valuations: valuations.map(mapValuation),
    snapshots: snapshots.map(mapSnapshot),
    goals: goals.map(mapGoal),
    contributions: contributions.map(mapContribution),
    plan: plan.map(mapPlan),
    watches: watches.map(mapWatch),
    readAlerts: reads.map((r) => r.alert_key),
    reminders: reminders.map(mapReminder),
    documents: documents.map(mapDocument),
    scores: scores.map(mapScore),
    milestones: milestones.map(mapMilestone),
    lots: lots.map(mapLot),
    prices: prices.map(mapPrice),
    flows: flows.map(mapFlow),
    sketches: sketches.map(mapSketch),
    ledgers: assembleLedgers(ledgers, bizAccounts, bizCategories, bizTxns, bizBills, draws),
    reports: reports.map(mapReport),
    keys: keys.map(mapKey),
    messages: messages.map(mapMessage).reverse(),
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
    archived: Boolean(r.archived),
    sort: num(r.sort),
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
    status: String(r.status ?? "paid"),
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

function assembleLedgers(
  ledgers: Record<string, unknown>[],
  accounts: Record<string, unknown>[],
  categories: Record<string, unknown>[],
  transactions: Record<string, unknown>[],
  bills: Record<string, unknown>[],
  draws: Record<string, unknown>[],
): LedgerBook[] {
  return ledgers.map((row) => {
    const id = String(row.id);
    const form = String(row.tax_form || "C").toUpperCase();
    return {
      id,
      name: String(row.name),
      taxForm: form === "E" || form === "F" ? form : "C",
      activity: String(row.activity ?? ""),
      archived: Boolean(row.archived),
      accounts: accounts.filter((a) => String(a.ledger_id) === id).map(mapAccount),
      categories: categories.filter((c) => String(c.ledger_id) === id).map(mapCategory),
      transactions: transactions.filter((t) => String(t.ledger_id) === id).map(mapTxn),
      bills: bills.filter((b) => String(b.ledger_id) === id).map(mapBill),
      draws: draws.filter((d) => String(d.ledger_id) === id).map(mapDraw),
    };
  });
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
  return { id: String(r.id), name: String(r.name), prefix: String(r.prefix), createdAt: stamp(r.created_at) ?? "", lastUsed: stamp(r.last_used) };
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

export async function applyAction(userId: string, action: Action): Promise<ActionResult> {
  const sql = await getSql();
  await ensureProfile(sql, userId);
  if (action.type === "invite.accept") return acceptInvite(sql, userId, action.code);

  const scoped = await scope(sql, userId, action.ownerId);
  const owner = scoped.owner;
  const ownerOnly = new Set(["profile.update", "invite.create", "invite.revoke", "apikey.create", "apikey.revoke", "sample.clear", "sample.load"]);
  if (ownerOnly.has(action.type)) assertOwner(scoped.role);
  else assertEdit(scoped.role);

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
          insert into accounts (id, user_id, name, institution, kind, mask, balance_cents, limit_cents, apr_bps, connected, archived, opened_on, custom_json)
          values (${id}, ${owner}, ${str(a.name, 80)}, ${str(a.institution, 80)}, ${kind}, ${str(a.mask, 8)}, ${num(a.balanceCents)}, ${a.limitCents == null ? null : num(a.limitCents)}, ${a.aprBps == null ? null : num(a.aprBps)}, ${Boolean(a.connected)}, false, ${a.openedOn ? dateOr(a.openedOn, todayISO()) : null}, ${str(a.customJson, 2000) || "[]"})
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
          insert into categories (id, user_id, name, section, flow, tax_schedule, tax_line, icon, monthly_cents, rollover, sort, archived)
          values (${id}, ${owner}, ${str(c.name, 60)}, ${str(c.section, 40) || "Everyday"}, ${flow}, ${str(c.taxSchedule, 2).toUpperCase()}, ${str(c.taxLine, 40)}, ${str(c.icon, 20) || "tag"}, ${Math.max(0, num(c.monthlyCents))}, ${c.rollover !== false}, ${num(c.sort)}, false)
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
        await sql`insert into rules (id, user_id, pattern, category_id, priority) values (${id}, ${owner}, ${pattern}, ${action.rule.categoryId}, ${num(action.rule.priority)})`;
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
      const existing = await sql`select id from people where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`update people set name = ${name}, relation = ${relation}, sort = ${num(p.sort)} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`insert into people (id, user_id, name, relation, archived, sort) values (${id}, ${owner}, ${name}, ${relation}, false, ${num(p.sort)})`;
      }
      return {};
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
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id, tags)
          values (${id}, ${owner}, ${t.accountId}, ${t.categoryId || null}, ${posted}, ${amount}, ${str(t.merchant, 120)}, ${str(t.memo, 240)}, ${Boolean(t.pending)}, ${str(t.taxSchedule, 2).toUpperCase()}, ${str(t.taxLine, 40)}, ${t.reviewed !== false}, ${str(t.source, 20) || "manual"}, ${personId}, ${tagsJson ?? "[]"})
        `;
      }
      return {};
    }
    case "txn.delete": {
      const existing = await sql<{ account_id: string; amount_cents: number }>`
        select account_id, amount_cents from transactions where id = ${action.id} and user_id = ${owner}
      `;
      if (existing[0]) await adjust(sql, owner, existing[0].account_id, -num(existing[0].amount_cents));
      await sql`delete from transactions where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "txn.import": {
      const rows = action.rows.slice(0, 500);
      const cats = await sql<{ id: string; name: string }>`select id, name from categories where user_id = ${owner} and ledger_id = ''`;
      const rules = await sql<{ pattern: string; category_id: string; priority: number }>`select pattern, category_id, priority from rules where user_id = ${owner}`;
      for (const row of rows) {
        const posted = dateOr(row.postedOn, "");
        if (!posted) continue;
        const categoryId = matchCategory(row.merchant, row.memo, rules.map((r) => ({ pattern: r.pattern, categoryId: r.category_id, priority: num(r.priority) })), cats);
        const id = nid();
        const amount = num(row.amountCents);
        await adjust(sql, owner, action.accountId, amount);
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source)
          values (${id}, ${owner}, ${action.accountId}, ${categoryId}, ${posted}, ${amount}, ${str(row.merchant, 120)}, ${str(row.memo, 240)}, false, '', '', ${categoryId ? true : false}, 'import')
        `;
      }
      return {};
    }
    case "txn.recategorize": {
      const cats = await sql<{ id: string; name: string }>`select id, name from categories where user_id = ${owner} and ledger_id = ''`;
      const rules = await sql<{ pattern: string; category_id: string; priority: number }>`select pattern, category_id, priority from rules where user_id = ${owner}`;
      const txns = await sql<{ id: string; merchant: string; memo: string; category_id: string | null; reviewed: boolean }>`
        select id, merchant, memo, category_id, reviewed from transactions where user_id = ${owner} and ledger_id = ''
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
      };
      if (existing.length) {
        await sql`
          update bills set
            name = ${fields.name}, payee = ${fields.payee}, kind = ${fields.kind}, direction = ${fields.direction},
            category_id = ${fields.category_id}, account_id = ${fields.account_id}, debt_account_id = ${fields.debt_account_id},
            amount_cents = ${fields.amount_cents}, principal_cents = ${fields.principal_cents}, cadence = ${fields.cadence},
            next_due = ${fields.next_due}, autopay = ${fields.autopay}, status = ${fields.status}, variable = ${fields.variable},
            notes = ${fields.notes}, url = ${fields.url}, person_id = ${fields.person_id}
          where id = ${id} and user_id = ${owner}
        `;
      } else {
        await sql`
          insert into bills (id, user_id, name, payee, kind, direction, category_id, account_id, debt_account_id, amount_cents, principal_cents, cadence, next_due, autopay, status, variable, notes, url, person_id)
          values (${id}, ${owner}, ${fields.name}, ${fields.payee}, ${fields.kind}, ${fields.direction}, ${fields.category_id}, ${fields.account_id}, ${fields.debt_account_id}, ${fields.amount_cents}, ${fields.principal_cents}, ${fields.cadence}, ${fields.next_due}, ${fields.autopay}, ${fields.status}, ${fields.variable}, ${fields.notes}, ${fields.url}, ${fields.person_id})
        `;
      }
      return {};
    }
    case "bill.delete": {
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
      const txnId = nid();
      await adjust(sql, owner, bill.accountId, signed);
      await sql`
        insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id)
        values (${txnId}, ${owner}, ${bill.accountId}, ${bill.categoryId}, ${paidOn}, ${signed}, ${bill.payee || bill.name}, ${"Recorded from " + bill.name}, false, '', '', true, 'bill', ${bill.personId})
      `;
      if (bill.direction !== "in" && bill.debtAccountId && bill.principalCents) {
        const principal = Math.min(bill.principalCents, amount);
        await sql`update accounts set balance_cents = greatest(0, balance_cents - ${principal}) where id = ${bill.debtAccountId} and user_id = ${owner}`;
      }
      await sql`
        insert into bill_payments (id, user_id, bill_id, paid_on, amount_cents, account_id, transaction_id, status)
        values (${nid()}, ${owner}, ${bill.id}, ${paidOn}, ${amount}, ${bill.accountId}, ${txnId}, 'paid')
      `;
      const next = stepDue(bill.nextDue < paidOn ? paidOn : bill.nextDue, bill.cadence);
      await sql`update bills set next_due = ${next} where id = ${bill.id} and user_id = ${owner}`;
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
          insert into goals (id, user_id, name, target_cents, saved_cents, target_date, monthly_cents, priority, notes, archived)
          values (${id}, ${owner}, ${str(g.name, 80)}, ${Math.max(0, num(g.targetCents))}, ${Math.max(0, num(g.savedCents))}, ${g.targetDate ? dateOr(g.targetDate, todayISO()) : null}, ${Math.max(0, num(g.monthlyCents))}, ${num(g.priority)}, ${str(g.notes, 400)}, false)
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
      const id = `plan_${action.categoryId}_${month}`;
      const assigned = Math.max(0, num(action.assignedCents));
      await sql`
        insert into plan_months (id, user_id, category_id, month, assigned_cents)
        values (${id}, ${owner}, ${action.categoryId}, ${month}, ${assigned})
        on conflict (user_id, category_id, month) do update set assigned_cents = ${assigned}
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
          insert into watchlists (id, user_id, name, kind, ref_id, ref_name, comparator, threshold_cents, enabled, note)
          values (${id}, ${owner}, ${str(w.name, 80)}, ${kind}, ${str(w.refId, 80)}, ${str(w.refName, 80)}, ${str(w.comparator, 8) || "gt"}, ${num(w.thresholdCents)}, true, ${str(w.note, 240)})
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
          insert into reminders (id, user_id, title, due_on, href, related_type, related_id, done, repeat, notes)
          values (${id}, ${owner}, ${str(r.title, 120)}, ${dateOr(r.dueOn, todayISO())}, ${str(r.href, 200)}, ${str(r.relatedType, 20)}, ${str(r.relatedId, 80)}, ${Boolean(r.done)}, ${str(r.repeat, 20) || "none"}, ${str(r.notes, 400)})
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
          insert into documents (id, user_id, title, kind, year, related_type, related_id, notes, body, encrypted, file_name)
          values (${id}, ${owner}, ${str(d.title, 120)}, ${str(d.kind, 20) || "other"}, ${d.year == null ? null : num(d.year)}, ${str(d.relatedType, 20)}, ${str(d.relatedId, 80)}, ${str(d.notes, 500)}, ${body}, ${Boolean(d.encrypted)}, ${str(d.fileName, 120)})
        `;
      }
      return {};
    }
    case "document.delete": {
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
          insert into milestones (id, user_id, name, kind, target_cents, target_date, current_cents, monthly_cents, annual_return_bps, notes)
          values (${id}, ${owner}, ${str(m.name, 80)}, ${str(m.kind, 20) || "savings"}, ${Math.max(0, num(m.targetCents))}, ${m.targetDate ? dateOr(m.targetDate, todayISO()) : null}, ${num(m.currentCents)}, ${num(m.monthlyCents)}, ${num(m.annualReturnBps, 500)}, ${str(m.notes, 400)})
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
        const cats = await sql<{ id: string }>`select id from categories where user_id = ${owner} and lower(name) = 'dividends' limit 1`;
        transactionId = nid();
        const merchant = symbol ? `${symbol} dividend` : "Dividend";
        await adjust(sql, owner, accountId, amount);
        await sql`
          insert into transactions (id, user_id, account_id, category_id, posted_on, amount_cents, merchant, memo, pending, tax_schedule, tax_line, reviewed, source, person_id)
          values (${transactionId}, ${owner}, ${accountId}, ${cats[0]?.id ?? null}, ${posted}, ${amount}, ${merchant}, ${str(f.memo, 240) || "Portfolio dividend"}, false, 'B', 'dividends', true, 'investment', null)
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
          insert into reports (id, user_id, name, metric, range_key, group_by, filters_json)
          values (${id}, ${owner}, ${str(r.name, 80)}, ${str(r.metric, 20) || "spending"}, ${str(r.rangeKey, 20) || "month"}, ${str(r.groupBy, 20) || "category"}, ${str(r.filtersJson, 1000) || "{}"})
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
      return { code };
    }
    case "invite.revoke": {
      await sql`update book_access set status = 'revoked' where id = ${action.id} and owner_user_id = ${owner}`;
      return {};
    }
    case "apikey.create": {
      const token = `hj_${randomBytes(24).toString("base64url")}`;
      const hash = createHash("sha256").update(token).digest("hex");
      await sql`
        insert into api_keys (id, user_id, name, prefix, token_hash)
        values (${nid()}, ${owner}, ${str(action.name, 60) || "Key"}, ${token.slice(0, 10)}, ${hash})
      `;
      return { token };
    }
    case "apikey.revoke": {
      await sql`delete from api_keys where id = ${action.id} and user_id = ${owner}`;
      return {};
    }
    case "sample.clear": {
      await clearHousehold(sql, owner);
      await seedStarter(sql, owner);
      await sql`update profiles set seeded = false, initialized = true where user_id = ${owner}`;
      return {};
    }
    case "sample.load": {
      await seedHousehold(sql, owner);
      return {};
    }
    case "advisor.log": {
      await sql`insert into ai_messages (id, user_id, role, content) values (${nid()}, ${owner}, 'user', ${str(action.question, 4000)})`;
      await sql`insert into ai_messages (id, user_id, role, content) values (${nid()}, ${owner}, 'assistant', ${str(action.answer, 8000)})`;
      return {};
    }
    case "ledger.save": {
      const name = str(action.ledger.name, 80);
      if (!name) throw new Error("Name the business.");
      const id = str(action.ledger.id, 80) || nid();
      const activity = str(action.ledger.activity, 80);
      const requested = str(action.ledger.taxForm, 1).toUpperCase();
      const taxForm = requested === "E" || requested === "F" ? requested : "C";
      const existing = await sql`select id from ledgers where id = ${id} and user_id = ${owner}`;
      if (existing.length) {
        await sql`update ledgers set name = ${name}, activity = ${activity} where id = ${id} and user_id = ${owner}`;
      } else {
        await sql`
          insert into ledgers (id, user_id, name, tax_form, activity, archived, sort)
          values (${id}, ${owner}, ${name}, ${taxForm}, ${activity}, false, 0)
        `;
        await seedLedgerCategories(sql, owner, id, taxForm);
      }
      return {};
    }
    case "biz.account.save": {
      const ledger = await sql`select id from ledgers where id = ${action.ledgerId} and user_id = ${owner}`;
      if (!ledger[0]) throw new Error("That business is not in this household.");
      const name = str(action.account.name, 80);
      if (!name) throw new Error("Name the account.");
      const kind = ["checking", "savings", "cash", "credit"].includes(String(action.account.kind)) ? String(action.account.kind) : "checking";
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
      const homeAcct = await sql`select id from accounts where id = ${action.homeAccountId} and user_id = ${owner} and ledger_id = ''`;
      if (!bizAcct[0] || !homeAcct[0]) throw new Error("Pick a business account and a household account.");
      const equity = await sql<{ id: string }>`
        select id from categories where user_id = ${owner} and ledger_id = ${action.ledgerId} and tax_line = ${direction} limit 1
      `;
      const homeCat = await sql<{ id: string }>`
        select id from categories where user_id = ${owner} and ledger_id = '' and flow = 'transfer' order by name limit 1
      `;
      if (!equity[0] || !homeCat[0]) throw new Error("Missing the equity category, or the household Transfer category.");
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
        values (${homeTxn}, ${owner}, ${action.homeAccountId}, ${homeCat[0].id}, ${posted}, ${-bizSigned}, ${label}, ${ledger[0].name}, false, '', '', true, 'draw', '[]', '')
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
  const rows = await sql<{ id: number; owner_user_id: string; status: string }>`
    select id, owner_user_id, status from book_access where invite_code = ${clean}
  `;
  const row = rows[0];
  if (!row || row.status === "revoked") throw new Error("That invite code is not active.");
  if (row.owner_user_id === userId) throw new Error("That's your own household.");
  await sql`update book_access set member_user_id = ${userId}, status = 'active' where id = ${row.id}`;
  return {};
}

export async function advisorContext(userId: string, ownerId: string | undefined) {
  const ws = await loadWorkspace(userId, ownerId);
  return ws;
}
