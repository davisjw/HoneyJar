import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateAlerts,
  estimateTax,
  netWorthParts,
  personFlow,
  planModel,
  portfolioPerformance,
  projectCash,
  spendingByCategory,
  taxLines,
} from "./calc.ts";
import type { Account, Asset, Bill, Category, PlanMonth, Profile, Txn } from "./types.ts";
import { buildSheet, calderUtilityHistory, cellMount, hasMeter, starterColumns, type ReadLike, type UtilColumn } from "./utility.ts";

/**
 * Budgets for the math each screen runs after the household is already loaded.
 * They are loose on purpose: a slow CI machine should pass, and a real regression
 * (another nested scan, a sheet rebuilt per payment) should not.
 *
 * What these tests cannot see, and what actually makes every page wait:
 * loading the household reads every table, then runs the sample-data backfill,
 * including an update on each jar table looking for a blank ledger id. Saving
 * one cell throws that whole load away and does it again.
 */

const TODAY = "2026-10-16";

function category(id: string, flow: "in" | "out", monthly = 0): Category {
  return {
    id,
    name: id,
    section: "General",
    flow,
    taxSchedule: "",
    taxLine: "",
    icon: "",
    monthlyCents: monthly,
    rollover: flow === "out",
    sort: 0,
    archived: false,
  };
}

function account(id: string, kind: string, balanceCents: number): Account {
  return {
    id,
    name: id,
    institution: "",
    kind,
    mask: "",
    balanceCents,
    limitCents: null,
    aprBps: null,
    connected: false,
    archived: false,
    openedOn: null,
    customJson: "[]",
  };
}

function bill(id: string, amountCents: number, cadence = "monthly"): Bill {
  return {
    id,
    name: id,
    payee: id,
    kind: "bill",
    direction: "out",
    categoryId: "rent",
    accountId: "checking",
    debtAccountId: null,
    amountCents,
    principalCents: null,
    cadence,
    nextDue: "2026-10-18",
    autopay: false,
    status: "active",
    variable: false,
    notes: "",
    url: "",
    personId: null,
    meterId: null,
    flatPay: false,
  };
}

function txn(i: number, postedOn: string, amountCents: number, categoryId: string): Txn {
  return {
    id: `t${i}`,
    accountId: "checking",
    categoryId,
    postedOn,
    amountCents,
    merchant: "Store",
    memo: "",
    pending: false,
    taxSchedule: "",
    taxLine: "",
    reviewed: true,
    source: "sample",
    personId: null,
    tags: [],
  };
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  cursor.setUTCDate(cursor.getUTCDate() + n);
  return cursor.toISOString().slice(0, 10);
}

/** A household past the sample book: three years, two transactions a day. */
function grownBook() {
  const categories = [
    category("pay", "in"),
    ...Array.from({ length: 24 }, (_, i) => category(`c${i}`, "out", 20_000)),
  ];
  const txns: Txn[] = [];
  for (let day = 0; day < 365 * 3; day += 1) {
    const postedOn = addDays("2023-10-16", day);
    txns.push(txn(txns.length, postedOn, 400_000, "pay"));
    txns.push(txn(txns.length, postedOn, -4_200 - (day % 7) * 100, `c${day % 24}`));
  }
  const plan: PlanMonth[] = categories
    .filter((c) => c.flow === "out")
    .map((c) => ({ id: `plan-${c.id}`, categoryId: c.id, month: "2026-10", assignedCents: c.monthlyCents }));
  const accounts = [account("checking", "checking", 428_000), account("card", "credit", -124_000)];
  const bills = Array.from({ length: 18 }, (_, i) => bill(`b${i}`, 8_000 + i * 500, i % 5 === 0 ? "yearly" : "monthly"));
  const assets: Asset[] = [
    {
      id: "home",
      name: "Home",
      kind: "home",
      valueCents: 86_500_000,
      asOf: TODAY,
      loanAccountId: null,
      address: "",
      zillowUrl: "",
      zestimateCents: null,
      detail: "",
      customJson: "[]",
    },
  ];
  return { categories, txns, plan, accounts, bills, assets };
}

