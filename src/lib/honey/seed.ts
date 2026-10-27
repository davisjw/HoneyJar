import type { Sql } from "@/lib/db";
import { addDays, addMonths, LEDGER_LINES, periodOf, todayISO } from "./calc";
import { calderUtilityHistory, starterColumns } from "./utility";

type Row = Record<string, string | number | boolean | null>;

async function put(sql: Sql, table: string, row: Row) {
  const keys = Object.keys(row);
  const cols = keys.join(", ");
  const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
  await sql.query(`insert into ${table} (${cols}) values (${ph}) on conflict do nothing`, keys.map((k) => row[k]));
}

export async function clearHousehold(sql: Sql, userId: string) {
  const tables = [
    "utility_readings",
    "utility_columns",
    "utility_meters",
    "transactions",
    "bill_payments",
    "bills",
    "rules",
    "plan_months",
    "valuations",
    "snapshots",
    "assets",
    "contributions",
    "goals",
    "watchlists",
    "reminders",
    "documents",
    "credit_scores",
    "milestones",
    "reports",
    "ai_messages",
    "categories",
    "portfolio_flows",
    "prices",
    "lots",
    "retirement_sketches",
    "accounts",
    "ledgers",
    "draws",
    "invoices",
    "leases",
    "mileage",
    "realizations",
    "people",
    "contacts",
  ];
  for (const table of tables) {
    await sql.query(`delete from ${table} where user_id = $1`, [userId]);
  }
}

const STARTER: [string, string, string, string, string, number][] = [
  ["Paycheck", "Income", "in", "", "", 0],
  ["Interest", "Income", "in", "B", "interest", 0],
  ["Dividends", "Income", "in", "B", "dividends", 0],
  ["Groceries", "Everyday", "out", "", "", 65000],
  ["Dining", "Everyday", "out", "", "", 25000],
  ["Shopping", "Everyday", "out", "", "", 20000],
  ["Health", "Everyday", "out", "A", "medical", 8000],
  ["Charity", "Giving", "out", "A", "charity", 10000],
  ["Mortgage", "Home", "out", "", "", 0],
  ["Mortgage interest", "Home", "out", "A", "mortgage_interest", 0],
  ["Property tax", "Home", "out", "A", "salt", 0],
  ["Utilities", "Home", "out", "", "", 40000],
  ["Internet", "Home", "out", "", "", 8000],
  ["Insurance", "Home", "out", "", "", 17000],
  ["Gas", "Transport", "out", "", "", 15000],
  ["Transit", "Transport", "out", "", "", 6000],
  ["Auto loan", "Transport", "out", "", "", 0],
  ["Subscriptions", "Lifestyle", "out", "", "", 5000],
  ["Phone", "Lifestyle", "out", "", "", 9500],
  ["Transfer", "Transfers", "transfer", "", "", 0],
  ["Uncategorized", "Inbox", "out", "", "", 0],
];

export async function seedPersonalCategories(sql: Sql, userId: string, ledgerId: string) {
  const sid = slug(ledgerId);
  let sort = 0;
  for (const [name, section, flow, schedule, line, monthly] of STARTER) {
    sort += 1;
    await put(sql, "categories", {
      id: `c_${sid}_${slug(name)}`,
      user_id: userId,
      name,
      section,
      flow,
      tax_schedule: schedule,
      tax_line: line,
      icon: "tag",
      monthly_cents: monthly,
      rollover: flow === "out",
      sort,
      archived: false,
      ledger_id: ledgerId,
    });
  }
}

/** The household's existing rows become its first personal jar. Later jars get their own ids. */
export async function ensureJars(sql: Sql, userId: string) {
  const sid = slug(userId);
  const id = `p_${sid}_home`;
  const prof = await sql<{ display_name: string }>`select display_name from profiles where user_id = ${userId}`;
  const name = String(prof[0]?.display_name || "Personal").slice(0, 80);
  await sql`
    insert into ledgers (id, user_id, name, tax_form, activity, archived, sort, kind)
    values (${id}, ${userId}, ${name}, '', '', false, 0, 'personal')
    on conflict (id) do nothing
  `;
  const ledger = await sql<{ kind: string }>`select kind from ledgers where id = ${id} and user_id = ${userId}`;
  if (ledger[0] && ledger[0].kind !== "personal") {
    await sql`update ledgers set kind = 'personal' where id = ${id} and user_id = ${userId}`;
  }
  for (const table of ["accounts", "categories", "transactions", "bills", "rules", "plan_months", "goals", "milestones", "watchlists", "reminders", "documents", "reports", "utility_meters"]) {
    const blank = await sql.query(`select 1 from ${table} where user_id = $1 and ledger_id = '' limit 1`, [userId]);
    if (!blank.length) continue;
    await sql.query(`update ${table} set ledger_id = $1 where user_id = $2 and ledger_id = ''`, [id, userId]);
  }
}

export async function seedStarter(sql: Sql, userId: string) {
  const sid = slug(userId);
  let sort = 0;
  for (const [name, section, flow, schedule, line, monthly] of STARTER) {
    sort += 1;
    await put(sql, "categories", {
      id: `c_${sid}_${slug(name)}`,
      user_id: userId,
      name,
      section,
      flow,
      tax_schedule: schedule,
      tax_line: line,
      icon: "tag",
      monthly_cents: monthly,
      rollover: flow === "out",
      sort,
      archived: false,
    });
  }
}

export async function seedBlank(sql: Sql, userId: string) {
  await seedStarter(sql, userId);
  await sql`update categories set monthly_cents = 0 where user_id = ${userId}`;
  await ensureJars(sql, userId);
}

