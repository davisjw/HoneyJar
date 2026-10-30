import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  booksProfit,
  estimateTax,
  federalTaxCents,
  flowToPortfolio,
  hasTag,
  holdingTerm,
  ledgerProfit,
  lotMarketCents,
  matchTxnFilters,
  mileageBasisCents,
  mileageDeductionCents,
  modifiedDietz,
  netWorthParts,
  omittedVehicleLines,
  parseTags,
  periodOf,
  personFlow,
  planModel,
  billMonthRows,
  billTxnMatches,
  duesInRange,
  projectedBillCents,
  scheduleD,
  importMatches,
  merchantClose,
  otherTransferAccount,
  parseOfx,
  parseStatement,
  transferMatches,
  transferOtherMask,
} from "./calc.ts";
import type { Account, Asset, Bill, Category, Payment, Profile, Txn } from "./types.ts";

function category(patch: Partial<Category> & Pick<Category, "id" | "flow">): Category {
  return {
    name: patch.id,
    section: "General",
    taxSchedule: "",
    taxLine: "",
    icon: "",
    monthlyCents: 0,
    rollover: false,
    sort: 0,
    archived: false,
    ...patch,
  };
}

function txn(patch: Partial<Txn> & Pick<Txn, "amountCents" | "postedOn">): Txn {
  return {
    id: "t",
    accountId: "a",
    categoryId: null,
    merchant: "",
    memo: "",
    pending: false,
    taxSchedule: "",
    taxLine: "",
    reviewed: true,
    source: "manual",
    personId: null,
    tags: [],
    ...patch,
  };
}

function account(patch: Partial<Account> & Pick<Account, "kind" | "balanceCents">): Account {
  return {
    id: "a",
    name: patch.kind,
    institution: "",
    mask: "",
    limitCents: null,
    aprBps: null,
    connected: false,
    archived: false,
    openedOn: null,
    customJson: "{}",
    ...patch,
  };
}

function asset(valueCents: number): Asset {
  return {
    id: "house",
    name: "House",
    kind: "home",
    valueCents,
    asOf: "2026-10-01",
    loanAccountId: null,
    address: "",
    zillowUrl: "",
    zestimateCents: null,
    detail: "",
    customJson: "{}",
  };
}

function profile(patch: Partial<Profile> = {}): Profile {
  return {
    userId: "u",
    displayName: "Ada",
    currency: "USD",
    filingStatus: "single",
    stateCode: "TX",
    dependents: 0,
    wagesCents: 0,
    otherIncomeCents: 0,
    withholdingCents: 0,
    estimatedPaidCents: 0,
    priorYearTaxCents: 0,
    deductionMode: "standard",
    saltCapCents: 4_000_000,
    stateRateBps: 0,
    navHidden: "",
    aiProvider: "grok",
    openaiKeySet: false,
    openaiModel: "",
    ollamaUrl: "",
    ollamaModel: "",
    vaultSalt: "",
    vaultVerifier: "",
    seeded: false,
    initialized: true,
    monthStartDay: 1,
    ...patch,
  };
}

const income = category({ id: "in", flow: "in", taxLine: "gross" });
const supplies = category({ id: "out", flow: "out", taxLine: "supplies" });
const gas = category({ id: "gas", flow: "out", taxLine: "gas" });
const transfer = category({ id: "move", flow: "transfer", taxLine: "transfer" });

describe("periods and tags", () => {
  it("keeps a date in the prior period when the month starts later", () => {
    assert.equal(periodOf("2026-10-16", 1), "2026-10");
    assert.equal(periodOf("2026-10-16", 20), "2026-09");
  });

  it("matches a person or a tag without mixing the household", () => {
    assert.deepEqual(parseTags(" Trip , trip, kids "), ["Trip", "kids"]);
    assert.equal(hasTag(["Trip"], "trip"), true);
    const row = { personId: "ada", tags: ["Trip"] };
    assert.equal(matchTxnFilters(row, { personId: "ada", tag: "trip" }), true);
    assert.equal(matchTxnFilters(row, { personId: "household" }), false);
    assert.equal(matchTxnFilters({ personId: null, tags: [] }, { personId: "household" }), true);
  });
});