function profile(): Profile {
  return {
    userId: "u",
    displayName: "Calder",
    currency: "USD",
    filingStatus: "mfj",
    stateCode: "CA",
    dependents: 1,
    wagesCents: 16_800_000,
    otherIncomeCents: 84_000,
    withholdingCents: 2_280_000,
    estimatedPaidCents: 0,
    priorYearTaxCents: 1_860_000,
    deductionMode: "auto",
    saltCapCents: 1_000_000,
    stateRateBps: 450,
    navHidden: "",
    aiProvider: "grok",
    openaiKeySet: false,
    openaiModel: "",
    ollamaUrl: "",
    ollamaModel: "",
    vaultSalt: "",
    vaultVerifier: "",
    seeded: true,
    initialized: true,
    monthStartDay: 1,
  };
}

function time(work: () => void): number {
  const start = performance.now();
  work();
  return performance.now() - start;
}

function utilityBooks() {
  const history = calderUtilityHistory(TODAY);
  const columns: UtilColumn[] = [];
  const readings: ReadLike[] = [];
  for (const book of history) {
    const starter = starterColumns(book.key, book.template, book.unit).filter(
      (column) => !book.dropRollups?.includes(column.rollup),
    );
    for (const edit of book.formulaEdits ?? []) {
      const column = starter.find((item) => item.key === edit.key);
      if (column) column.formula = edit.formula;
    }
    for (const extra of book.extraColumns ?? []) {
      starter.push({
        id: `${book.key}-${extra.key}`,
        utilityId: book.key,
        key: extra.key,
        label: extra.label,
        kind: extra.kind,
        unit: extra.unit ?? "",
        formula: extra.formula ?? "",
        rollup: extra.rollup ?? "",
        fromChildren: false,
      });
    }
    columns.push(...starter);
    for (const reading of book.readings) {
      readings.push({
        id: `${book.key}-${reading.stamp}`,
        utilityId: book.key,
        date: reading.readOn,
        meter: reading.meter,
        amountCents: reading.amountCents,
        opening: reading.opening,
        cells: reading.cells,
      });
    }
  }
  return { history, columns, readings };
}

/** Inputs the workbook mounts for one meter. Date fields and typed cells, not gray formulas. */
function workbookControls(columns: UtilColumn[], rowCount: number): number {
  const metered = columns.some((column) => column.rollup === "meter" || column.rollup === "readDate");
  const editable = columns.filter((column) => {
    if (column.kind === "calculated") return false;
    if (metered && column.rollup === "days") return false;
    return true;
  }).length;
  return editable * rowCount;
}

