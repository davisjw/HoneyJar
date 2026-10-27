import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { averagesFromDaily, monthBounds, monthlyAverageF } from "./weather.ts";

describe("monthly temperature", () => {
  it("averages the days that were reported", () => {
    assert.equal(monthlyAverageF([70, null, 80]), 75);
    assert.equal(monthlyAverageF([null]), null);
  });

  it("uses the real last day of the month", () => {
    assert.deepEqual(monthBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
    assert.equal(monthBounds("2026-13"), null);
  });

  it("groups a daily series by month", () => {
    const months = averagesFromDaily([
      { date: "2026-01-01", temp: 70 },
      { date: "2026-01-02", temp: null },
      { date: "2026-01-03", temp: 80 },
      { date: "2026-02-01", temp: null },
    ]);
    assert.equal(months.get("2026-01"), 75);
    assert.equal(months.has("2026-02"), false);
  });
});
