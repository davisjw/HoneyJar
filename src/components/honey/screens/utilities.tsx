import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MUTED, RULE, axisTick } from "../charts";
import { money, prettyDate } from "@/lib/honey/calc";
import type { UtilityColumn, UtilityMeter, UtilityReading, Workspace } from "@/lib/honey/types";
import {
  UTILITY_TEMPLATES,
  duplicateColumnName,
  buildSheet,
  carriedValue,
  chargeCompare,
  cellMount,
  historySeries,
  historyYear,
  importTargets,
  previousMonth,
  priorRead,
  parseUtilityNumber,
  templateUnit,
  hasMeter,
  tierChargeCents,
  type ReadLike,
  type SheetRow,
  type UtilColumn,
} from "@/lib/honey/utility";
import { ContactField } from "../contact-field";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass, pinCell } from "../kit";
import { UtilityImport } from "./utility-import";

function param(search: string, key: string) {
  return new URLSearchParams(search.replace(/^\?/, "")).get(key) ?? "";
}

function engineColumn(c: UtilityColumn): UtilColumn {
  return {
    id: c.id,
    utilityId: c.meterId,
    key: c.key,
    label: c.label,
    kind: c.kind,
    unit: c.unit,
    formula: c.formula,
    rollup: c.rollup,
    fromChildren: c.fromChildren,
  };
}

function engineRead(r: UtilityReading): ReadLike {
  return { id: r.id, utilityId: r.meterId, date: r.readOn, meter: r.meter, amountCents: r.amountCents, opening: r.opening, cells: r.cells };
}

function tiersFromText(raw: string) {
  return raw.split("\n").flatMap((line) => {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return [];
    const rate = Number(parts.length === 1 ? parts[0] : parts[1]);
    const ceiling = parts.length === 1 ? null : Number(parts[0]);
    if (!Number.isFinite(rate)) return [];
    return [{ name: ceiling == null || !Number.isFinite(ceiling) ? "Rest" : `First ${ceiling}`, upTo: ceiling != null && Number.isFinite(ceiling) && ceiling > 0 ? ceiling : null, rateCents: rate }];
  });
}

function cellText(row: SheetRow, column: UtilColumn) {
  if (column.kind === "date" || column.rollup === "readDate") return prettyDate(row.date);
  const value = row.computed[column.key];
  if (value == null || Number.isNaN(value)) return "—";
  if (column.kind === "money" || column.rollup === "bill" || column.rollup === "charges" || column.unit === "$") return money(Math.round(value * 100));
  return String(Math.round(value * 1000) / 1000);
}

