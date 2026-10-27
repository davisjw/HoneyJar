import { useMemo, useState } from "react";
import { monthLabel, prettyDate } from "@/lib/honey/calc";
import type { UtilityColumn, UtilityMeter, UtilityReading } from "@/lib/honey/types";
import {
  guessUtilityMap,
  importTargets,
  planUtilityCsv,
  readCsvTable,
  type UtilityCsvRow,
} from "@/lib/honey/utility";
import { useBook } from "../book";
import { Button, Card, fieldClass } from "../kit";

function showValue(value: number | null, money: boolean) {
  if (value == null) return "empty";
  if (money) return `$${value.toFixed(2)}`;
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function cellsFor(reading: UtilityReading, columns: UtilityColumn[]): Record<string, number> {
  const cells = { ...reading.cells };
  const meterKey = columns.find((column) => column.rollup === "meter")?.key;
  const billKey = columns.find((column) => column.rollup === "bill")?.key;
  if (meterKey && cells[meterKey] == null && reading.meter != null) cells[meterKey] = reading.meter;
  if (billKey && cells[billKey] == null) cells[billKey] = reading.amountCents / 100;
  return cells;
}

export function UtilityImport({
  meter,
  columns,
  readings,
  onClose,
}: {
  meter: UtilityMeter;
  columns: UtilityColumn[];
  readings: UtilityReading[];
  onClose: () => void;
}) {
  const { run } = useBook();
  const targets = useMemo(() => importTargets(columns), [columns]);
  const [text, setText] = useState("");
  const [step, setStep] = useState<"file" | "review">("file");
  const [dateIndex, setDateIndex] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [seen, setSeen] = useState("");
  const table = useMemo(() => (text.trim() ? readCsvTable(text) : null), [text]);
  if (table && text !== seen) {
    const guess = guessUtilityMap(table.headers, targets);
    setSeen(text);
    setDateIndex(guess.dateIndex);
    setMapping(guess.mapping);
    setStep("file");
  }
  const labels = useMemo(() => new Map(targets.map((column) => [column.key, column])), [targets]);
  const plan = useMemo(() => {
    if (!table || dateIndex == null || step !== "review") return [];
    const mapped = Object.entries(mapping).flatMap(([index, key]) => (key ? [{ index: Number(index), key }] : []));
    return planUtilityCsv(
      table.rows,
      dateIndex,
      mapped,
      readings.map((reading) => ({ id: reading.id, readOn: reading.readOn, cells: cellsFor(reading, columns) })),
    );
  }, [columns, dateIndex, mapping, readings, step, table]);

  function choose(index: number, value: string) {
    setMapping((current) => {
      const next = { ...current };
      if (value && value !== "__date") {
        for (const key of Object.keys(next)) {
          if (next[Number(key)] === value) delete next[Number(key)];
        }
        next[index] = value;
      } else delete next[index];
      return next;
    });
    setDateIndex((current) => (value === "__date" ? index : current === index ? null : current));
  }

  return (
    <Card className="min-h-0 flex-1 overflow-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Import {meter.name}</p>
          <p className="text-xs text-muted">Match columns, then choose each change. A row matches an existing read by month and year. Calculated columns are not listed.</p>
        </div>
        <Button tone="quiet" onClick={onClose}>Close</Button>
      </div>
      {step === "file" ? (
        <>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
          {!table ? <p className="mt-3 text-sm text-muted">The first row of the file should be the column names.</p> : null}
          {table && !table.rows.length ? <p className="mt-3 text-sm text-muted">That file has headers but no data rows.</p> : null}
          {table && table.rows.length ? (
            <div className="mt-4 space-y-2">
              {table.headers.map((header, index) => (
                <label key={`${header}-${index}`} className="grid gap-1 text-sm sm:grid-cols-[1fr_16rem] sm:items-center">
                  <span>{header}</span>
                  <select className={fieldClass} value={dateIndex === index ? "__date" : mapping[index] ?? ""} onChange={(e) => choose(index, e.target.value)}>
                    <option value="">Ignore</option>
                    <option value="__date">Read date</option>
                    {targets.map((column) => (
                      <option key={column.key} value={column.key}>{column.label}</option>
                    ))}
                  </select>
                </label>
              ))}
              <p className="text-xs text-muted">One column has to be the read date, with at least a month and a year. Money is in dollars, the way the sheet shows it.</p>
              <Button tone="primary" disabled={dateIndex == null} onClick={() => setStep("review")}>Review {table.rows.length}</Button>
            </div>
          ) : null}
        </>
      ) : (
        <Review
          plan={plan}
          labels={labels}
          onBack={() => setStep("file")}
          onApply={async (rows) => {
            if (!rows.length) return;
            await run({ type: "reading.import", meterId: meter.id, rows });
            onClose();
          }}
        />
      )}
    </Card>
  );
}

function Review({
  plan,
  labels,
  onBack,
  onApply,
}: {
  plan: UtilityCsvRow[];
  labels: Map<string, UtilityColumn>;
  onBack: () => void;
  onApply: (rows: { readOn: string; create: boolean; cells: Record<string, number> }[]) => Promise<void>;
}) {
  const [useLine, setUseLine] = useState<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const row of plan) if (row.month && !row.blocked && next[row.month] == null) next[row.month] = row.line;
    return next;
  });
  const [accept, setAccept] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const row of plan) for (const diff of row.diffs) next[`${row.line}:${diff.key}`] = true;
    return next;
  });
  const [create, setCreate] = useState<Record<number, boolean>>({});
  const groups = new Map<string, UtilityCsvRow[]>();
  const blocked = plan.filter((row) => row.blocked || !row.month);
  for (const row of plan) {
    if (!row.month || row.blocked) continue;
    const list = groups.get(row.month) ?? [];
    list.push(row);
    groups.set(row.month, list);
  }
  const missing = [...groups.values()].filter((rows) => rows.some((row) => !row.readingId)).length;

  function payload() {
    const rows: { readOn: string; create: boolean; cells: Record<string, number> }[] = [];
    for (const [month, choices] of groups) {
      const row = choices.find((item) => item.line === (useLine[month] ?? choices[0]?.line)) ?? choices[0];
      if (!row) continue;
      if (row.readingId) {
        const cells: Record<string, number> = {};
        for (const diff of row.diffs) if (accept[`${row.line}:${diff.key}`]) cells[diff.key] = diff.after;
        if (Object.keys(cells).length) rows.push({ readOn: row.readOn, create: false, cells });
      } else if (create[row.line]) {
        rows.push({ readOn: row.readOn, create: true, cells: row.values });
      }
    }
    return rows;
  }
  const chosen = payload();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button tone="quiet" onClick={onBack}>Back</Button>
        {missing ? (
          <Button
            tone="quiet"
            onClick={() => {
              const next: Record<number, boolean> = {};
              for (const [month, choices] of groups) {
                const row = choices.find((item) => item.line === (useLine[month] ?? choices[0]?.line)) ?? choices[0];
                if (row && !row.readingId) next[row.line] = true;
              }
              setCreate(next);
            }}
          >
            Mark every missing month
          </Button>
        ) : null}
        <Button disabled={!chosen.length} onClick={() => onApply(chosen)}>Apply {chosen.length || ""}</Button>
      </div>
      {[...groups.entries()].map(([month, choices]) => {
        const selected = choices.find((row) => row.line === (useLine[month] ?? choices[0]?.line)) ?? choices[0]!;
        return (
          <section key={month} className="rounded-xl border border-line p-3">
            <p className="font-medium">{monthLabel(month)}</p>
            {choices.length > 1 ? (
              <div className="mt-2 space-y-1">
                {choices.map((row) => (
                  <label key={row.line} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={month}
                      checked={selected.line === row.line}
                      onChange={() => setUseLine((current) => ({ ...current, [month]: row.line }))}
                    />
                    Use row {row.line}
                    {row.readOn.slice(8) !== "01" ? ` (${prettyDate(row.readOn)})` : ""}
                  </label>
                ))}
                <p className="text-xs text-muted">Only one row is used for this month, so the import does not add a second read.</p>
              </div>
            ) : null}
            {selected.readingId ? (
              selected.diffs.length ? (
                <div className="mt-2 space-y-1">
                  {selected.diffs.map((diff) => {
                    const column = labels.get(diff.key);
                    return (
                      <label key={diff.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={accept[`${selected.line}:${diff.key}`] ?? false}
                          onChange={(e) => setAccept((current) => ({ ...current, [`${selected.line}:${diff.key}`]: e.target.checked }))}
                        />
                        <span>{column?.label ?? diff.key}: {showValue(diff.before, column?.kind === "money")} → {showValue(diff.after, column?.kind === "money")}</span>
                      </label>
                    );
                  })}
                </div>
              ) : <p className="mt-2 text-sm text-muted">This month already matches. Nothing will change.</p>
            ) : (
              <label className="mt-2 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(create[selected.line])}
                  onChange={(e) => setCreate((current) => ({ ...current, [selected.line]: e.target.checked }))}
                />
                <span>
                  Create a read on {prettyDate(selected.readOn)}
                  <span className="mt-1 block text-muted">
                    {Object.entries(selected.values).map(([key, value]) => `${labels.get(key)?.label ?? key} ${showValue(value, labels.get(key)?.kind === "money")}`).join(" · ") || "No mapped numbers"}
                  </span>
                </span>
              </label>
            )}
          </section>
        );
      })}
      {blocked.length ? (
        <div>
          <p className="text-sm font-medium">Not imported</p>
          <ul className="mt-1 space-y-1 text-sm text-muted">
            {blocked.map((row) => (
              <li key={row.line}>Row {row.line}{row.month ? ` (${row.month})` : ""}: {row.blocked}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