describe("a jar's profit", () => {
  it("counts income and expenses and ignores a transfer", () => {
    const rows = [
      txn({ postedOn: "2026-10-02", amountCents: 100_000, categoryId: "in" }),
      txn({ postedOn: "2026-10-03", amountCents: -40_000, categoryId: "out" }),
      txn({ postedOn: "2026-10-04", amountCents: -900_000, categoryId: "move" }),
      txn({ postedOn: "2025-10-04", amountCents: 50_000, categoryId: "in" }),
    ];
    const year = ledgerProfit(rows, [income, supplies, transfer], "2026-01-01", "2026-12-31");
    assert.deepEqual(year, { income: 100_000, expenses: 40_000, profit: 60_000 });
  });

  it("drops gas already covered by the standard mileage rate", () => {
    const rows = [txn({ postedOn: "2026-08-01", amountCents: -5_000, categoryId: "gas" })];
    const kept = ledgerProfit(rows, [gas], "2026-01-01", "2026-12-31");
    const dropped = ledgerProfit(rows, [gas], "2026-01-01", "2026-12-31", 0, ["gas"]);
    assert.equal(kept.expenses, 5_000);
    assert.equal(dropped.expenses, 0);
  });

  it("adds only operating jars, and mileage, into the household business profit", () => {
    const trip = { on: "2026-06-15", milesHundredths: 1_000 };
    const books = [
      { archived: false, kind: "personal", transactions: [txn({ postedOn: "2026-02-01", amountCents: 9_000_000, categoryId: "in" })], categories: [income] },
      { archived: true, kind: "business", transactions: [txn({ postedOn: "2026-02-01", amountCents: 8_000_000, categoryId: "in" })], categories: [income] },
      {
        archived: false,
        kind: "business",
        taxForm: "C",
        trips: [trip],
        transactions: [txn({ postedOn: "2026-03-01", amountCents: 200_000, categoryId: "in" })],
        categories: [income],
      },
    ];
    assert.equal(mileageDeductionCents([trip], "2026-01-01", "2026-12-31"), 725);
    assert.equal(booksProfit(books, 2026), 200_000 - 725);
  });
});

describe("left to assign", () => {
  it("is this month's income minus what is assigned", () => {
    const rent = category({ id: "rent", flow: "out", monthlyCents: 100_000 });
    const oldOnly = planModel([income], [txn({ id: "old", amountCents: 50_000, postedOn: "2024-01-15", categoryId: "in" })], [], "2026-10", 1);
    assert.equal(oldOnly.leftToAssign, 0);
    const month = planModel(
      [income, rent],
      [
        txn({ id: "old", amountCents: 500_000, postedOn: "2025-06-15", categoryId: "in" }),
        txn({ id: "pay", amountCents: 300_000, postedOn: "2026-10-02", categoryId: "in" }),
      ],
      [],
      "2026-10",
      1,
    );
    assert.equal(month.income, 300_000);
    assert.equal(month.leftToAssign, 200_000);
  });
});

function sampleBill(patch: Partial<Bill> & Pick<Bill, "id" | "nextDue">): Bill {
  return {
    name: "Power",
    payee: "Harbor Electric",
    kind: "utility",
    direction: "out",
    categoryId: "power",
    accountId: null,
    debtAccountId: null,
    amountCents: 10_000,
    principalCents: null,
    cadence: "monthly",
    autopay: false,
    status: "active",
    variable: true,
    notes: "",
    url: "",
    personId: null,
    meterId: "meter",
    flatPay: false,
    ...patch,
  };
}

function samplePayment(patch: Partial<Payment> & Pick<Payment, "id" | "billId" | "paidOn" | "amountCents">): Payment {
  return {
    accountId: "checking",
    transactionId: null,
    readingId: null,
    status: "paid",
    ...patch,
  };
}

describe("bill months", () => {
  it("shows a payment and a due that has none", () => {
    const power = sampleBill({ id: "power", nextDue: "2026-11-06" });
    const rows = billMonthRows(
      [power],
      [samplePayment({ id: "p1", billId: "power", paidOn: "2026-10-04", amountCents: 8_000, transactionId: "t1" })],
      "2026-10",
      1,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, "payment");
    const open = billMonthRows([power], [], "2026-10", 1);
    assert.equal(open.length, 1);
    assert.equal(open[0]?.kind, "due");
    assert.equal(open[0]?.date, "2026-10-06");
    assert.deepEqual(duesInRange("2026-11-06", "monthly", "2026-10-01", "2026-10-31"), ["2026-10-06"]);
  });

  it("matches a transaction by payee, amount, and a date near the due date", () => {
    const hit = txn({ id: "hit", amountCents: -8_000, postedOn: "2026-10-08", merchant: "Harbor Electric", memo: "" });
    const far = txn({ id: "far", amountCents: -8_000, postedOn: "2026-08-01", merchant: "Harbor Electric", memo: "" });
    const other = txn({ id: "other", amountCents: -8_000, postedOn: "2026-10-08", merchant: "Water", memo: "" });
    const matches = billTxnMatches(sampleBill({ id: "power", nextDue: "2026-10-06" }), [far, other, hit], 8_000, "2026-10-06", new Set());
    assert.deepEqual(matches.map((row) => row.id), ["hit"]);
  });

  it("averages that same month from the previous two years", () => {
    const projected = projectedBillCents(
      "power",
      "meter",
      [samplePayment({ id: "p", billId: "power", paidOn: "2025-10-04", amountCents: 9_000 })],
      [{ meterId: "meter", readOn: "2024-10-05", amountCents: 7_000, opening: false }],
      "2026-10",
    );
    assert.equal(projected, 8_000);
    assert.equal(projectedBillCents("power", "meter", [], [], "2026-10"), null);
  });
});