export function UtilitiesPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [tab, setTab] = useState<"graphs" | "workbook" | "columns">("workbook");
  const [picked, setPicked] = useState(param(search, "meter"));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UtilityMeter | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  if (!data) return null;
  const roots = data.meters.filter((m) => !m.parentId);
  const meter = data.meters.find((m) => m.id === (picked || roots[0]?.id)) ?? roots[0] ?? null;
  const kids = useMemo(
    () => (meter ? data.meters.filter((m) => m.parentId === meter.id) : []),
    [data.meters, meter],
  );
  const columns = useMemo(
    () => (meter ? data.columns.filter((c) => c.meterId === meter.id).slice().sort((a, b) => a.sort - b.sort) : []),
    [data.columns, meter],
  );
  const rows = useMemo(() => {
    if (!meter) return [];
    return buildSheet(
      meter.id,
      columns.map(engineColumn),
      data.readings.map(engineRead),
      data.readings.filter((r) => kids.some((k) => k.id === r.meterId)).map(engineRead),
      meter.tiers,
      data.columns.filter((c) => kids.some((k) => k.id === c.meterId)).map(engineColumn),
    );
  }, [meter, columns, kids, data.readings, data.columns]);
  const focus = param(search, "reading");
  const weather = useMemo(
    () => data.meters.filter((m) => data.readings.filter((r) => r.meterId === m.id && r.meter != null && !r.opening).length >= 2),
    [data.meters, data.readings],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageIntro
        title="Utilities"
        lede="A workbook for each meter. Calculated cells stay calculated. A bill in this jar can point at the parent meter."
        action={canEdit ? <Button onClick={() => setAdding(true)}>Add meter</Button> : null}
      />
      {weather.length ? (
        <div className="mb-4 grid shrink-0 gap-3 md:grid-cols-3">
          {weather.map((m) => {
            const series = data.readings.filter((r) => r.meterId === m.id && r.meter != null).slice().sort((a, b) => a.readOn.localeCompare(b.readOn));
            const last = series[series.length - 1];
            const prev = series[series.length - 2];
            const used = last && prev && last.meter != null && prev.meter != null && !last.opening ? last.meter - prev.meter : null;
            return (
              <button key={m.id} type="button" className="rounded-2xl border border-line bg-card p-4 text-left" onClick={() => { setPicked(m.id); setTab("graphs"); }}>
                <p className="text-sm text-muted">{m.name}</p>
                <p className="font-display text-2xl">{used == null ? "—" : `${Math.round(used)} ${m.unit}`}</p>
                <p className="text-xs text-muted">{last ? prettyDate(last.readOn) : ""}</p>
              </button>
            );
          })}
        </div>
      ) : null}
      {meter ? (
        <>
          <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
            <select className={fieldClass + " max-w-xs"} value={meter.id} onChange={(e) => setPicked(e.target.value)}>
              {data.meters.map((m) => (
                <option key={m.id} value={m.id}>{m.parentId ? `↳ ${m.name}` : m.name}</option>
              ))}
            </select>
            {["graphs", "workbook", "columns"].map((name) => (
              <Button key={name} tone={tab === name ? "primary" : "quiet"} onClick={() => setTab(name as typeof tab)}>{name[0]!.toUpperCase() + name.slice(1)}</Button>
            ))}
            {canEdit ? <Button tone="quiet" onClick={() => setEditing(meter)}>Edit meter</Button> : null}
            {canEdit ? <Button tone="quiet" onClick={() => setReading(true)}>Add read</Button> : null}
            {canEdit ? <Button tone="quiet" onClick={() => setImporting(true)}>Import CSV</Button> : null}
          </div>
          {importing ? (
            <UtilityImport
              key={meter.id}
              meter={meter}
              columns={columns}
              readings={data.readings.filter((reading) => reading.meterId === meter.id)}
              onClose={() => setImporting(false)}
            />
          ) : tab === "graphs" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <Graphs
                key={meter.id}
                meter={meter}
                columns={columns.map(engineColumn)}
                rows={rows}
                payments={data.payments}
                climate={data.weather}
                postal={meter.postal}
                today={data.today}
                run={run}
              />
            </div>
          ) : null}
          {!importing && tab === "workbook" ? (
            <Workbook
              meter={meter}
              columns={columns}
              rows={rows}
              readings={data.readings}
              payments={data.payments}
              bills={data.bills}
              focus={focus}
              canEdit={canEdit}
              onCell={(id, cells) => run({ type: "reading.cells", id, cells })}
              onDate={(id, readOn) => run({ type: "reading.date", id, readOn })}
            />
          ) : null}
          {!importing && tab === "columns" ? <div className="min-h-0 flex-1 overflow-auto"><ColumnsTab meter={meter} columns={columns} readings={data.readings.filter((reading) => reading.meterId === meter.id)} rows={rows} canEdit={canEdit} run={run} /></div> : null}
        </>
      ) : (
        <Card><p className="text-muted">No meters in this jar yet.</p></Card>
      )}
      {adding ? <MeterDialog parents={roots} onClose={() => setAdding(false)} /> : null}
      {editing ? <MeterDialog meter={editing} parents={data.meters.filter((m) => !m.parentId && m.id !== editing.id)} onClose={() => setEditing(null)} /> : null}
      {reading && meter ? (
        <ReadDialog
          meter={meter}
          columns={columns}
          readings={data.readings.filter((row) => row.meterId === meter.id)}
          onClose={() => setReading(false)}
        />
      ) : null}
    </div>
  );
}