describe("page work stays cheap as the book grows", () => {
  const book = grownBook();

  it("spending, plan, and cash flow stay under budget on three years of transactions", () => {
    const ms = time(() => {
      spendingByCategory(book.txns, book.categories, "2026-10-01", TODAY);
      spendingByCategory(book.txns, book.categories, "2026-10-01", TODAY, "in");
      personFlow(book.txns, [], "2026-10-01", TODAY);
      const plan = planModel(book.categories, book.txns, book.plan, "2026-10", 1);
      projectCash({ today: TODAY, days: 120, accounts: book.accounts, bills: book.bills, categories: book.categories, startDay: 1 });
      projectCash({ today: TODAY, days: 365, accounts: book.accounts, bills: book.bills, categories: book.categories, startDay: 1 });
      evaluateAlerts({
        today: TODAY,
        startDay: 1,
        accounts: book.accounts,
        categories: book.categories,
        txns: book.txns,
        bills: book.bills,
        goals: [],
        watches: [],
        reminders: [],
        scores: [],
        planRows: plan.rows,
      });
    });
    assert.ok(ms < 250, `spending pages took ${ms.toFixed(1)}ms`);
  });

  it("taxes, net worth, and portfolio stay under budget", () => {
    const ms = time(() => {
      const lines = taxLines(book.txns, book.categories, 2026);
      estimateTax(profile(), book.txns, book.categories, TODAY, 0);
      netWorthParts(book.accounts, book.assets);
      portfolioPerformance({ lots: [], prices: [], flows: [], today: TODAY });
      assert.ok(lines);
    });
    assert.ok(ms < 80, `wealth and tax pages took ${ms.toFixed(1)}ms`);
  });

  it("a year of utility sheets, built once per meter, stays under budget", () => {
    const { history, columns, readings } = utilityBooks();
    const ms = time(() => {
      for (const book of history) {
        const own = columns.filter((column) => column.utilityId === book.key);
        const childIds = new Set(history.filter((item) => item.parentKey === book.key).map((item) => item.key));
        buildSheet(
          book.key,
          own,
          readings,
          readings.filter((reading) => childIds.has(reading.utilityId)),
          book.tiers,
          columns.filter((column) => childIds.has(column.utilityId)),
        );
      }
    });
    assert.ok(ms < 80, `utility sheets took ${ms.toFixed(1)}ms`);
  });

  it("the sample workbook does not grow into an unbounded grid", () => {
    const { history, columns, readings } = utilityBooks();
    let controls = 0;
    for (const book of history) {
      const own = columns.filter((column) => column.utilityId === book.key);
      const rows = readings.filter((reading) => reading.utilityId === book.key).length;
      controls += workbookControls(own, rows);
    }
    assert.ok(controls < 900, `sample workbook would mount ${controls} inputs`);
    const pge = history.find((book) => book.key === "pge")!;
    const pgeControls = workbookControls(
      columns.filter((column) => column.utilityId === "pge"),
      readings.filter((reading) => reading.utilityId === "pge").length,
    );
    assert.ok(pgeControls > 200, "PG&E should still be the wide sheet this budget is watching");
  });

  it("rebuilding one meter's sheet once per paid row stays under budget", () => {
    const { history, columns, readings } = utilityBooks();
    const pge = history.find((book) => book.key === "pge")!;
    const paid = pge.payments.length;
    const ms = time(() => {
      for (let i = 0; i < paid; i += 1) {
        buildSheet("pge", columns.filter((column) => column.utilityId === "pge"), readings, [], pge.tiers, []);
      }
    });
    assert.ok(paid > 12, "expected a year of linked PG&E payments");
    assert.ok(ms < 400, `PG&E sheet rebuilt ${paid} times in ${ms.toFixed(1)}ms`);
  });

  it("the utility grid mounts one editor, and only while a cell is open", () => {
    const { columns, readings } = utilityBooks();
    const own = columns.filter((column) => column.utilityId === "pge");
    const rows = readings.filter((reading) => reading.utilityId === "pge");
    const metered = hasMeter(own, "kWh");
    let resting = 0;
    for (const row of rows) {
      for (const column of own) {
        const mode = cellMount(column, {
          metered,
          openingUsage: Boolean(row.opening && column.rollup === "usage"),
          editing: false,
        });
        if (mode !== "static") resting += 1;
      }
    }
    assert.equal(resting, 0);
    const usage = own.find((column) => column.rollup === "usage");
    assert.ok(usage);
    assert.equal(cellMount(usage, { metered, openingUsage: false, editing: true }), "input");
    const days = own.find((column) => column.rollup === "days");
    assert.ok(days);
    assert.equal(cellMount(days, { metered, openingUsage: false, editing: true }), "static");
    const bill = own.find((column) => column.rollup === "bill");
    assert.ok(bill);
    assert.equal(cellMount(bill, { metered, openingUsage: false, editing: true }), "input");
    const dated = own.find((column) => column.rollup === "readDate");
    assert.ok(dated);
    assert.equal(cellMount(dated, { metered, openingUsage: false, editing: true }), "date");
  });
});
