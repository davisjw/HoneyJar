import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SAMPLE_POWER_TIERS,
  buildSheet,
  calderUtilityHistory,
  daysBetweenReads,
  evaluateFormula,
  guessUtilityMap,
  historySeries,
  historyYear,
  importTargets,
  parseUtilityNumber,
  planUtilityCsv,
  priorRead,
  carriedValue,
  readCsvTable,
  starterColumns,
  tierChargeCents,
  utilityReadDate,
  type ReadLike,
  type UtilColumn,
} from "./utility.ts";

function read(patch: Partial<ReadLike> & Pick<ReadLike, "id" | "utilityId" | "date">): ReadLike {
  return { meter: null, amountCents: 0, opening: false, cells: {}, ...patch };
}

describe("utility tiers", () => {
  it("prices 170 kWh in the first block at 12.4 cents", () => {
    assert.equal(tierChargeCents(170, SAMPLE_POWER_TIERS), 2108);
  });
});

describe("utility sheet", () => {
  it("counts days from the previous meter read", () => {
    assert.equal(daysBetweenReads("2026-01-01", "2026-01-31"), 30);
    assert.equal(daysBetweenReads(null, "2026-01-31"), null);
  });

  it("does not throw on a bad formula", () => {
    const result = evaluateFormula("{nope} / 0", {
      year: 2026,
      month: 1,
      days: 31,
      periodDays: 30,
      current: {},
      prev: {},
      history: [],
      tiers: [],
    });
    assert.equal(result.ok, false);
  });

  it("fills grid kWh and tier energy from typed cells", () => {
    const columns = starterColumns("m", "electric");
    const readings: ReadLike[] = [
      read({ id: "a", utilityId: "m", date: "2026-01-06", meter: 1000, opening: true }),
      read({
        id: "b",
        utilityId: "m",
        date: "2026-02-05",
        meter: 1170,
        amountCents: 10800,
        cells: { generation_kwh: 20, energy_charge: 66, delivery_charge: 24, riders: 10, taxes_fees: 8 },
      }),
    ];
    const rows = buildSheet("m", columns, readings, [], SAMPLE_POWER_TIERS);
    const last = rows[1]!;
    assert.equal(last.computed.usage_kwh, 170);
    assert.equal(last.computed.read_days, 30);
    assert.equal(starterColumns("m", "electric").find((c) => c.key === "read_days")?.formula, "{read_on} - {prev.read_on}");
    assert.equal(starterColumns("m", "water").find((c) => c.key === "usage_ccf")?.formula, "{meter_read} - {prev.meter_read}");
    assert.equal(starterColumns("m", "cellular").some((c) => c.rollup === "usage"), false);
    assert.equal(last.computed.grid_kwh, 150);
    assert.equal(last.computed.energy_tier_charge, 21.08);
    assert.equal(last.computed.bill_sum, 108);
  });

  it("rolls child usage into Tesla kWh and child bills into money", () => {
    const parent = starterColumns("house", "electric");
    const child = starterColumns("ev", "blank", "kWh");
    const plan: UtilColumn = {
      id: "plan",
      utilityId: "house",
      key: "plan_amount",
      label: "Plan",
      kind: "money",
      unit: "$",
      formula: "",
      rollup: "",
      fromChildren: true,
    };
    const readings: ReadLike[] = [
      read({ id: "h0", utilityId: "house", date: "2026-01-06", meter: 500, opening: true }),
      read({ id: "h1", utilityId: "house", date: "2026-02-05", meter: 670, amountCents: 10000 }),
    ];
    const kids: ReadLike[] = [
      read({ id: "e0", utilityId: "ev", date: "2026-01-06", meter: 10, opening: true }),
      read({ id: "e1", utilityId: "ev", date: "2026-02-05", meter: 64, amountCents: 2500 }),
    ];
    const rows = buildSheet("house", [...parent, plan], readings, kids, [], child);
    const last = rows[1]!;
    assert.equal(last.computed.tesla_kwh, 54);
    assert.equal(last.computed.plan_amount, 25);
    assert.notEqual(last.computed.plan_amount, 54);
  });

  it("fills a calculated column from another calculated column, even when listed first", () => {
    const base: UtilColumn = {
      id: "n",
      utilityId: "m",
      key: "n",
      label: "N",
      kind: "number",
      unit: "",
      formula: "",
      rollup: "",
      fromChildren: false,
    };
    const chain: UtilColumn[] = [1, 2, 3, 4, 5, 6].map((step) => ({
      id: `c${step}`,
      utilityId: "m",
      key: `c${step}`,
      label: `Step ${step}`,
      kind: "calculated",
      unit: "",
      formula: step === 1 ? "{n} + 1" : `{c${step - 1}} + 1`,
      rollup: "",
      fromChildren: false,
    }));
    const rows = buildSheet("m", [...chain].reverse().concat(base), [
      read({ id: "a", utilityId: "m", date: "2026-02-01", cells: { n: 1 } }),
    ]);
    assert.equal(rows[0]?.computed.c6, 7);
    assert.equal(rows[0]?.errors.c6, undefined);
  });

  it("uses a column name and treats a blank number beside a calculated field as zero", () => {
    const columns = starterColumns("m", "electric");
    const rows = buildSheet("m", columns, [
      read({ id: "a", utilityId: "m", date: "2026-01-06", meter: 1000, opening: true }),
      read({ id: "b", utilityId: "m", date: "2026-02-05", meter: 1170, amountCents: 10800 }),
    ], [], SAMPLE_POWER_TIERS);
    const last = rows[1]!;
    assert.equal(last.computed.usage_kwh, 170);
    assert.equal(last.computed.grid_kwh, 170);
    const named = buildSheet("m", [
      { id: "u", utilityId: "m", key: "usage_kwh", label: "Usage kWh", kind: "number", unit: "kWh", formula: "", rollup: "", fromChildren: false },
      { id: "d", utilityId: "m", key: "double", label: "Double", kind: "calculated", unit: "", formula: "{Usage kWh} * 2", rollup: "", fromChildren: false },
    ], [read({ id: "a", utilityId: "m", date: "2026-02-01", cells: { usage_kwh: 10 } })]);
    assert.equal(named[0]?.computed.double, 20);
  });

  it("rolls a child calculated column up to the parent", () => {
    const parent: UtilColumn = {
      id: "gal",
      utilityId: "house",
      key: "usage_gal",
      label: "Usage gallons",
      kind: "number",
      unit: "gal",
      formula: "",
      rollup: "",
      fromChildren: true,
    };
    const rows = buildSheet(
      "house",
      [parent],
      [read({ id: "h", utilityId: "house", date: "2026-02-05" })],
      [
        read({ id: "w0", utilityId: "w", date: "2026-01-06", meter: 100, opening: true }),
        read({ id: "w1", utilityId: "w", date: "2026-02-05", meter: 110 }),
      ],
      [],
      starterColumns("w", "water"),
    );
    assert.equal(rows[0]?.computed.usage_gal, 7480);
  });
});