export async function seedHousehold(sql: Sql, userId: string) {
  await clearHousehold(sql, userId);
  await seedStarter(sql, userId);
  const sid = slug(userId);
  const id = (s: string) => `s_${sid}_${s}`;
  const today = todayISO();
  const cat = (name: string) => `c_${sid}_${slug(name)}`;
  const checking = id("chk");
  const savings = id("sav");
  const card = id("card");
  const auto = id("auto");
  const mortgage = id("mtg");
  const home = id("home");
  const car = id("car");
  const jordan = id("p_jordan");
  const avery = id("p_avery");
  const remy = id("p_remy");
  const personByKey = { jordan, avery, remy };

  await sql.query(
    `update profiles set
      display_name = 'Calder household',
      currency = 'USD',
      filing_status = 'mfj',
      state_code = 'CA',
      dependents = 1,
      wages_cents = 16800000,
      other_income_cents = 84000,
      withholding_cents = 2280000,
      estimated_paid_cents = 0,
      prior_year_tax_cents = 1860000,
      deduction_mode = 'auto',
      salt_cap_cents = 1000000,
      state_rate_bps = 450,
      seeded = true,
      initialized = true,
      month_start_day = 1
    where user_id = $1`,
    [userId],
  );

  const accounts: Row[] = [
    { id: checking, user_id: userId, name: "Everyday checking", institution: "First Harbor", kind: "checking", mask: "4418", balance_cents: 428000, limit_cents: null, apr_bps: null, connected: true, archived: false, opened_on: "2019-04-02", custom_json: "[]" },
    { id: savings, user_id: userId, name: "Reserve savings", institution: "First Harbor", kind: "savings", mask: "9021", balance_cents: 1845000, limit_cents: null, apr_bps: 410, connected: true, archived: false, opened_on: "2019-04-02", custom_json: "[]" },
    { id: card, user_id: userId, name: "Honey Card", institution: "Northline", kind: "credit", mask: "1882", balance_cents: 124000, limit_cents: 1200000, apr_bps: 2199, connected: true, archived: false, opened_on: "2021-11-14", custom_json: "[]" },
    { id: auto, user_id: userId, name: "CR-V loan", institution: "Kindred Auto", kind: "loan", mask: "3370", balance_cents: 860000, limit_cents: null, apr_bps: 499, connected: false, archived: false, opened_on: "2023-06-01", custom_json: "[]" },
    { id: mortgage, user_id: userId, name: "Home mortgage", institution: "First Harbor", kind: "mortgage", mask: "2204", balance_cents: 41200000, limit_cents: null, apr_bps: 589, connected: true, archived: false, opened_on: "2018-08-16", custom_json: "[]" },
  ];
  for (const row of accounts) await put(sql, "accounts", row);

  await put(sql, "assets", {
    id: home,
    user_id: userId,
    name: "1842 Telegraph Ave",
    kind: "home",
    value_cents: 86500000,
    as_of: today,
    loan_account_id: mortgage,
    address: "1842 Telegraph Ave, Oakland, CA 94612",
    zillow_url: "https://www.zillow.com/homes/1842%20Telegraph%20Ave%2C%20Oakland%2C%20CA%2094612_rb/",
    zestimate_cents: 86500000,
    detail: "3 bed · 2 bath · 1924 craftsman",
    custom_json: JSON.stringify([
      { k: "Beds", v: "3" },
      { k: "Baths", v: "2" },
    ]),
  });
  await put(sql, "assets", {
    id: car,
    user_id: userId,
    name: "2019 Honda CR-V",
    kind: "vehicle",
    value_cents: 1840000,
    as_of: today,
    loan_account_id: auto,
    address: "",
    zillow_url: "",
    zestimate_cents: null,
    detail: "68,400 miles",
    custom_json: JSON.stringify([
      { k: "Year", v: "2019" },
      { k: "Mileage", v: "68400" },
    ]),
  });

  for (let i = 12; i >= 1; i--) {
    const asOf = addMonths(today, -i).slice(0, 8) + "01";
    const homeV = 82000000 + (12 - i) * 375000;
    await put(sql, "valuations", {
      id: id(`val${i}`),
      user_id: userId,
      asset_id: home,
      as_of: asOf,
      value_cents: homeV,
      source: i % 2 === 0 ? "zillow" : "manual",
    });
    const assets = homeV + 1900000 + 420000 + 1500000;
    const debts = 43000000 - (12 - i) * 140000 + 980000 + 140000;
    await put(sql, "snapshots", {
      id: id(`snap${i}`),
      user_id: userId,
      as_of: asOf,
      assets_cents: assets,
      debts_cents: debts,
    });
  }
  await put(sql, "valuations", {
    id: id("valnow"),
    user_id: userId,
    asset_id: home,
    as_of: today,
    value_cents: 86500000,
    source: "zillow",
  });

  await put(sql, "people", { id: jordan, user_id: userId, name: "Jordan Calder", relation: "adult", archived: false, sort: 0 });
  await put(sql, "people", { id: avery, user_id: userId, name: "Avery Calder", relation: "adult", archived: false, sort: 1 });
  await put(sql, "people", { id: remy, user_id: userId, name: "Remy Calder", relation: "child", archived: false, sort: 2 });

  const txns: { day: number; acct: string; cat: string; amt: number; merchant: string; memo?: string; tax?: string; line?: string }[] = [];
  for (let i = 0; i < 6; i++) {
    txns.push({ day: -2 - i * 14, acct: checking, cat: "Paycheck", amt: 364000, merchant: "Northwind Payroll", memo: "Jordan + Avery" });
  }
  const groceries = [-8420, -6130, -9900, -4575, -7120, -5380, -8800, -6240];
  groceries.forEach((amt, i) => {
    const merchants = ["Berkeley Bowl", "Trader Joe's", "Whole Foods", "Safeway"];
    txns.push({ day: -1 - i * 6, acct: card, cat: "Groceries", amt, merchant: merchants[i % merchants.length]! });
  });
  const dining: [number, string][] = [
    [-1860, "Blue Bottle"],
    [-4280, "Pizzaiolo"],
    [-1540, "Starbucks"],
    [-6400, "Comal"],
    [-2200, "DoorDash"],
    [-980, "Blue Bottle"],
  ];
  dining.forEach(([amt, merchant], i) => txns.push({ day: -3 - i * 8, acct: card, cat: "Dining", amt, merchant }));
  txns.push({ day: -11, acct: checking, cat: "Insurance", amt: -16400, merchant: "State Farm", memo: "Home + auto" });
  txns.push({ day: -41, acct: checking, cat: "Insurance", amt: -16400, merchant: "State Farm" });
  txns.push({ day: -4, acct: card, cat: "Subscriptions", amt: -1549, merchant: "Netflix" });
  txns.push({ day: -8, acct: card, cat: "Subscriptions", amt: -1199, merchant: "Spotify" });
  txns.push({ day: -15, acct: card, cat: "Subscriptions", amt: -1099, merchant: "iCloud" });
  txns.push({ day: -5, acct: card, cat: "Gas", amt: -6420, merchant: "Chevron" });
  txns.push({ day: -20, acct: card, cat: "Gas", amt: -5880, merchant: "Shell" });
  txns.push({ day: -18, acct: card, cat: "Transit", amt: -2460, merchant: "Uber" });
  txns.push({ day: -7, acct: card, cat: "Shopping", amt: -8420, merchant: "Target" });
  txns.push({ day: -22, acct: card, cat: "Shopping", amt: -12640, merchant: "Amazon" });
  txns.push({ day: -28, acct: checking, cat: "Health", amt: -4500, merchant: "Kaiser Pharmacy", tax: "A", line: "medical" });
  txns.push({ day: -16, acct: checking, cat: "Charity", amt: -10000, merchant: "Oakland Food Bank", tax: "A", line: "charity" });
  txns.push({ day: -46, acct: checking, cat: "Charity", amt: -10000, merchant: "Oakland Food Bank", tax: "A", line: "charity" });
  txns.push({ day: -10, acct: checking, cat: "Mortgage interest", amt: -168000, merchant: "First Harbor Mortgage", memo: "Interest portion", tax: "A", line: "mortgage_interest" });
  txns.push({ day: -10, acct: checking, cat: "Mortgage", amt: -116000, merchant: "First Harbor Mortgage", memo: "Principal" });
  txns.push({ day: -40, acct: checking, cat: "Mortgage interest", amt: -169200, merchant: "First Harbor Mortgage", tax: "A", line: "mortgage_interest" });
  txns.push({ day: -40, acct: checking, cat: "Mortgage", amt: -114800, merchant: "First Harbor Mortgage", memo: "Principal" });
  txns.push({ day: -13, acct: checking, cat: "Auto loan", amt: -38500, merchant: "Kindred Auto" });
  txns.push({ day: -43, acct: checking, cat: "Auto loan", amt: -38500, merchant: "Kindred Auto" });
  txns.push({ day: -21, acct: checking, cat: "Interest", amt: 6200, merchant: "First Harbor Interest", tax: "B", line: "interest" });
  txns.push({ day: -25, acct: checking, cat: "Dividends", amt: 8400, merchant: "Index fund dividend", tax: "B", line: "dividends" });
  txns.push({ day: -33, acct: checking, cat: "Property tax", amt: -210000, merchant: "Alameda County Tax", tax: "A", line: "salt" });
  txns.push({ day: -19, acct: card, cat: "Shopping", amt: -2460, merchant: "Home Depot" });
  txns.push({ day: -50, acct: card, cat: "Groceries", amt: -7340, merchant: "Costco" });

  let n = 0;
  for (const t of txns) {
    n += 1;
    const posted = addDays(today, t.day);
    await put(sql, "transactions", {
      id: id(`t${n}`),
      user_id: userId,
      account_id: t.acct,
      category_id: cat(t.cat),
      posted_on: posted,
      amount_cents: t.amt,
      merchant: t.merchant,
      memo: t.memo ?? "",
      pending: false,
      tax_schedule: t.tax ?? "",
      tax_line: t.line ?? "",
      reviewed: true,
      source: "sample",
      person_id: (() => {
        const key = samplePersonKey(t.merchant);
        return key ? personByKey[key] : null;
      })(),
      tags: JSON.stringify(sampleTags(t.merchant)),
    });
  }

  const month = periodOf(today, 1);
  const prev = addMonths(`${month}-01`, -1).slice(0, 7);
  const prev2 = addMonths(`${month}-01`, -2).slice(0, 7);
  const budgets: [string, number][] = [
    ["Groceries", 65000],
    ["Dining", 25000],
    ["Shopping", 20000],
    ["Health", 8000],
    ["Charity", 10000],
    ["Utilities", 40000],
    ["Internet", 8000],
    ["Insurance", 17000],
    ["Gas", 15000],
    ["Transit", 6000],
    ["Subscriptions", 5000],
    ["Phone", 9500],
    ["Mortgage interest", 168000],
    ["Mortgage", 116000],
    ["Auto loan", 38500],
  ];
  for (const m of [prev2, prev, month]) {
    for (const [name, amt] of budgets) {
      await put(sql, "plan_months", {
        id: id(`p_${slug(name)}_${m}`),
        user_id: userId,
        category_id: cat(name),
        month: m,
        assigned_cents: amt,
      });
    }
  }

  const bills: Row[] = [
    { id: id("b_mtg"), user_id: userId, name: "Mortgage", payee: "First Harbor", kind: "bill", direction: "out", category_id: cat("Mortgage interest"), account_id: checking, debt_account_id: mortgage, amount_cents: 284000, principal_cents: 116000, cadence: "monthly", next_due: nextDom(today, 1), autopay: true, status: "active", variable: false, notes: "Interest is tagged for Schedule A when you record the split.", url: "" },
    { id: id("b_pge"), user_id: userId, name: "PG&E", payee: "PG&E", kind: "utility", direction: "out", category_id: cat("Utilities"), account_id: checking, debt_account_id: null, amount_cents: 18600, principal_cents: null, cadence: "monthly", next_due: nextDom(today, 18), autopay: true, status: "active", variable: true, notes: "", url: "https://www.pge.com" },
    { id: id("b_water"), user_id: userId, name: "EBMUD water", payee: "EBMUD", kind: "utility", direction: "out", category_id: cat("Utilities"), account_id: checking, debt_account_id: null, amount_cents: 4200, principal_cents: null, cadence: "monthly", next_due: nextDom(today, 22), autopay: false, status: "active", variable: true, notes: "", url: "" },
    { id: id("b_net"), user_id: userId, name: "Xfinity", payee: "Xfinity", kind: "utility", direction: "out", category_id: cat("Internet"), account_id: checking, debt_account_id: null, amount_cents: 8000, principal_cents: null, cadence: "monthly", next_due: nextDom(today, 9), autopay: true, status: "active", variable: false, notes: "", url: "" },
    { id: id("b_phone"), user_id: userId, name: "T-Mobile", payee: "T-Mobile", kind: "utility", direction: "out", category_id: cat("Phone"), account_id: card, debt_account_id: null, amount_cents: 9500, principal_cents: null, cadence: "monthly", next_due: nextDom(today, 6), autopay: true, status: "active", variable: false, notes: "", url: "" },
    { id: id("b_ins"), user_id: userId, name: "State Farm", payee: "State Farm", kind: "bill", direction: "out", category_id: cat("Insurance"), account_id: checking, debt_account_id: null, amount_cents: 16400, principal_cents: null, cadence: "monthly", next_due: nextDom(today, 11), autopay: true, status: "active", variable: false, notes: "Home and auto bundle", url: "" },
    { id: id("b_nf"), user_id: userId, name: "Netflix", payee: "Netflix", kind: "subscription", direction: "out", category_id: cat("Subscriptions"), account_id: card, debt_account_id: null, amount_cents: 1549, principal_cents: null, cadence: "monthly", next_due: nextDom(today, 4), autopay: true, status: "active", variable: false, notes: "", url: "https://www.netflix.com", person_id: avery },
    { id: id("b_sp"), user_id: userId, name: "Spotify", payee: "Spotify", kind: "subscription", direction: "out", category_id: cat("Subscriptions"), account_id: card, debt_account_id: null, amount_cents: 1199, principal_cents: null, cadence: "monthly", next_due: nextDom(today, 8), autopay: true, status: "active", variable: false, notes: "", url: "", person_id: avery },
    { id: id("b_auto"), user_id: userId, name: "CR-V payment", payee: "Kindred Auto", kind: "bill", direction: "out", category_id: cat("Auto loan"), account_id: checking, debt_account_id: auto, amount_cents: 38500, principal_cents: 31000, cadence: "monthly", next_due: nextDom(today, 13), autopay: true, status: "active", variable: false, notes: "", url: "" },
    { id: id("b_pay"), user_id: userId, name: "Paycheck", payee: "Northwind", kind: "bill", direction: "in", category_id: cat("Paycheck"), account_id: checking, debt_account_id: null, amount_cents: 364000, principal_cents: null, cadence: "biweekly", next_due: addDays(today, 12), autopay: false, status: "active", variable: false, notes: "Net deposit", url: "", person_id: jordan },
  ];
  for (const b of bills) await put(sql, "bills", b);

  await put(sql, "rules", { id: id("r1"), user_id: userId, pattern: "blue bottle", category_id: cat("Dining"), priority: 10 });
  await put(sql, "rules", { id: id("r2"), user_id: userId, pattern: "berkeley bowl", category_id: cat("Groceries"), priority: 10 });
  await put(sql, "rules", { id: id("r3"), user_id: userId, pattern: "northwind", category_id: cat("Paycheck"), priority: 20 });

  await put(sql, "goals", { id: id("g_ef"), user_id: userId, name: "Emergency fund", target_cents: 2500000, saved_cents: 1845000, target_date: addMonths(today, 8).slice(0, 8) + "01", monthly_cents: 80000, priority: 1, notes: "Six months of must-pay bills.", archived: false });
  await put(sql, "goals", { id: id("g_trip"), user_id: userId, name: "Summer trip", target_cents: 400000, saved_cents: 145000, target_date: addMonths(today, 9).slice(0, 8) + "01", monthly_cents: 30000, priority: 2, notes: "", archived: false });
  await put(sql, "goals", { id: id("g_roof"), user_id: userId, name: "Roof reserve", target_cents: 1800000, saved_cents: 260000, target_date: addMonths(today, 30).slice(0, 8) + "01", monthly_cents: 50000, priority: 3, notes: "Tied to the Telegraph house.", archived: false });
  await put(sql, "contributions", { id: id("gc1"), user_id: userId, goal_id: id("g_trip"), amount_cents: 30000, contributed_on: addDays(today, -20), note: "Monthly" });
  await put(sql, "contributions", { id: id("gc2"), user_id: userId, goal_id: id("g_roof"), amount_cents: 50000, contributed_on: addDays(today, -20), note: "Monthly" });

  await put(sql, "watchlists", { id: id("w1"), user_id: userId, name: "Groceries creeping up", kind: "category", ref_id: cat("Groceries"), ref_name: "Groceries", comparator: "gt", threshold_cents: 70000, enabled: true, note: "" });
  await put(sql, "watchlists", { id: id("w2"), user_id: userId, name: "Dining cap", kind: "category", ref_id: cat("Dining"), ref_name: "Dining", comparator: "gt", threshold_cents: 25000, enabled: true, note: "" });
  await put(sql, "watchlists", { id: id("w3"), user_id: userId, name: "Checking floor", kind: "balance", ref_id: checking, ref_name: "Everyday checking", comparator: "lt", threshold_cents: 150000, enabled: true, note: "" });
  await put(sql, "watchlists", { id: id("w4"), user_id: userId, name: "Blue Bottle habit", kind: "merchant", ref_id: "", ref_name: "Blue Bottle", comparator: "gt", threshold_cents: 4000, enabled: true, note: "" });
  await put(sql, "watchlists", { id: id("w5"), user_id: userId, name: "Emergency fund pace", kind: "goal", ref_id: id("g_ef"), ref_name: "Emergency fund", comparator: "gt", threshold_cents: 10000, enabled: true, note: "" });

  await put(sql, "reminders", { id: id("rem1"), user_id: userId, title: "Quarterly estimated tax", due_on: nextQuarterVoucher(today), href: "/taxes", related_type: "tax", related_id: "", done: false, repeat: "quarterly", notes: "See the quarterly planner before you pay." });
  await put(sql, "reminders", { id: id("rem2"), user_id: userId, title: "Record a fresh Zestimate", due_on: addDays(today, 6), href: `/networth?asset=${home}`, related_type: "asset", related_id: home, done: false, repeat: "monthly", notes: "Zillow has no public API — open the listing and save the number." });
  await put(sql, "reminders", { id: id("rem3"), user_id: userId, title: "Insurance renewal lookover", due_on: addDays(today, 21), href: `/bills?bill=${id("b_ins")}`, related_type: "bill", related_id: id("b_ins"), done: false, repeat: "none", notes: "" });

  await put(sql, "documents", { id: id("d1"), user_id: userId, title: "2025 return summary", kind: "tax", year: 2025, related_type: "tax", related_id: "", notes: "Filed MFJ. Prior-year tax used for safe harbor.", body: "Federal tax about $18,600. Refund applied none. Keep with the quarterly planner.", encrypted: false, file_name: "2025-return.txt" });
  await put(sql, "documents", { id: id("d2"), user_id: userId, title: "Home insurance dec page", kind: "insurance", year: 2026, related_type: "asset", related_id: home, notes: "Dwelling coverage $780,000. Deductible $2,500.", body: "State Farm policy. Mortgagee: First Harbor.", encrypted: false, file_name: "" });
  await put(sql, "documents", { id: id("d3"), user_id: userId, title: "October mortgage statement", kind: "statement", year: 2026, related_type: "account", related_id: mortgage, notes: "Interest portion is what Schedule A wants.", body: "Principal and interest split is already tagged on the mortgage transactions.", encrypted: false, file_name: "" });

  const bureaus = ["Experian", "Equifax", "TransUnion"];
  for (let i = 5; i >= 0; i--) {
    const asOf = addMonths(today, -i).slice(0, 8) + "15";
    for (const bureau of bureaus) {
      const base = bureau === "Experian" ? 742 : bureau === "Equifax" ? 736 : 728;
      await put(sql, "credit_scores", {
        id: id(`cs_${bureau}_${i}`),
        user_id: userId,
        bureau,
        score: base + (5 - i) * 2,
        as_of: asOf,
        factors: i === 0 ? "Utilization is moderate. On-time history is the strength. Age of accounts helps." : "",
        person_id: jordan,
      });
      const averyBase = bureau === "Experian" ? 718 : bureau === "Equifax" ? 711 : 704;
      await put(sql, "credit_scores", {
        id: id(`cs_av_${bureau}_${i}`),
        user_id: userId,
        bureau,
        score: averyBase + (5 - i) * 2,
        as_of: asOf,
        factors: i === 0 ? "Separate file from Jordan. A newer card is the main drag." : "",
        person_id: avery,
      });
    }
  }

  await put(sql, "milestones", {
    id: id("ms1"),
    user_id: userId,
    name: "Debt-free car",
    kind: "debt",
    target_cents: 860000,
    target_date: addMonths(today, 28).slice(0, 8) + "01",
    current_cents: 860000,
    monthly_cents: 31000,
    annual_return_bps: 499,
    notes: "Extra principal on the CR-V.",
  });
  await put(sql, "milestones", {
    id: id("ms2"),
    user_id: userId,
    name: "Coastal cushion",
    kind: "savings",
    target_cents: 5000000,
    target_date: null,
    current_cents: 1845000,
    monthly_cents: 80000,
    annual_return_bps: 400,
    notes: "Compare taxable vs Roth vs pre-tax on the milestone page.",
  });

  await put(sql, "reports", { id: id("rp1"), user_id: userId, name: "Spending by category", metric: "spending", range_key: "month", group_by: "category", filters_json: "{}" });
  await put(sql, "reports", { id: id("rp2"), user_id: userId, name: "Income sources", metric: "income", range_key: "ytd", group_by: "category", filters_json: "{}" });
  await put(sql, "reports", { id: id("rp3"), user_id: userId, name: "Merchants, 90 days", metric: "merchant", range_key: "quarter", group_by: "merchant", filters_json: "{}" });
  await put(sql, "reports", { id: id("rp4"), user_id: userId, name: "Spending by person", metric: "spending", range_key: "month", group_by: "person", filters_json: "{}" });
  await insertSamplePortfolio(sql, userId);
  await seedSampleMeters(sql, userId, id, checking, card, today);
}

