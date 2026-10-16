import type { Sql } from "@/lib/db";
import { addDays, addMonths, periodOf, todayISO } from "./calc";

type Row = Record<string, string | number | boolean | null>;

async function put(sql: Sql, table: string, row: Row) {
  const keys = Object.keys(row);
  const cols = keys.join(", ");
  const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
  await sql.query(`insert into ${table} (${cols}) values (${ph}) on conflict do nothing`, keys.map((k) => row[k]));
}

export async function clearHousehold(sql: Sql, userId: string) {
  const tables = [
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
    "people",
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
  ["Utilities", "Home", "out", "", "", 19000],
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
  txns.push({ day: -12, acct: checking, cat: "Utilities", amt: -18640, merchant: "PG&E", memo: "Electric & gas" });
  txns.push({ day: -40, acct: checking, cat: "Utilities", amt: -17220, merchant: "PG&E" });
  txns.push({ day: -9, acct: checking, cat: "Internet", amt: -8000, merchant: "Xfinity" });
  txns.push({ day: -39, acct: checking, cat: "Internet", amt: -8000, merchant: "Xfinity" });
  txns.push({ day: -6, acct: card, cat: "Phone", amt: -9500, merchant: "T-Mobile" });
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
  txns.push({ day: -55, acct: checking, cat: "Utilities", amt: -4200, merchant: "EBMUD", memo: "Water" });

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
    ["Utilities", 19000],
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

/** Sample households created before the portfolio existed get one brokerage once. */
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