describe("calder utility history", () => {
  const books = calderUtilityHistory("2026-10-16");
  const pge = books.find((b) => b.key === "pge")!;
  const ev = books.find((b) => b.key === "ev")!;
  const water = books.find((b) => b.key === "water")!;
  const phone = books.find((b) => b.key === "phone")!;

  it("covers a prior year and leaves the open October electric bill unpaid", () => {
    const billed = pge.readings.filter((r) => !r.opening);
    assert.equal(billed[0]?.readOn, "2025-01-06");
    assert.equal(billed.at(-1)?.readOn, "2026-10-06");
    assert.equal(pge.payments.some((p) => p.stamp === "202610"), false);
    assert.equal(pge.payments.some((p) => p.stamp === "202609"), true);
    assert.equal(pge.bill?.amountCents, billed.at(-1)?.amountCents);
  });

  it("keeps the charger under the house and shows the August line-item gap", () => {
    const aug = pge.readings.find((r) => r.stamp === "202608")!;
    const charger = ev.readings.find((r) => r.stamp === "202608")!;
    const house = (aug.meter ?? 0) - (pge.readings.find((r) => r.stamp === "202607")?.meter ?? 0);
    const evUse = (charger.meter ?? 0) - (ev.readings.find((r) => r.stamp === "202607")?.meter ?? 0);
    assert.ok(evUse > 0 && evUse < house);
    const lines = Math.round((aug.cells.energy_charge! + aug.cells.delivery_charge! + aug.cells.riders! + aug.cells.taxes_fees! + aug.cells.gas_charge!) * 100);
    assert.equal(aug.amountCents - lines, 640);
  });

  it("links water, phone, and internet statements to a payment once the due date has passed", () => {
    assert.equal(water.payments.some((p) => p.stamp === "202610"), false);
    assert.equal(water.payments.some((p) => p.stamp === "202609"), true);
    assert.equal(phone.payments.find((p) => p.stamp === "202610")?.amountCents, 9500);
    assert.equal(phone.bill?.amountCents, 9500);
  });

  it("charts this year against last year and marks an unpaid month", () => {
    const columns = starterColumns(pge.key, pge.template, pge.unit);
    for (const edit of pge.formulaEdits ?? []) {
      const column = columns.find((item) => item.key === edit.key);
      if (column) column.formula = edit.formula;
    }
    for (const extra of pge.extraColumns ?? []) {
      columns.push({
        id: extra.key,
        utilityId: pge.key,
        key: extra.key,
        label: extra.label,
        kind: extra.kind,
        unit: extra.unit ?? "",
        formula: extra.formula ?? "",
        rollup: extra.rollup ?? "",
        fromChildren: false,
      });
    }
    const readings: ReadLike[] = pge.readings.map((reading) => ({
      id: reading.stamp,
      utilityId: pge.key,
      date: reading.readOn,
      meter: reading.meter,
      amountCents: reading.amountCents,
      opening: reading.opening,
      cells: reading.cells,
    }));
    const rows = buildSheet(pge.key, columns, readings, [], pge.tiers, []);
    const series = historySeries(columns);
    assert.ok(series.some((item) => item.key === "usage_kwh"));
    assert.ok(series.some((item) => item.key === "gas_therms"));
    assert.equal(series.some((item) => item.key === "meter_read"), false);
    const points = historyYear(
      rows,
      columns,
      "usage_kwh",
      2026,
      pge.payments.map((payment) => ({ readingId: payment.stamp, amountCents: payment.amountCents })),
    );
    assert.equal(points[7]?.label, "Aug");
    assert.equal(points[7]?.lineGap, true);
    assert.equal(points[8]?.paid, points[8]?.statement);
    assert.equal(points[9]?.paid, null);
    assert.ok((points[9]?.thisYear ?? 0) > 0);
    assert.ok((points[0]?.lastYear ?? 0) > 0);
  });
});