async function seedSampleMeters(sql: Sql, userId: string, id: (s: string) => string, checking: string, card: string, today: string) {
  const history = calderUtilityHistory(today);
  const sid = checking.startsWith("s_") && checking.endsWith("_chk") ? checking.slice(2, -4) : slug(userId);
  const cat = (name: string) => `c_${sid}_${slug(name)}`;
  const ids = new Map<string, string>();
  for (const book of history) {
    const meterId = id(`m_${book.key}`);
    ids.set(book.key, meterId);
    await put(sql, "utility_meters", {
      id: meterId,
      user_id: userId,
      ledger_id: "",
      name: book.name,
      unit: book.unit,
      provider: book.provider,
      parent_id: book.parentKey ? ids.get(book.parentKey) ?? null : null,
      tiers_json: JSON.stringify(book.tiers),
    });
    let sort = 0;
    for (const column of starterColumns(meterId, book.template, book.unit)) {
      if (book.dropRollups?.includes(column.rollup)) continue;
      sort += 1;
      const rename = book.renames?.find((r) => r.key === column.key);
      const formula = book.formulaEdits?.find((r) => r.key === column.key)?.formula ?? column.formula;
      await put(sql, "utility_columns", {
        id: id(`${book.key}_${column.key}`),
        user_id: userId,
        meter_id: meterId,
        key: column.key,
        label: rename?.label ?? column.label,
        kind: column.kind,
        unit: column.unit,
        formula,
        rollup: column.rollup,
        from_children: column.key === "bill_amount" ? false : column.fromChildren,
        sort,
      });
    }
    for (const column of book.extraColumns ?? []) {
      sort += 1;
      await put(sql, "utility_columns", {
        id: id(`${book.key}_${column.key}`),
        user_id: userId,
        meter_id: meterId,
        key: column.key,
        label: column.label,
        kind: column.kind,
        unit: column.unit ?? "",
        formula: column.formula ?? "",
        rollup: column.rollup ?? "",
        from_children: false,
        sort,
      });
    }
    for (const reading of book.readings) {
      await put(sql, "utility_readings", {
        id: id(`rd_${book.key}_${reading.stamp}`),
        user_id: userId,
        meter_id: meterId,
        read_on: reading.readOn,
        meter_value: reading.meter,
        amount_cents: reading.amountCents,
        opening: reading.opening,
        cells_json: JSON.stringify(reading.cells),
      });
    }
    if (!book.bill) continue;
    const accountId = book.bill.account === "card" ? card : checking;
    await sql`
      update bills set meter_id = ${meterId}, amount_cents = ${book.bill.amountCents}, notes = ${book.bill.memo}
      where id = ${id(book.bill.id)} and user_id = ${userId}
    `;
    for (const payment of book.payments) {
      const reading = book.readings.find((r) => r.stamp === payment.stamp);
      if (!reading) continue;
      const txnId = id(`tu_${book.key}_${payment.stamp}`);
      await put(sql, "transactions", {
        id: txnId,
        user_id: userId,
        account_id: accountId,
        category_id: cat(book.bill.category),
        posted_on: payment.paidOn,
        amount_cents: -payment.amountCents,
        merchant: book.bill.merchant,
        memo: book.bill.memo,
        pending: false,
        tax_schedule: "",
        tax_line: "",
        reviewed: true,
        source: "sample",
        person_id: null,
        tags: JSON.stringify(["house"]),
        ledger_id: "",
      });
      await put(sql, "bill_payments", {
        id: id(`pay_${book.key}_${payment.stamp}`),
        user_id: userId,
        bill_id: id(book.bill.id),
        paid_on: payment.paidOn,
        amount_cents: payment.amountCents,
        account_id: accountId,
        transaction_id: txnId,
        status: "paid",
        reading_id: id(`rd_${book.key}_${reading.stamp}`),
      });
    }
  }
  await sql`update categories set monthly_cents = 40000 where user_id = ${userId} and name = 'Utilities' and monthly_cents = 19000`;
  await sql`update plan_months set assigned_cents = 40000 where user_id = ${userId} and assigned_cents = 19000 and category_id = ${cat("Utilities")}`;
}

