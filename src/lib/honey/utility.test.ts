import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SAMPLE_POWER_TIERS,
  buildSheet,
  calderUtilityHistory,
  daysBetweenReads,
  evaluateFormula,
  starterColumns,
  tierChargeCents,
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
});