describe("mileage", () => {
  it("uses the 2026 rate that changes on July 1 and skips a commute", () => {
    const trips = [
      { on: "2026-06-15", milesHundredths: 1_000, parkingCents: 200 },
      { on: "2026-08-01", milesHundredths: 1_000 },
      { on: "2026-08-02", milesHundredths: 5_000, use: "commute" },
    ];
    assert.equal(mileageDeductionCents(trips, "2026-01-01", "2026-12-31"), 725 + 200 + 760);
    assert.equal(mileageBasisCents(trips, "2026-01-01", "2026-12-31"), 350 + 350);
    assert.deepEqual(omittedVehicleLines(trips), ["car", "auto", "gas"]);
    assert.deepEqual(omittedVehicleLines([{ on: "2026-08-02", milesHundredths: 100, use: "commute" }]), []);
  });
});

describe("Schedule D and the worksheet", () => {
  it("holds a lot a year before calling the gain long-term", () => {
    assert.equal(holdingTerm("2025-10-16", "2026-10-16"), "long");
    assert.equal(holdingTerm("2025-10-16", "2026-10-15"), "short");
  });

  it("nets short against long and caps the ordinary loss at $3,000", () => {
    const mixed = scheduleD(
      [
        { soldOn: "2026-02-01", gainCents: -50_000, term: "short" },
        { soldOn: "2026-03-01", gainCents: 80_000, term: "long" },
        { soldOn: "2025-03-01", gainCents: 999, term: "long" },
      ],
      2026,
    );
    assert.equal(mixed.netLong, 30_000);
    assert.equal(mixed.longTaxCents, 4_500);
    const loss = scheduleD([{ soldOn: "2026-04-01", gainCents: -400_000, term: "short" }], 2026);
    assert.equal(loss.ordinaryCents, -300_000);
    assert.equal(loss.carryCents, -100_000);
  });

  it("taxes long-term gain at 15% and keeps it out of ordinary income", () => {
    const tax = estimateTax(profile({ wagesCents: 5_000_000, priorYearTaxCents: 200_000 }), [], [], "2026-10-16", 0, {
      longCents: 100_000,
    });
    assert.equal(tax.agi, 5_000_000);
    assert.equal(tax.deduction, 1_610_000);
    assert.equal(tax.federal, federalTaxCents(3_390_000, "single") + 15_000);
    assert.equal(tax.safeHarbor, 200_000);
    const high = estimateTax(profile({ wagesCents: 20_000_000, priorYearTaxCents: 100_000 }), [], [], "2026-10-16");
    assert.equal(high.safeHarbor, 110_000);
  });

  it("taxes the first $10,000 of ordinary income at 10%", () => {
    assert.equal(federalTaxCents(1_000_000, "single"), 100_000);
    assert.equal(federalTaxCents(2_000_000, "single"), 215_200);
  });
});

describe("household figures", () => {
  it("counts bank, investments, and debts, and skips an archived account", () => {
    const parts = netWorthParts(
      [
        account({ kind: "checking", balanceCents: 3_000_000 }),
        account({ id: "old", kind: "checking", balanceCents: 9_000_000, archived: true }),
        account({ id: "card", kind: "credit", balanceCents: 1_000_000 }),
        account({ id: "broker", kind: "investment", balanceCents: 7_000_000 }),
      ],
      [asset(50_000_000)],
    );
    assert.equal(parts.cash, 3_000_000);
    assert.equal(parts.investments, 7_000_000);
    assert.equal(parts.property, 50_000_000);
    assert.equal(parts.debts, 1_000_000);
    assert.equal(parts.net, 59_000_000);
  });

  it("splits income and spending by person", () => {
    const rows = personFlow(
      [
        txn({ postedOn: "2026-10-01", amountCents: -2_000, personId: "ada" }),
        txn({ postedOn: "2026-10-02", amountCents: 5_000, personId: "beau" }),
        txn({ postedOn: "2026-10-03", amountCents: -100 }),
      ],
      [
        { id: "ada", name: "Ada" },
        { id: "beau", name: "Beau" },
      ],
      "2026-10-01",
      "2026-10-31",
    );
    assert.equal(rows.find((row) => row.id === "ada")?.spending, 2_000);
    assert.equal(rows.find((row) => row.id === "beau")?.income, 5_000);
    assert.equal(rows.find((row) => row.name === "Household")?.spending, 100);
  });
});