/** Sample books created with only two PG&E reads pick up a year of linked utility history once. */
export async function ensureSampleUtilities(sql: Sql, userId: string) {
  const prof = await sql<{ seeded: boolean }>`select seeded from profiles where user_id = ${userId}`;
  if (!prof[0]?.seeded) return;
  const water = await sql<{ id: string }>`select id from utility_meters where user_id = ${userId} and name = 'EBMUD water'`;
  if (water.length) return;
  const sid = slug(userId);
  const id = (s: string) => `s_${sid}_${s}`;
  const thin = await sql<{ id: string }>`select id from utility_meters where user_id = ${userId} and name in ('PG&E electric', 'Garage charger')`;
  for (const meter of thin) {
    const reads = await sql<{ id: string }>`select id from utility_readings where user_id = ${userId} and meter_id = ${meter.id}`;
    for (const read of reads) {
      await sql`update bill_payments set reading_id = null where user_id = ${userId} and reading_id = ${read.id}`;
    }
    await sql`delete from utility_readings where user_id = ${userId} and meter_id = ${meter.id}`;
    await sql`delete from utility_columns where user_id = ${userId} and meter_id = ${meter.id}`;
    await sql`update bills set meter_id = null where user_id = ${userId} and meter_id = ${meter.id}`;
    await sql`delete from utility_meters where user_id = ${userId} and id = ${meter.id}`;
  }
  const billIds = ["b_pge", "b_water", "b_phone", "b_net"].map((key) => id(key));
  for (const billId of billIds) {
    await sql`delete from bill_payments where user_id = ${userId} and bill_id = ${billId}`;
  }
  await sql`delete from transactions where user_id = ${userId} and source = 'sample' and merchant in ('PG&E', 'EBMUD', 'Xfinity', 'T-Mobile')`;
  const accounts = await sql<{ id: string; kind: string }>`select id, kind from accounts where user_id = ${userId} and archived = false`;
  const checking = accounts.find((a) => a.kind === "checking")?.id ?? id("chk");
  const card = accounts.find((a) => a.kind === "credit")?.id ?? id("card");
  await seedSampleMeters(sql, userId, id, checking, card, todayISO());
}