function Graphs({
  meter,
  columns,
  rows,
  payments,
  climate,
  postal,
  today,
  run,
}: {
  meter: UtilityMeter;
  columns: UtilColumn[];
  rows: SheetRow[];
  payments: { readingId: string | null; amountCents: number }[];
  climate: Workspace["weather"];
  postal: string;
  today: string;
  run: ReturnType<typeof useBook>["run"];
}) {
  const series = historySeries(columns);
  const preferred =
    series.find((item) => columns.some((column) => column.key === item.key && column.rollup === "usage"))?.key ??
    series.find((item) => columns.some((column) => column.key === item.key && column.rollup === "bill"))?.key ??
    series[0]?.key ??
    "";
  const [picked, setPicked] = useState("");
  const [pending, setPending] = useState(false);
  const [tried, setTried] = useState(false);
  const asked = useRef("");
  const key = series.some((item) => item.key === picked) ? picked : preferred;
  const chosen = series.find((item) => item.key === key);
  const year = Number(rows[rows.length - 1]?.date.slice(0, 4)) || new Date().getFullYear();
  const points = historyYear(
    rows,
    columns,
    key,
    year,
    payments.flatMap((payment) => (payment.readingId ? [{ readingId: payment.readingId, amountCents: payment.amountCents }] : [])),
  );
  const chart = points.map((point, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return { ...point, temp: climate.find((row) => row.postal === zip && row.month === month)?.avgF ?? null };
  });
  const hasTemp = chart.some((point) => point.temp != null);
  const zip = postal.replace(/\D/g, "").slice(0, 5);
  const zipOk = /^\d{5}$/.test(zip);
  useEffect(() => {
    if (!zipOk) return;
    const cap = today.slice(0, 7);
    const months: string[] = [];
    for (const y of [year - 1, year]) {
      for (let m = 1; m <= 12; m++) {
        const month = `${y}-${String(m).padStart(2, "0")}`;
        if (month <= cap) months.push(month);
      }
    }
    const have = new Set(climate.map((row) => row.month));
    const missing = months.filter((month) => !have.has(month));
    if (!missing.length) return;
    const token = `${zip}:${missing.join(",")}`;
    if (asked.current === token) return;
    asked.current = token;
    setTried(true);
    setPending(true);
    void run({ type: "weather.ensure", meterId: meter.id, months: missing }).finally(() => setPending(false));
  }, [climate, meter.id, run, today, year, zip, zipOk]);
  const gaps = points.filter((point) => point.lineGap).map((point) => point.label);
  const usageKey = columns.find((column) => column.rollup === "usage")?.key;
  const latest = [...rows].reverse().find((row) => usageKey && row.computed[usageKey] != null);
  const used = latest && usageKey ? latest.computed[usageKey]! : null;
  const tier = used != null && meter.tiers.length ? tierChargeCents(used, meter.tiers) : null;
  if (!chosen) return <Card><p className="text-muted">Nothing to chart yet.</p></Card>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{year} against {year - 1}</p>
          <select className={fieldClass + " max-w-[14rem]"} value={key} onChange={(e) => setPicked(e.target.value)}>
            {series.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        {tier != null && used != null ? <p className="mb-2 text-sm">Latest tier energy on {Math.round(used)} {meter.unit}: {money(tier)}</p> : null}
        {!zipOk ? <p className="mb-2 text-sm text-muted">Edit this meter and add its US ZIP to plot each month’s average temperature.</p> : null}
        {zipOk && pending ? <p className="mb-2 text-sm text-muted">Looking up average temperatures…</p> : null}
        {zipOk && tried && !pending && !hasTemp ? <p className="mb-2 text-sm text-muted">No temperature is stored for these months yet.</p> : null}
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={chart}>
              <CartesianGrid stroke={RULE} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} />
              <YAxis yAxisId="use" tick={axisTick} />
              {hasTemp ? <YAxis yAxisId="temp" orientation="right" tick={axisTick} width={40} unit="°" /> : null}
              <Tooltip />
              <Legend />
              <Bar yAxisId="use" dataKey="lastYear" name={String(year - 1)} fill={MUTED} />
              <Line yAxisId="use" dataKey="thisYear" name={String(year)} stroke="#c4841d" strokeWidth={2} dot={false} />
              {hasTemp ? <Line yAxisId="temp" dataKey="temp" name="Avg °F" stroke="#2c6e8a" strokeWidth={2} dot={false} /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <p className="mb-2 text-sm text-muted">Paid against the statement</p>
        {gaps.length ? <p className="mb-2 text-sm text-clay">{gaps.join(", ")} line items don't match the statement.</p> : <p className="mb-2 text-sm text-muted">A month with no paid bar is not paid yet.</p>}
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={points}>
              <CartesianGrid stroke={RULE} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} />
              <YAxis tick={axisTick} />
              <Tooltip />
              <Legend />
              <Bar dataKey="statement" name="Statement" fill={MUTED} />
              <Bar dataKey="paid" name="Paid" fill="#c4841d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function Workbook({
  meter,
  columns,
  rows,
  readings,
  payments,
  bills,
  focus,
  canEdit,
  onCell,
  onDate,
}: {
  meter: UtilityMeter;
  columns: UtilityColumn[];
  rows: SheetRow[];
  readings: UtilityReading[];
  payments: { id: string; billId: string; readingId: string | null; amountCents: number; paidOn: string }[];
  bills: { id: string; name: string }[];
  focus: string;
  canEdit: boolean;
  onCell: (id: string, cells: Record<string, number | null>) => void;
  onDate: (id: string, readOn: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const engine = useMemo(() => columns.map(engineColumn), [columns]);
  const shown = useMemo(() => [...rows].reverse(), [rows]);
  const metered = hasMeter(columns, meter.unit);
  const readingById = useMemo(() => new Map(readings.map((reading) => [reading.id, reading])), [readings]);
  const payByReading = useMemo(() => {
    const map = new Map<string, (typeof payments)[number]>();
    for (const payment of payments) if (payment.readingId) map.set(payment.readingId, payment);
    return map;
  }, [payments]);
  const billById = useMemo(() => new Map(bills.map((bill) => [bill.id, bill])), [bills]);
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-muted">
            {columns.map((c, index) => <th key={c.id} className={`px-2 py-2 font-medium ${pinCell(index === 0, true)}`}>{c.label}</th>)}
            <th className={`px-2 py-2 font-medium ${pinCell(false, true)}`}>Paid</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const reading = readingById.get(row.id);
            const pay = payByReading.get(row.id);
            const bill = pay ? billById.get(pay.billId) : undefined;
            const compare = chargeCompare(row, engine);
            return (
              <tr key={row.id} className={row.id === focus ? "bg-honey-soft" : ""}>
                {columns.map((c, index) => {
                  const key = `${row.id}:${c.id}`;
                  const openingUsage = Boolean(reading?.opening && c.rollup === "usage");
                  const mount = cellMount(c, { metered, openingUsage, editing: canEdit && editing === key });
                  const text = cellText(row, engineColumn(c));
                  return (
                  <td key={c.id} className={`border-b border-line px-2 py-1 ${pinCell(index === 0, false, row.id === focus)}`}>
                    {mount === "date" ? (
                      <DateCell
                        value={row.date}
                        onDone={() => setEditing(null)}
                        onCommit={(readOn) => onDate(row.id, readOn)}
                      />
                    ) : mount === "input" ? (
                      <Cell
                        value={row.computed[c.key]}
                        onDone={() => setEditing(null)}
                        onCommit={(value) => {
                          const next: Record<string, number | null> = { ...(reading?.cells ?? {}) };
                          const moneyCell = c.kind === "money" || c.rollup === "bill" || c.rollup === "charges" || c.unit === "$";
                          if (value == null) next[c.key] = null;
                          else next[c.key] = moneyCell ? Math.round(value * 100) / 100 : value;
                          onCell(row.id, next);
                        }}
                      />
                    ) : canEdit && cellMount(c, { metered, openingUsage, editing: true }) !== "static" ? (
                      <button
                        type="button"
                        className="w-28 rounded border border-transparent bg-transparent px-1 py-1 text-left hover:border-line"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setEditing(key)}
                      >
                        {text}
                      </button>
                    ) : (
                      <span className={c.kind === "calculated" || (metered && c.rollup === "days") ? "text-muted" : ""} title={row.errors[c.key] || (c.kind === "calculated" ? c.formula : "")}>{text}</span>
                    )}
                  </td>
                  );
                })}
                <td className="border-b border-line px-2 py-1 text-xs text-muted">
                  {pay && bill ? (
                    <a className="text-honey hover:underline" href={`/bills?bill=${bill.id}`}>
                      Paid {money(pay.amountCents)} on {prettyDate(pay.paidOn)}
                      {compare.statementCents != null && pay.amountCents !== compare.statementCents ? ` · statement ${money(compare.statementCents)}` : ""}
                    </a>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {meter.tiers.length ? <p className="shrink-0 px-4 py-3 text-xs text-muted">Rate tiers fill the lowest ceiling first. {meter.tiers.map((t) => `${t.upTo == null ? "rest" : `first ${t.upTo}`} @ ${(t.rateCents / 100).toFixed(3)}`).join(", ")}.</p> : null}
    </Card>
  );
}

function DateCell({ value, onCommit, onDone }: { value: string; onCommit: (value: string) => void; onDone: () => void }) {
  const skip = useRef(false);
  return (
    <input
      type="date"
      autoFocus
      defaultValue={value}
      className="w-36 rounded border border-transparent bg-transparent px-1 py-1 hover:border-line focus:border-honey focus:outline-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          skip.current = true;
          e.currentTarget.blur();
        } else if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const next = e.currentTarget.value;
        const year = Number(next.slice(0, 4));
        if (!skip.current && /^\d{4}-\d{2}-\d{2}$/.test(next) && year >= 1000 && next !== value) onCommit(next);
        onDone();
      }}
    />
  );
}