describe("portfolio", () => {
  it("treats a buy as money in and a sale as money out", () => {
    assert.equal(flowToPortfolio("buy", 500), 500);
    assert.equal(flowToPortfolio("sell", 500), -500);
    assert.deepEqual(lotMarketCents({ symbol: "VTI", acquiredOn: "2024-01-01", sharesMicros: 0, costCents: 100, closedOn: "2026-10-01" }, 200), { cents: 0, priced: true });
  });

  it("earns 10% when the ending value is 10% above the money put in", () => {
    const rate = modifiedDietz("2026-01-01", "2026-12-31", 11_000, [{ date: "2026-01-01", into: 10_000 }]);
    assert.ok(rate != null);
    assert.ok(Math.abs(rate - 0.1) < 0.000_001);
  });
});

describe("import matches", () => {
  const existing = {
    accountId: "checking",
    postedOn: "2026-10-01",
    amountCents: -1240,
    merchant: "Blue Bottle Coffee",
  };

  it("matches a close merchant on the same account within a week, ignoring case", () => {
    assert.equal(merchantClose("BLUE BOTTLE", "Blue Bottle Coffee"), true);
    const hits = importMatches(
      { key: "a", accountId: "checking", postedOn: "2026-10-06", amountCents: -1240, merchant: "blue bottle" },
      [existing, { ...existing, accountId: "card" }, { ...existing, amountCents: -1300 }, { ...existing, postedOn: "2026-09-01" }],
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.accountId, "checking");
  });

  it("does not treat a short fragment as a merchant match", () => {
    assert.equal(merchantClose("bar", "Blue Bottle Coffee"), false);
  });

  it("treats a card prefix and a shortened merchant as the same name", () => {
    assert.equal(merchantClose("VISA BLUE BOTTLE", "Blue Bottle"), true);
    assert.equal(merchantClose("MC BLU BTTL", "Blue Bottle Coffee"), true);
    assert.equal(merchantClose("MC BLU BTTL", "Chevron"), false);
  });
});

describe("parseOfx", () => {
  const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261001120000.000[-5:EST]
<TRNAMT>-12.40
<FITID>abc
<NAME>Blue Bottle
<MEMO>coffee
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261002
<TRNAMT>1500.00
<FITID>def
<NAME>Payroll
</STMTTRN>
</OFX>`;

  it("reads posted date, signed amount, merchant, and memo", () => {
    const rows = parseOfx(ofx);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { postedOn: "2026-10-01", amountCents: -1240, merchant: "Blue Bottle", memo: "coffee" });
    assert.deepEqual(rows[1], { postedOn: "2026-10-02", amountCents: 150000, merchant: "Payroll", memo: "" });
  });

  it("treats an OFX paste as a statement and a CSV as a CSV", () => {
    assert.equal(parseStatement(ofx).length, 2);
    assert.equal(parseStatement("date,amount,merchant\n2026-10-01,-12.40,Blue Bottle").length, 1);
  });
});

describe("transfer imports", () => {
  const accounts = [
    { id: "checking", name: "Everyday checking", mask: "4418" },
    { id: "savings", name: "Reserve savings", mask: "4253" },
  ];

  it("reads the other account's last four from a transfer description", () => {
    assert.equal(transferOtherMask("Transfer From Checking -4253"), "4253");
    assert.equal(otherTransferAccount("Transfer From Checking -4253", "checking", accounts)?.id, "savings");
    assert.equal(transferOtherMask("Blue Bottle"), null);
  });

  it("matches the opposite amount already posted on the other account", () => {
    const hits = transferMatches(
      { key: "1", accountId: "savings", postedOn: "2026-10-02", amountCents: 50000, merchant: "Transfer From Checking -4418" },
      [{ accountId: "checking", postedOn: "2026-10-01", amountCents: -50000, merchant: "Transfer to savings -4253" }],
      accounts,
    );
    assert.equal(hits.length, 1);
  });
});