function sampleTags(merchant: string): string[] {
  const m = merchant.toLowerCase();
  if (/blue bottle|pizzaiolo|comal|starbucks|doordash/.test(m)) return ["date-night"];
  if (/berkeley bowl|trader|whole foods|safeway|costco/.test(m)) return ["weekly"];
  if (/target|home depot|amazon/.test(m)) return ["kids"];
  if (/netflix|spotify|icloud/.test(m)) return ["recurring"];
  if (/food bank/.test(m)) return ["giving"];
  if (/alameda|mortgage|pg&e|ebmud|xfinity|state farm/.test(m)) return ["house"];
  if (/chevron|shell|uber/.test(m)) return ["commute"];
  if (/kaiser/.test(m)) return ["health"];
  return [];
}

/** Sample books created before tags existed pick up a few labels once. */
export async function ensureSampleTags(sql: Sql, userId: string) {
  const prof = await sql<{ seeded: boolean }>`select seeded from profiles where user_id = ${userId}`;
  if (!prof[0]?.seeded) return;
  const tagged = await sql<{ n: number }>`
    select count(*) as n from transactions
    where user_id = ${userId} and tags is not null and tags not in ('', '[]')
  `;
  if (Number(tagged[0]?.n ?? 0) > 0) return;
  const txns = await sql<{ id: string; merchant: string }>`select id, merchant from transactions where user_id = ${userId}`;
  for (const t of txns) {
    const tags = sampleTags(String(t.merchant ?? ""));
    if (!tags.length) continue;
    await sql`update transactions set tags = ${JSON.stringify(tags)} where id = ${t.id} and user_id = ${userId}`;
  }
  const reports = await sql`select id from reports where user_id = ${userId} and name = 'Kids spending'`;
  if (!reports.length) {
    const sid = slug(userId);
    await put(sql, "reports", {
      id: `s_${sid}_rp5`,
      user_id: userId,
      name: "Kids spending",
      metric: "spending",
      range_key: "quarter",
      group_by: "person",
      filters_json: JSON.stringify({ tag: "kids" }),
    });
  }
}

function samplePersonKey(merchant: string): "jordan" | "avery" | "remy" | null {
  const m = merchant.toLowerCase();
  if (/northwind|blue bottle|chevron|shell|kaiser/.test(m)) return "jordan";
  if (/netflix|spotify|icloud|target|doordash|amazon/.test(m)) return "avery";
  if (/home depot|starbucks/.test(m)) return "remy";
  return null;
}

function sampleBillKey(name: string): "jordan" | "avery" | null {
  const m = name.toLowerCase();
  if (m.includes("paycheck")) return "jordan";
  if (m.includes("netflix") || m.includes("spotify")) return "avery";
  return null;
}

