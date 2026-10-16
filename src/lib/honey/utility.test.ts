import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SAMPLE_POWER_TIERS,
  buildSheet,
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