function Cell({ value, onCommit, onDone }: { value: number | undefined; onCommit: (value: number | null) => void; onDone: () => void }) {
  const skip = useRef(false);
  const picked = useRef(false);
  const fresh = useRef(true);
  const shown = value == null ? null : Math.round(value * 1000) / 1000;
  function commit(raw: string) {
    if (skip.current) {
      onDone();
      return;
    }
    const parsed = parseUtilityNumber(raw);
    if ("blank" in parsed) {
      if (shown != null) onCommit(null);
    } else if ("value" in parsed && parsed.value !== shown) onCommit(parsed.value);
    onDone();
  }
  return (
    <input
      autoFocus
      ref={(node) => {
        if (!node || picked.current) return;
        picked.current = true;
        node.focus();
        node.select();
      }}
      inputMode="decimal"
      className="w-28 rounded border border-transparent bg-transparent px-1 py-1 hover:border-line focus:border-honey focus:outline-none"
      defaultValue={shown == null ? "" : String(shown)}
      onFocus={(e) => e.currentTarget.select()}
      onPaste={(e) => {
        if (!fresh.current) return;
        fresh.current = false;
        e.preventDefault();
        e.currentTarget.value = e.clipboardData.getData("text");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        if (e.key === "Escape") {
          skip.current = true;
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        if (e.metaKey || e.ctrlKey || e.altKey || !fresh.current) return;
        if (e.key === "Backspace" || e.key === "Delete") {
          fresh.current = false;
          e.preventDefault();
          e.currentTarget.value = "";
          return;
        }
        if (e.key.length === 1) {
          fresh.current = false;
          e.preventDefault();
          e.currentTarget.value = e.key;
        }
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  );
}

function ColumnsTab({
  meter,
  columns,
  readings,
  rows,
  canEdit,
  run,
}: {
  meter: UtilityMeter;
  columns: UtilityColumn[];
  readings: UtilityReading[];
  rows: SheetRow[];
  canEdit: boolean;
  run: ReturnType<typeof useBook>["run"];
}) {
  const [editing, setEditing] = useState<UtilityColumn | "new" | null>(null);
  const [tiers, setTiers] = useState(meter.tiers.map((t) => `${t.upTo ?? ""} ${t.rateCents}`).join("\n"));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const metered = hasMeter(columns, meter.unit);
  const shift = (index: number, direction: -1 | 1) => {
    const ids = columns.map((col) => col.id);
    const swap = index + direction;
    if (swap < 0 || swap >= ids.length) return;
    const moved = ids[index]!;
    ids[index] = ids[swap]!;
    ids[swap] = moved;
    void run({ type: "column.order", meterId: meter.id, ids });
  };
  const exportFields = () => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const payload = {
      meter: { name: meter.name, unit: meter.unit },
      columns: columns.map((column) => ({
        key: column.key,
        label: column.label,
        kind: column.kind,
        unit: column.unit,
        rollup: column.rollup,
        formula: column.formula,
      })),
      readings: readings.map((reading) => ({
        readOn: reading.readOn,
        meter: reading.meter,
        amountCents: reading.amountCents,
        cells: reading.cells,
        computed: byId.get(reading.id)?.computed ?? {},
      })),
    };
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meter.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "meter"}-fields.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Columns</p>
            <p className="text-xs text-muted">Drag a row to reorder it, or use Up and Down. Select a column to rename it, change its kind, or edit the formula. Calculated cells are not stored.</p>
          </div>
          <div className="flex gap-2">
            <Button tone="quiet" onClick={exportFields}>Export fields</Button>
            {canEdit ? <Button tone="quiet" onClick={() => setEditing("new")}>Add column</Button> : null}
          </div>
        </div>
        <ul className="space-y-2">
          {columns.map((c, i) => (
            <li
              key={c.id}
              className={`flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm ${overId === c.id && dragId !== c.id ? "bg-honey-soft" : ""}`}
              onDragOver={(e) => {
                if (!canEdit || !dragId) return;
                e.preventDefault();
                setOverId(c.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragId;
                setDragId(null);
                setOverId(null);
                if (!from || from === c.id) return;
                const ids = columns.map((col) => col.id);
                const at = ids.indexOf(from);
                const to = ids.indexOf(c.id);
                if (at < 0 || to < 0) return;
                ids.splice(at, 1);
                ids.splice(to, 0, from);
                void run({ type: "column.order", meterId: meter.id, ids });
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                {canEdit ? (
                  <span
                    draggable
                    title="Drag to reorder"
                    aria-label={`Drag ${c.label}`}
                    className="inline-flex min-h-11 min-w-11 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.id);
                      setDragId(c.id);
                    }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                ) : null}
                <button type="button" className="min-w-0 text-left" onClick={() => canEdit && setEditing(c)}>
                  <span className="font-medium">{c.label}</span>
                  <span className="mt-0.5 block text-muted">
                    {c.kind}
                    {c.unit ? ` · ${c.unit}` : ""}
                    {c.rollup ? ` · from ${c.rollup}` : ""}
                    {c.fromChildren ? " · sum children" : ""}
                    {c.carryForward ? " · last month" : ""}
                    {c.formula ? ` · ${c.formula}` : ""}
                  </span>
                </button>
              </span>
              {canEdit ? (
                <span className="flex flex-wrap gap-1">
                  <Button tone="quiet" onClick={() => setEditing(c)}>Edit</Button>
                  <Button tone="ghost" disabled={i === 0} onClick={() => shift(i, -1)}>Up</Button>
                  <Button tone="ghost" disabled={i === columns.length - 1} onClick={() => shift(i, 1)}>Down</Button>
                  <Button tone="danger" onClick={() => run({ type: "column.delete", id: c.id })}>Remove</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {editing ? (
          <ColumnDialog
            key={editing === "new" ? "new" : editing.id}
            meterId={meter.id}
            column={editing === "new" ? undefined : editing}
            columns={columns}
            metered={metered}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </Card>
      <Card>
        <p className="mb-2 font-medium">Rate tiers</p>
        <p className="mb-2 text-xs text-muted">One tier a line: ceiling, then cents per unit. Blank ceiling is the rest. 400 12.4 then 18.6.</p>
        <textarea className={fieldClass + " min-h-28 font-mono"} value={tiers} onChange={(e) => setTiers(e.target.value)} />
        {canEdit ? <div className="mt-2"><Button onClick={() => run({ type: "meter.tiers", id: meter.id, tiers: tiersFromText(tiers) })}>Save tiers</Button></div> : null}
      </Card>
    </div>
  );
}

function ColumnDialog({
  meterId,
  column,
  columns,
  metered,
  onClose,
}: {
  meterId: string;
  column?: UtilityColumn;
  columns: UtilityColumn[];
  metered: boolean;
  onClose: () => void;
}) {
  const { run } = useBook();
  const structural = column?.rollup === "meter" || column?.rollup === "usage" || column?.rollup === "bill" || column?.rollup === "days" || column?.rollup === "charges";
  const [label, setLabel] = useState(column?.label ?? "");
  const [kind, setKind] = useState<"number" | "money" | "calculated" | "date">(column?.kind ?? "number");
  const [unit, setUnit] = useState(column?.unit ?? "");
  const [formula, setFormula] = useState(column?.formula ?? "");
  const [fromChildren, setFromChildren] = useState(column?.fromChildren ?? false);
  const [carryForward, setCarryForward] = useState(column?.carryForward ?? false);
  const [afterId, setAfterId] = useState("");
  const [error, setError] = useState("");
  const canCarry = (kind === "number" || kind === "money") && !fromChildren;
  return (
    <Modal open title={column ? "Edit column" : "Add column"} onClose={onClose}>
      <Field label="Label"><input className={fieldClass} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      {column ? <p className="text-xs text-muted">A name already used by another column is rejected. Calculated formulas that mention this column change to the new name.</p> : null}
      {!column ? (
        <Field label="Place after">
          <select className={fieldClass} value={afterId} onChange={(e) => setAfterId(e.target.value)}>
            <option value="__start">At the start</option>
            {columns.map((item) => <option key={item.id} value={item.id}>After {item.label}</option>)}
            <option value="">At the end</option>
          </select>
        </Field>
      ) : null}
      <Field label="Kind">
        <select
          className={fieldClass}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as typeof kind;
            setKind(next);
            if (next === "date" && !label.trim()) setLabel("Meter read date");
          }}
        >
          <option value="number">Number</option>
          <option value="money">Money</option>
          <option value="calculated">Calculated</option>
          {metered && !structural ? <option value="date">Meter read date</option> : null}
        </select>
      </Field>
      {kind === "date" ? (
        <p className="text-xs text-muted">The bill month is the month of this date. Days in the period are the gap back to the previous read, not a number you type.</p>
      ) : (
        <Field label="Unit"><input className={fieldClass} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kWh, $, days" /></Field>
      )}
      {kind === "calculated" ? (
        <Field label="Formula">
          <input className={fieldClass} value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="{usage_kwh} - {generation_kwh}" />
        </Field>
      ) : null}
      {kind === "calculated" ? (
        <p className="text-xs text-muted">Use {"{field}"} or the column’s name, {"{prev.field}"}, days, avg_daily, yoy, avg_same_month, max_same_month, avg, and tier_charge. A calculated column can use another calculated column. A blank number beside one counts as zero.</p>
      ) : null}
      {kind !== "date" ? (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fromChildren} onChange={(e) => setFromChildren(e.target.checked)} /> Sum children</label>
      ) : null}
      {canCarry ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={carryForward} onChange={(e) => setCarryForward(e.target.checked)} />
          Default to last month
        </label>
      ) : null}
      {canCarry ? <p className="text-xs text-muted">A new read starts with this column’s value from the previous read. You can change it before saving.</p> : null}
      {structural ? <p className="text-xs text-muted">The source stays {column?.rollup}. The stored key stays put.</p> : null}
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button onClick={async () => {
        const name = label.trim();
        if (!name) return;
        const taken = duplicateColumnName(columns, name, column?.id);
        if (taken) {
          setError(`${taken.label} is already a column on this meter.`);
          return;
        }
        setError("");
        await run({
          type: "column.save",
          column: {
            id: column?.id,
            meterId,
            label: name,
            kind,
            unit: kind === "date" ? "" : unit.trim(),
            formula: kind === "calculated" ? formula.trim() : "",
            rollup: kind === "date" ? "readDate" : (column?.rollup ?? ""),
            fromChildren: kind === "date" ? false : fromChildren,
            carryForward: canCarry && carryForward,
            ...(column ? {} : { afterId }),
          },
        });
        onClose();
      }}>Save</Button>
    </Modal>
  );
}

function MeterDialog({ meter, parents, onClose }: { meter?: UtilityMeter; parents: UtilityMeter[]; onClose: () => void }) {
  const { run } = useBook();
  const [name, setName] = useState(meter?.name ?? "");
  const [provider, setProvider] = useState(meter?.provider ?? "");
  const [unit, setUnit] = useState(meter?.unit ?? "kWh");
  const [parentId, setParentId] = useState(meter?.parentId ?? "");
  const [postal, setPostal] = useState(meter?.postal ?? "");
  const [template, setTemplate] = useState("electric");
  return (
    <Modal open title={meter ? "Edit meter" : "New meter"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <ContactField label="Provider" kind="utility" value={provider} onChange={setProvider} />
      <Field label="Unit"><input className={fieldClass} value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
      <Field label="ZIP">
        <input className={fieldClass} inputMode="numeric" maxLength={10} value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="94612" />
      </Field>
      <p className="text-xs text-muted">US ZIP for this meter’s location. The year graph uses it for average temperature. Another meter can use a different ZIP.</p>
      <Field label="Parent">
        <select
          className={fieldClass}
          value={parentId}
          onChange={(e) => {
            const next = e.target.value;
            setParentId(next);
            if (!meter && !postal.trim()) {
              const parent = parents.find((item) => item.id === next);
              if (parent?.postal) setPostal(parent.postal);
            }
          }}
        >
          <option value="">None</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      {!meter ? (
        <Field label="Template">
          <select className={fieldClass} value={template} onChange={(e) => { setTemplate(e.target.value); setUnit(templateUnit(e.target.value)); }}>
            {UTILITY_TEMPLATES.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        </Field>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={async () => {
          if (!name.trim()) return;
          await run({ type: "meter.save", meter: { id: meter?.id, name, provider, unit, postal, parentId: parentId || null }, template: meter ? undefined : template });
          onClose();
        }}>Save</Button>
        {meter ? <Button tone="danger" onClick={async () => { await run({ type: "meter.delete", id: meter.id }); onClose(); }}>Delete</Button> : null}
      </div>
    </Modal>
  );
}

function formatCarry(column: UtilityColumn, value: number) {
  if (column.kind === "money" || column.rollup === "bill" || column.rollup === "charges") return (Math.round(value * 100) / 100).toFixed(2);
  return String(Math.round(value * 1000) / 1000);
}

function ReadDialog({ meter, columns, readings, onClose }: { meter: UtilityMeter; columns: UtilityColumn[]; readings: UtilityReading[]; onClose: () => void }) {
  const { data, run } = useBook();
  const [readOn, setReadOn] = useState(data?.today ?? "");
  const [opening, setOpening] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const entry = importTargets(columns);
  const meterColumn = entry.find((column) => column.rollup === "meter");
  const billColumn = entry.find((column) => column.rollup === "bill");
  const extras = entry.filter((column) => column.carryForward && column.rollup !== "meter" && column.rollup !== "bill");
  const prior = priorRead(readings, readOn);

  function fieldValue(column: UtilityColumn | undefined, key: string) {
    if (touched[key]) return values[key] ?? "";
    if (!column?.carryForward || !prior) return "";
    const value = carriedValue(column, prior);
    return value == null ? "" : formatCarry(column, value);
  }

  function edit(key: string, value: string) {
    setTouched((current) => ({ ...current, [key]: true }));
    setValues((current) => ({ ...current, [key]: value }));
  }

  const meterText = fieldValue(meterColumn, meterColumn?.key ?? "meter");
  const billText = fieldValue(billColumn, billColumn?.key ?? "bill");
  const copied = Boolean(prior && (meterColumn?.carryForward || billColumn?.carryForward || extras.length));

  return (
    <Modal open title={`Read ${meter.name}`} onClose={onClose}>
      <Field label="Read date"><input type="date" className={fieldClass} value={readOn} onChange={(e) => setReadOn(e.target.value)} /></Field>
      <Field label={meterColumn ? meterColumn.label : `Meter (${meter.unit})`}>
        <input className={fieldClass} value={meterText} onChange={(e) => edit(meterColumn?.key ?? "meter", e.target.value)} />
      </Field>
      <Field label={billColumn?.label ?? "Statement"}>
        <input className={fieldClass} value={billText} onChange={(e) => edit(billColumn?.key ?? "bill", e.target.value)} />
      </Field>
      {extras.map((column) => (
        <Field key={column.id} label={column.label}>
          <input className={fieldClass} value={fieldValue(column, column.key)} onChange={(e) => edit(column.key, e.target.value)} />
        </Field>
      ))}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} /> Opening read, no usage</label>
      <p className="text-xs text-muted">Bill month is {readOn.slice(0, 7) || "—"}. The month before is {readOn ? previousMonth(readOn) : "—"}.</p>
      {copied && prior ? <p className="text-xs text-muted">Columns set to last month start from the {prettyDate(prior.readOn)} read. Change any of them before saving.</p> : null}
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button onClick={async () => {
        const cells: Record<string, number> = {};
        const taken: { column?: UtilityColumn; key: string; text: string; rollup: string }[] = [
          { column: meterColumn, key: meterColumn?.key ?? "meter", text: meterText, rollup: "meter" },
          { column: billColumn, key: billColumn?.key ?? "bill", text: billText, rollup: "bill" },
          ...extras.map((column) => ({ column, key: column.key, text: fieldValue(column, column.key), rollup: column.rollup })),
        ];
        let meterValue: number | null = null;
        let amountCents = 0;
        for (const field of taken) {
          const text = field.text.trim();
          if (!text) continue;
          const value = Number(text);
          if (!Number.isFinite(value)) {
            setError("Enter numbers only.");
            return;
          }
          if (field.column) cells[field.column.key] = value;
          if (field.rollup === "meter") meterValue = value;
          if (field.rollup === "bill") amountCents = Math.round(value * 100);
        }
        await run({
          type: "reading.save",
          reading: { meterId: meter.id, readOn, meter: meterValue, amountCents, opening, cells },
        });
        onClose();
      }}>Save read</Button>
    </Modal>
  );
}