/** Sample households created before people existed get Jordan, Avery, and Remy once. */
export async function ensureSamplePeople(sql: Sql, userId: string) {
  const prof = await sql<{ seeded: boolean }>`select seeded from profiles where user_id = ${userId}`;
  if (!prof[0]?.seeded) return;
  const count = await sql<{ n: number }>`select count(*) as n from people where user_id = ${userId}`;
  if (Number(count[0]?.n ?? 0) > 0) return;
  const sid = slug(userId);
  const id = (s: string) => `s_${sid}_${s}`;
  const jordan = id("p_jordan");
  const avery = id("p_avery");
  const remy = id("p_remy");
  await put(sql, "people", { id: jordan, user_id: userId, name: "Jordan Calder", relation: "adult", archived: false, sort: 0 });
  await put(sql, "people", { id: avery, user_id: userId, name: "Avery Calder", relation: "adult", archived: false, sort: 1 });
  await put(sql, "people", { id: remy, user_id: userId, name: "Remy Calder", relation: "child", archived: false, sort: 2 });
  const txns = await sql<{ id: string; merchant: string }>`select id, merchant from transactions where user_id = ${userId} and person_id is null`;
  for (const t of txns) {
    const key = samplePersonKey(String(t.merchant ?? ""));
    if (!key) continue;
    const personId = key === "jordan" ? jordan : key === "avery" ? avery : remy;
    await sql`update transactions set person_id = ${personId} where id = ${t.id} and user_id = ${userId}`;
  }
  const bills = await sql<{ id: string; name: string }>`select id, name from bills where user_id = ${userId} and person_id is null`;
  for (const b of bills) {
    const key = sampleBillKey(String(b.name ?? ""));
    if (!key) continue;
    await sql`update bills set person_id = ${key === "jordan" ? jordan : avery} where id = ${b.id} and user_id = ${userId}`;
  }
  await sql`update credit_scores set person_id = ${jordan} where user_id = ${userId} and person_id is null`;
  const haveAvery = await sql<{ n: number }>`select count(*) as n from credit_scores where user_id = ${userId} and person_id = ${avery}`;
  if (Number(haveAvery[0]?.n ?? 0) === 0) {
    const scores = await sql<{ bureau: string; score: number; as_of: string; factors: string }>`
      select bureau, score, as_of, factors from credit_scores where user_id = ${userId} and person_id = ${jordan} order by as_of
    `;
    let n = 0;
    for (const s of scores) {
      n += 1;
      await put(sql, "credit_scores", {
        id: id(`cs_av_back_${n}`),
        user_id: userId,
        bureau: String(s.bureau),
        score: Math.max(300, Number(s.score) - 18),
        as_of: String(s.as_of).slice(0, 10),
        factors: n === scores.length ? "Separate file from Jordan. A newer card is the main drag." : String(s.factors ?? ""),
        person_id: avery,
      });
    }
  }
  const reports = await sql`select id from reports where user_id = ${userId} and group_by = 'person'`;
  if (!reports.length) {
    await put(sql, "reports", {
      id: id("rp4"),
      user_id: userId,
      name: "Spending by person",
      metric: "spending",
      range_key: "month",
      group_by: "person",
      filters_json: "{}",
    });
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "x";
}

async function insertSamplePortfolio(sql: Sql, userId: string) {
  const sid = slug(userId);
  const id = (s: string) => `s_${sid}_${s}`;
  const today = todayISO();
  const broker = id("brok");
  await put(sql, "accounts", {
    id: broker,
    user_id: userId,
    name: "Brokerage",
    institution: "First Harbor",
    kind: "investment",
    mask: "7741",
    balance_cents: 1352600,
    limit_cents: null,
    apr_bps: null,
    connected: false,
    archived: false,
    opened_on: "2022-03-15",
    custom_json: "[]",
  });
  await put(sql, "lots", {
    id: id("lot_vti"),
    user_id: userId,
    account_id: broker,
    symbol: "VTI",
    name: "Total US stock",
    acquired_on: "2022-03-15",
    shares_micros: 40500000,
    cost_cents: 820000,
    closed_on: null,
    notes: "40.5 shares. Price is whatever you type on Portfolio.",
  });
  await put(sql, "lots", {
    id: id("lot_vxus"),
    user_id: userId,
    account_id: broker,
    symbol: "VXUS",
    name: "Total international",
    acquired_on: "2023-01-10",
    shares_micros: 25000000,
    cost_cents: 140000,
    closed_on: null,
    notes: "",
  });
  await put(sql, "prices", { id: id("px_vti_old"), user_id: userId, symbol: "VTI", as_of: "2024-01-02", price_cents: 25200 });
  await put(sql, "prices", { id: id("px_vti"), user_id: userId, symbol: "VTI", as_of: today, price_cents: 29200 });
  await put(sql, "prices", { id: id("px_vxus_old"), user_id: userId, symbol: "VXUS", as_of: "2024-01-02", price_cents: 5900 });
  await put(sql, "prices", { id: id("px_vxus"), user_id: userId, symbol: "VXUS", as_of: today, price_cents: 6800 });
  await put(sql, "portfolio_flows", {
    id: id("fl_vti"),
    user_id: userId,
    lot_id: id("lot_vti"),
    account_id: broker,
    symbol: "VTI",
    kind: "buy",
    posted_on: "2022-03-15",
    amount_cents: 820000,
    external: true,
    transaction_id: null,
    memo: "Opened the lot",
  });
  await put(sql, "portfolio_flows", {
    id: id("fl_vxus"),
    user_id: userId,
    lot_id: id("lot_vxus"),
    account_id: broker,
    symbol: "VXUS",
    kind: "buy",
    posted_on: "2023-01-10",
    amount_cents: 140000,
    external: true,
    transaction_id: null,
    memo: "Opened the lot",
  });
  await put(sql, "portfolio_flows", {
    id: id("fl_div"),
    user_id: userId,
    lot_id: null,
    account_id: broker,
    symbol: "VTI",
    kind: "dividend",
    posted_on: addDays(today, -40),
    amount_cents: 8400,
    external: true,
    transaction_id: null,
    memo: "Cash dividend. The books already include this as Index fund dividend.",
  });
  await put(sql, "retirement_sketches", {
    id: id("rs1"),
    user_id: userId,
    name: "Index sketch",
    monthly_cents: 40000,
    annual_return_bps: 600,
    years: 25,
    target_cents: 10000000,
    use_portfolio: true,
    start_cents: 0,
  });
}

/** Sample households created before business books existed get Calder Studio once. */
export async function ensureSampleBusiness(sql: Sql, userId: string) {
  const prof = await sql<{ seeded: boolean }>`select seeded from profiles where user_id = ${userId}`;
  if (!prof[0]?.seeded) return;
  const rows = await sql<{ n: number }>`select count(*) as n from ledgers where user_id = ${userId}`;
  if (Number(rows[0]?.n ?? 0) > 0) {
    await insertSampleBilling(sql, userId);
    await insertSampleProperty(sql, userId);
    return;
  }
  await insertSampleBusiness(sql, userId);
  await insertSampleBilling(sql, userId);
  await insertSampleProperty(sql, userId);
}

async function insertSampleBusiness(sql: Sql, userId: string) {
  const sid = slug(userId);
  const id = (s: string) => `s_${sid}_${s}`;
  const ledger = id("studio");
  const existing = await sql<{ id: string }>`select id from ledgers where id = ${ledger}`;
  if (existing.length) return;
  const today = todayISO();
  const checking = id("chk");
  const studio = id("studio_chk");
  const avery = id("p_avery");
  const catId = (name: string) => `c_${sid}_studio_${slug(name)}`;
  await put(sql, "ledgers", {
    id: ledger,
    user_id: userId,
    name: "Calder Studio",
    tax_form: "C",
    activity: "Design",
    archived: false,
    sort: 0,
  });
  let sort = 0;
  for (const [name, flow, line] of LEDGER_LINES.C) {
    sort += 1;
    await put(sql, "categories", {
      id: catId(name),
      user_id: userId,
      name,
      section: flow === "in" ? "Income" : flow === "transfer" ? "Equity" : "Expenses",
      flow,
      tax_schedule: flow === "transfer" ? "" : "C",
      tax_line: line,
      icon: "tag",
      monthly_cents: 0,
      rollover: false,
      sort,
      archived: false,
      ledger_id: ledger,
    });
  }
  await put(sql, "accounts", {
    id: studio,
    user_id: userId,
    name: "Studio checking",
    institution: "First Harbor",
    kind: "checking",
    mask: "5510",
    balance_cents: 240800,
    limit_cents: null,
    apr_bps: null,
    connected: false,
    archived: false,
    opened_on: "2024-02-01",
    custom_json: "[]",
    ledger_id: ledger,
  });
  const rows: { key: string; cat: string; amt: number; merchant: string; day: number; person: string | null }[] = [
    { key: "biz1", cat: "Gross receipts", amt: 420000, merchant: "Northline website", day: -20, person: avery },
    { key: "biz2", cat: "Supplies", amt: -18600, merchant: "Blick Art Materials", day: -12, person: avery },
    { key: "biz3", cat: "Office", amt: -6400, merchant: "Adobe", day: -8, person: null },
    { key: "biz4", cat: "Meals", amt: -4200, merchant: "Client lunch", day: -6, person: avery },
  ];
  for (const row of rows) {
    const line = LEDGER_LINES.C.find((item) => item[0] === row.cat)?.[2] ?? "";
    await put(sql, "transactions", {
      id: id(row.key),
      user_id: userId,
      account_id: studio,
      category_id: catId(row.cat),
      posted_on: addDays(today, row.day),
      amount_cents: row.amt,
      merchant: row.merchant,
      memo: "",
      pending: false,
      tax_schedule: "C",
      tax_line: line,
      reviewed: true,
      source: "sample",
      person_id: row.person,
      tags: "[]",
      ledger_id: ledger,
    });
  }
  const posted = addDays(today, -4);
  const bizTxn = id("biz_draw");
  const homeTxn = id("home_draw");
  await put(sql, "transactions", {
    id: bizTxn,
    user_id: userId,
    account_id: studio,
    category_id: catId("Owner draw"),
    posted_on: posted,
    amount_cents: -150000,
    merchant: "Owner draw",
    memo: "Calder Studio",
    pending: false,
    tax_schedule: "",
    tax_line: "draw",
    reviewed: true,
    source: "draw",
    person_id: avery,
    tags: "[]",
    ledger_id: ledger,
  });
  await put(sql, "transactions", {
    id: homeTxn,
    user_id: userId,
    account_id: checking,
    category_id: `c_${sid}_transfer`,
    posted_on: posted,
    amount_cents: 150000,
    merchant: "Owner draw",
    memo: "Calder Studio",
    pending: false,
    tax_schedule: "",
    tax_line: "",
    reviewed: true,
    source: "draw",
    person_id: avery,
    tags: "[]",
    ledger_id: "",
  });
  await put(sql, "draws", {
    id: id("draw1"),
    user_id: userId,
    ledger_id: ledger,
    posted_on: posted,
    direction: "draw",
    amount_cents: 150000,
    biz_account_id: studio,
    home_account_id: checking,
    biz_txn_id: bizTxn,
    home_txn_id: homeTxn,
  });
  await sql`update accounts set balance_cents = balance_cents + 150000 where id = ${checking} and user_id = ${userId}`;
}

async function insertSampleBilling(sql: Sql, userId: string) {
  const sid = slug(userId);
  const id = (s: string) => `s_${sid}_${s}`;
  const ledger = id("studio");
  const existing = await sql<{ id: string }>`select id from ledgers where id = ${ledger} and user_id = ${userId}`;
  if (!existing.length) return;
  const ready = await sql<{ id: string }>`select id from mileage where id = ${id("mile3")} and user_id = ${userId}`;
  if (ready.length) return;
  const today = todayISO();
  const studio = id("studio_chk");
  const avery = id("p_avery");
  const catId = (name: string) => `c_${sid}_studio_${slug(name)}`;
  const extra: { key: string; cat: string; amt: number; merchant: string; day: number }[] = [
    { key: "biz5", cat: "Advertising", amt: -24000, merchant: "Portland Monthly", day: -40 },
    { key: "biz6", cat: "Contract labor", amt: -75000, merchant: "June Ito, copy", day: -28 },
    { key: "biz7", cat: "Insurance", amt: -8900, merchant: "Hiscox", day: -22 },
    { key: "biz8", cat: "Travel", amt: -31200, merchant: "Amtrak to Boston", day: -16 },
    { key: "biz9", cat: "Utilities", amt: -5400, merchant: "Studio power", day: -3 },
  ];
  for (const row of extra) {
    const line = LEDGER_LINES.C.find((item) => item[0] === row.cat)?.[2] ?? "";
    await put(sql, "transactions", {
      id: id(row.key),
      user_id: userId,
      account_id: studio,
      category_id: catId(row.cat),
      posted_on: addDays(today, row.day),
      amount_cents: row.amt,
      merchant: row.merchant,
      memo: "",
      pending: false,
      tax_schedule: "C",
      tax_line: line,
      reviewed: true,
      source: "sample",
      person_id: avery,
      tags: "[]",
      ledger_id: ledger,
    });
  }
  await put(sql, "invoices", {
    id: id("inv1"),
    user_id: userId,
    ledger_id: ledger,
    number: "INV-1001",
    client: "Harbor & Co",
    client_email: "accounts@harborandco.example",
    client_address: "88 Exchange Street",
    client_city: "Portland",
    client_region: "ME",
    client_postal: "04101",
    issued_on: addDays(today, -3),
    due_on: addDays(today, 14),
    status: "open",
    notes: "Logo revision",
    lines_json: JSON.stringify([{ description: "Logo revision", amountCents: 85000 }]),
    account_id: null,
    transaction_id: null,
    paid_on: null,
  });
  await sql`
    update invoices set
      client_email = 'accounts@harborandco.example',
      client_address = '88 Exchange Street',
      client_city = 'Portland',
      client_region = 'ME',
      client_postal = '04101'
    where id = ${id("inv1")} and user_id = ${userId}
  `;
  const paidTxn = id("inv2_txn");
  const paidAlready = await sql`select id from transactions where id = ${paidTxn}`;
  if (!paidAlready.length) {
    await put(sql, "transactions", {
      id: paidTxn,
      user_id: userId,
      account_id: studio,
      category_id: catId("Gross receipts"),
      posted_on: addDays(today, -9),
      amount_cents: 120000,
      merchant: "Northline",
      memo: "INV-1002",
      pending: false,
      tax_schedule: "C",
      tax_line: "gross",
      reviewed: true,
      source: "invoice",
      person_id: avery,
      tags: "[]",
      ledger_id: ledger,
    });
    await sql`update accounts set balance_cents = balance_cents + 120000 where id = ${studio} and user_id = ${userId}`;
  }
  await put(sql, "invoices", {
    id: id("inv2"),
    user_id: userId,
    ledger_id: ledger,
    number: "INV-1002",
    client: "Northline",
    client_email: "ap@northline.example",
    client_address: "400 Fore Street",
    client_city: "Portland",
    client_region: "ME",
    client_postal: "04101",
    issued_on: addDays(today, -20),
    due_on: addDays(today, -6),
    status: "paid",
    notes: "Monthly care",
    lines_json: JSON.stringify([{ description: "Site care, October", amountCents: 120000 }]),
    account_id: studio,
    transaction_id: paidTxn,
    paid_on: addDays(today, -9),
  });
  await put(sql, "invoices", {
    id: id("inv3"),
    user_id: userId,
    ledger_id: ledger,
    number: "INV-1003",
    client: "Lumen Press",
    client_email: "ellen@lumenpress.example",
    client_address: "12 Milk Street",
    client_city: "Boston",
    client_region: "MA",
    client_postal: "02109",
    issued_on: addDays(today, -18),
    due_on: addDays(today, -4),
    status: "open",
    notes: "Brand guide",
    lines_json: JSON.stringify([
      { description: "Brand guide", amountCents: 48000 },
      { description: "Print specs", amountCents: 16000 },
    ]),
    account_id: null,
    transaction_id: null,
    paid_on: null,
  });
  await sql`
    update mileage set destination = 'Northline office', use_type = 'business', parking_cents = 0, tolls_cents = 0
    where id = ${id("mile1")} and user_id = ${userId}
  `;
  await put(sql, "mileage", {
    id: id("mile1"),
    user_id: userId,
    ledger_id: ledger,
    trip_on: addDays(today, -2),
    purpose: "Client site, Northline",
    destination: "Northline office",
    use_type: "business",
    miles_hundredths: 1860,
    parking_cents: 0,
    tolls_cents: 0,
  });
  await put(sql, "mileage", {
    id: id("mile2"),
    user_id: userId,
    ledger_id: ledger,
    trip_on: addDays(today, -1),
    purpose: "Home to the studio",
    destination: "Calder Studio",
    use_type: "commute",
    miles_hundredths: 840,
    parking_cents: 0,
    tolls_cents: 0,
  });
  await put(sql, "mileage", {
    id: id("mile3"),
    user_id: userId,
    ledger_id: ledger,
    trip_on: addDays(today, -5),
    purpose: "Deliver brand guide",
    destination: "Lumen Press, Boston",
    use_type: "business",
    miles_hundredths: 1420,
    parking_cents: 800,
    tolls_cents: 350,
  });
}

async function insertSampleProperty(sql: Sql, userId: string) {
  const sid = slug(userId);
  const id = (s: string) => `s_${sid}_${s}`;
  const ledger = id("maple");
  const existing = await sql<{ id: string }>`select id from ledgers where id = ${ledger} and user_id = ${userId}`;
  if (existing.length) {
    await ensureMapleLease(sql, userId);
    return;
  }
  const today = todayISO();
  const checking = id("maple_chk");
  const loan = id("maple_loan");
  const catId = (name: string) => `c_${sid}_maple_${slug(name)}`;
  await put(sql, "ledgers", {
    id: ledger,
    user_id: userId,
    name: "Maple Street",
    tax_form: "E",
    activity: "418 Maple Street, Portland",
    archived: false,
    sort: 1,
    kind: "property",
  });
  let sort = 0;
  for (const [name, flow, line] of LEDGER_LINES.E) {
    sort += 1;
    await put(sql, "categories", {
      id: catId(name),
      user_id: userId,
      name,
      section: flow === "in" ? "Income" : flow === "transfer" ? "Equity" : "Expenses",
      flow,
      tax_schedule: flow === "transfer" ? "" : "E",
      tax_line: line,
      icon: "tag",
      monthly_cents: 0,
      rollover: false,
      sort,
      archived: false,
      ledger_id: ledger,
    });
  }
  await put(sql, "accounts", {
    id: checking,
    user_id: userId,
    name: "Rent checking",
    institution: "First Harbor",
    kind: "checking",
    mask: "2284",
    balance_cents: 642000,
    limit_cents: null,
    apr_bps: null,
    connected: false,
    archived: false,
    opened_on: "2022-06-01",
    custom_json: "[]",
    ledger_id: ledger,
  });
  await put(sql, "accounts", {
    id: loan,
    user_id: userId,
    name: "Maple mortgage",
    institution: "First Harbor",
    kind: "mortgage",
    mask: "7741",
    balance_cents: 18600000,
    limit_cents: null,
    apr_bps: 625,
    connected: false,
    archived: false,
    opened_on: "2022-06-01",
    custom_json: "[]",
    ledger_id: ledger,
  });
  const rows: { key: string; cat: string; amt: number; merchant: string; day: number }[] = [
    { key: "rent1", cat: "Rents received", amt: 180000, merchant: "Jordan Hale", day: -12 },
    { key: "rent2", cat: "Insurance", amt: -9600, merchant: "Landlord policy", day: -20 },
    { key: "rent3", cat: "Repairs", amt: -22000, merchant: "Maple plumbing", day: -8 },
    { key: "rent4", cat: "Mortgage interest", amt: -41000, merchant: "First Harbor", day: -2 },
    { key: "rent5", cat: "Taxes", amt: -15500, merchant: "Portland property tax", day: -35 },
  ];
  for (const row of rows) {
    const line = LEDGER_LINES.E.find((item) => item[0] === row.cat)?.[2] ?? "";
    await put(sql, "transactions", {
      id: id(row.key),
      user_id: userId,
      account_id: checking,
      category_id: catId(row.cat),
      posted_on: addDays(today, row.day),
      amount_cents: row.amt,
      merchant: row.merchant,
      memo: "",
      pending: false,
      tax_schedule: "E",
      tax_line: line,
      reviewed: true,
      source: "sample",
      person_id: null,
      tags: "[]",
      ledger_id: ledger,
    });
  }
  await put(sql, "invoices", {
    id: id("rent_inv"),
    user_id: userId,
    ledger_id: ledger,
    number: "INV-1001",
    client: "Jordan Hale",
    client_email: "jordan.hale@example",
    client_address: "418 Maple Street",
    client_city: "Portland",
    client_region: "ME",
    client_postal: "04102",
    issued_on: today,
    due_on: addDays(today, 5),
    status: "open",
    notes: "November rent",
    lines_json: JSON.stringify([{ description: "November rent", amountCents: 180000 }]),
    account_id: null,
    transaction_id: null,
    paid_on: null,
  });
  await put(sql, "mileage", {
    id: id("maple_mile"),
    user_id: userId,
    ledger_id: ledger,
    trip_on: addDays(today, -8),
    purpose: "Leak in the upstairs bath",
    destination: "418 Maple Street",
    use_type: "business",
    miles_hundredths: 420,
    parking_cents: 0,
    tolls_cents: 0,
  });
  await ensureMapleLease(sql, userId);
}

async function ensureMapleLease(sql: Sql, userId: string) {
  const sid = slug(userId);
  const ledger = `s_${sid}_maple`;
  const found = await sql<{ id: string }>`select id from ledgers where id = ${ledger} and user_id = ${userId}`;
  if (!found.length) return;
  const today = todayISO();
  const leaseId = `s_${sid}_lease`;
  const have = await sql<{ id: string }>`select id from leases where id = ${leaseId}`;
  if (!have.length) {
    await put(sql, "leases", {
      id: leaseId,
      user_id: userId,
      ledger_id: ledger,
      tenant: "Jordan Hale",
      email: "jordan.hale@example",
      address: "418 Maple Street",
      city: "Portland",
      region: "ME",
      postal: "04102",
      unit: "",
      rent_cents: 180000,
      due_day: 1,
      start_on: "2024-06-01",
      end_on: null,
      deposit_cents: 180000,
      deposit_held_cents: 180000,
      status: "active",
      last_invoiced: today.slice(0, 7),
      notes: "Deposit is already in rent checking. October rent was recorded as income.",
    });
  }
  const rentInv = `s_${sid}_rent_inv`;
  const linked = await sql<{ lease_id: string | null }>`select lease_id from invoices where id = ${rentInv} and user_id = ${userId}`;
  if (linked[0] && !linked[0].lease_id) {
    await sql`update invoices set lease_id = ${leaseId} where id = ${rentInv} and user_id = ${userId}`;
  }
}

export async function ensureLeaseInvoices(sql: Sql, userId: string) {
  const today = todayISO();
  const leases = await sql<Record<string, unknown>>`
    select * from leases where user_id = ${userId} and status = 'active'
  `;
  for (const row of leases) {
    const start = String(row.start_on).slice(0, 10);
    const end = row.end_on ? String(row.end_on).slice(0, 10) : "";
    let cursor = String(row.last_invoiced || "");
    if (!cursor) {
      const [y, m] = start.split("-").map(Number);
      const prev = new Date(Date.UTC(y!, (m || 1) - 1, 1));
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      cursor = prev.toISOString().slice(0, 7);
    }
    const stop = today.slice(0, 7);
    let guard = 0;
    while (guard < 6) {
      guard += 1;
      const [y, m] = cursor.split("-").map(Number);
      const next = new Date(Date.UTC(y!, m || 1, 1));
      const month = next.toISOString().slice(0, 7);
      if (month > stop) break;
      cursor = month;
      if (month < start.slice(0, 7)) continue;
      if (end && month > end.slice(0, 7)) break;
      const dueDay = Math.min(28, Math.max(1, Number(row.due_day) || 1));
      const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      const due = `${month}-${String(Math.min(dueDay, dim)).padStart(2, "0")}`;
      const issued = due < start ? start : `${month}-01` < start ? start : `${month}-01`;
      const count = await sql<{ n: number }>`select count(*) as n from invoices where user_id = ${userId} and ledger_id = ${String(row.ledger_id)}`;
      const number = `INV-${1001 + Number(count[0]?.n ?? 0)}`;
      const invoiceId = `inv_${String(row.id)}_${month}`;
      const label = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      await put(sql, "invoices", {
        id: invoiceId,
        user_id: userId,
        ledger_id: String(row.ledger_id),
        lease_id: String(row.id),
        number,
        client: String(row.tenant),
        client_email: String(row.email ?? ""),
        client_address: String(row.address ?? ""),
        client_city: String(row.city ?? ""),
        client_region: String(row.region ?? ""),
        client_postal: String(row.postal ?? ""),
        issued_on: issued,
        due_on: due,
        status: "open",
        notes: `Rent for ${label}`,
        lines_json: JSON.stringify([{ description: `Rent for ${label}`, amountCents: Number(row.rent_cents) }]),
        account_id: null,
        transaction_id: null,
        paid_on: null,
      });
    }
    if (cursor !== String(row.last_invoiced || "")) {
      await sql`update leases set last_invoiced = ${cursor} where id = ${String(row.id)} and user_id = ${userId}`;
    }
  }
}

export async function ensureSampleSale(sql: Sql, userId: string) {
  const prof = await sql<{ seeded: boolean }>`select seeded from profiles where user_id = ${userId}`;
  if (!prof[0]?.seeded) return;
  const sid = slug(userId);
  const saleId = `s_${sid}_sale_vti`;
  const existing = await sql`select id from realizations where id = ${saleId}`;
  if (existing.length) return;
  const lotId = `s_${sid}_lot_vti`;
  const lots = await sql<{ shares_micros: number; cost_cents: number; account_id: string | null }>`
    select shares_micros, cost_cents, account_id from lots where id = ${lotId} and user_id = ${userId}
  `;
  const lot = lots[0];
  if (!lot || Number(lot.shares_micros) !== 40500000 || Number(lot.cost_cents) !== 820000) return;
  const sold = 5000000;
  const basis = Math.round((820000 * sold) / 40500000);
  const proceeds = 140000;
  const gain = proceeds - basis;
  await sql`update lots set shares_micros = ${40500000 - sold}, cost_cents = ${820000 - basis} where id = ${lotId} and user_id = ${userId}`;
  await put(sql, "realizations", {
    id: saleId,
    user_id: userId,
    lot_id: lotId,
    account_id: lot.account_id,
    symbol: "VTI",
    acquired_on: "2022-03-15",
    sold_on: "2026-02-12",
    shares_micros: sold,
    basis_cents: basis,
    proceeds_cents: proceeds,
    gain_cents: gain,
    term: "long",
  });
  await put(sql, "portfolio_flows", {
    id: `s_${sid}_fl_sale`,
    user_id: userId,
    lot_id: lotId,
    account_id: lot.account_id,
    symbol: "VTI",
    kind: "sell",
    posted_on: "2026-02-12",
    amount_cents: proceeds,
    external: true,
    transaction_id: null,
    memo: "Sale of VTI",
  });
  if (lot.account_id) await sql`update accounts set balance_cents = balance_cents + ${proceeds} where id = ${lot.account_id} and user_id = ${userId}`;
}

export async function ensureSampleInvestments(sql: Sql, userId: string) {
  const prof = await sql<{ seeded: boolean }>`select seeded from profiles where user_id = ${userId}`;
  if (!prof[0]?.seeded) return;
  const rows = await sql<{ n: number }>`select count(*) as n from lots where user_id = ${userId}`;
  if (Number(rows[0]?.n ?? 0) > 0) return;
  await insertSamplePortfolio(sql, userId);
}

function nextDom(today: string, day: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const dim = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const dom = Math.min(day, dim);
  if ((d || 1) < dom) return `${today.slice(0, 8)}${String(dom).padStart(2, "0")}`;
  const next = addMonths(`${today.slice(0, 8)}01`, 1);
  const [ny, nm] = next.split("-").map(Number);
  const dim2 = new Date(Date.UTC(ny!, nm!, 0)).getUTCDate();
  return `${next.slice(0, 8)}${String(Math.min(day, dim2)).padStart(2, "0")}`;
}

function nextQuarterVoucher(today: string): string {
  const year = Number(today.slice(0, 4));
  const stamps = [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`];
  return stamps.find((s) => s >= today) ?? stamps[3]!;
}