describe("utility csv import", () => {
  it("keeps a full day and uses the first day when the file has only a month", () => {
    assert.deepEqual(utilityReadDate("2024-03-18"), { month: "2024-03", readOn: "2024-03-18" });
    assert.deepEqual(utilityReadDate("2024-03"), { month: "2024-03", readOn: "2024-03-01" });
    assert.deepEqual(utilityReadDate("3/2024"), { month: "2024-03", readOn: "2024-03-01" });
    assert.deepEqual(utilityReadDate("Mar 2024"), { month: "2024-03", readOn: "2024-03-01" });
    assert.equal(utilityReadDate("2024"), null);
    assert.equal(utilityReadDate("2024-02-31"), null);
  });

  it("reads dollars and ignores a blank cell", () => {
    assert.deepEqual(parseUtilityNumber("$1,234.50"), { value: 1234.5 });
    assert.deepEqual(parseUtilityNumber(""), { blank: true });
    assert.deepEqual(parseUtilityNumber("n/a"), { error: true });
  });

  it("does not offer calculated columns", () => {
    const keys = importTargets(starterColumns("m", "electric", "kWh")).map((column) => column.key);
    assert.ok(keys.includes("meter_read"));
    assert.equal(keys.includes("usage_kwh"), false);
    assert.equal(keys.includes("read_on"), false);
    assert.equal(keys.includes("read_days"), false);
  });

  it("matches a month, shows only real differences, and does not invent a second read", () => {
    const table = readCsvTable("Month,Meter read,Bill amount\n2024-03,120,40\n2024-03-18,130,41\n2024-04,140,\n");
    const plan = planUtilityCsv(
      table.rows,
      0,
      [{ index: 1, key: "meter_read" }, { index: 2, key: "bill_amount" }],
      [{ id: "r1", readOn: "2024-03-15", cells: { meter_read: 100, bill_amount: 40 } }],
    );
    assert.equal(plan[0]?.readingId, "r1");
    assert.deepEqual(plan[0]?.diffs, [{ key: "meter_read", before: 100, after: 120 }]);
    assert.equal(plan[1]?.month, "2024-03");
    assert.equal(plan[1]?.readingId, "r1");
    assert.equal(plan[2]?.readingId, null);
    assert.equal(plan[2]?.readOn, "2024-04-01");
    assert.deepEqual(plan[2]?.values, { meter_read: 140 });
    const doubled = planUtilityCsv(
      [["2024-05"]],
      0,
      [],
      [
        { id: "a", readOn: "2024-05-01", cells: {} },
        { id: "b", readOn: "2024-05-20", cells: {} },
      ],
    );
    assert.match(doubled[0]?.blocked ?? "", /more than one/);
  });

  it("guesses the date column and a matching label", () => {
    const guess = guessUtilityMap(["Bill date", "Meter read", "Notes"], [{ key: "meter_read", label: "Meter read" }]);
    assert.equal(guess.dateIndex, 0);
    assert.deepEqual(guess.mapping, { 1: "meter_read" });
  });
});

describe("last month default", () => {
  const readings: { readOn: string; meter: number | null; amountCents: number; cells: Record<string, number> }[] = [
    { readOn: "2024-02-15", meter: 100, amountCents: 4000, cells: { plan: 55 } },
    { readOn: "2024-03-18", meter: 120, amountCents: 4400, cells: { plan: 55 } },
    { readOn: "2024-04-02", meter: 140, amountCents: 5000, cells: {} },
  ];

  it("uses the latest read before the new date", () => {
    assert.equal(priorRead(readings, "2024-04-01")?.readOn, "2024-03-18");
    assert.equal(priorRead(readings, "2024-02-15"), null);
    assert.equal(priorRead(readings, "2024-02"), null);
  });

  it("copies a typed cell, then the meter, then the bill in dollars", () => {
    const march = readings[1]!;
    assert.equal(carriedValue({ key: "plan", rollup: "" }, march), 55);
    assert.equal(carriedValue({ key: "meter_read", rollup: "meter" }, march), 120);
    assert.equal(carriedValue({ key: "bill_amount", rollup: "bill" }, readings[2]!), 50);
  });
});
