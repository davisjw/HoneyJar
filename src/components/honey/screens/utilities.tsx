import { useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MUTED, RULE, axisTick } from "../charts";
import { money, prettyDate } from "@/lib/honey/calc";
import type { UtilityColumn, UtilityMeter, UtilityReading } from "@/lib/honey/types";
import {
  UTILITY_TEMPLATES,
  buildSheet,
  chargeCompare,
  cellMount,
  historySeries,
  historyYear,
  previousMonth,
  templateUnit,
  hasMeter,
  tierChargeCents,
  type ReadLike,
  type SheetRow,
  type UtilColumn,
} from "@/lib/honey/utility";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass, pinCell } from "../kit";

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
  if (row.errors[column.key]) return "—";
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
          </div>
          {tab === "graphs" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <Graphs
                meter={meter}
                columns={columns.map(engineColumn)}
                rows={rows}
                payments={data.payments}
              />
            </div>
          ) : null}
          {tab === "workbook" ? (
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
          {tab === "columns" ? <div className="min-h-0 flex-1 overflow-auto"><ColumnsTab meter={meter} columns={columns} canEdit={canEdit} run={run} /></div> : null}
        </>
      ) : (
        <Card><p className="text-muted">No meters in this jar yet.</p></Card>
      )}
      {adding ? <MeterDialog parents={roots} onClose={() => setAdding(false)} /> : null}
      {editing ? <MeterDialog meter={editing} parents={data.meters.filter((m) => !m.parentId && m.id !== editing.id)} onClose={() => setEditing(null)} /> : null}
      {reading && meter ? <ReadDialog meter={meter} onClose={() => setReading(false)} /> : null}
    </div>
  );
}

function Graphs({
  meter,
  columns,
  rows,
  payments,
}: {
  meter: UtilityMeter;
  columns: UtilColumn[];
  rows: SheetRow[];
  payments: { readingId: string | null; amountCents: number }[];
}) {
  const series = historySeries(columns);
  const preferred =
    series.find((item) => columns.some((column) => column.key === item.key && column.rollup === "usage"))?.key ??
    series.find((item) => columns.some((column) => column.key === item.key && column.rollup === "bill"))?.key ??
    series[0]?.key ??
    "";
  const [picked, setPicked] = useState("");
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
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={points}>
              <CartesianGrid stroke={RULE} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} />
              <YAxis tick={axisTick} />
              <Tooltip />
              <Legend />
              <Bar dataKey="lastYear" name={String(year - 1)} fill={MUTED} />
              <Line dataKey="thisYear" name={String(year)} stroke="#c4841d" strokeWidth={2} dot={false} />
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
  onCell: (id: string, cells: Record<string, number>) => void;
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
                      <input
                        type="date"
                        autoFocus
                        className="w-36 rounded border border-transparent bg-transparent px-1 py-1 hover:border-line focus:border-honey focus:outline-none"
                        value={row.date}
                        onChange={(e) => {
                          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value !== row.date) onDate(row.id, e.target.value);
                        }}
                        onBlur={() => setEditing(null)}
                      />
                    ) : mount === "input" ? (
                      <Cell
                        value={row.computed[c.key]}
                        onDone={() => setEditing(null)}
                        onCommit={(value) => {
                          const next = { ...row.entered };
                          if (value == null) delete next[c.key];
                          else next[c.key] = value;
                          onCell(row.id, next);
                        }}
                      />
                    ) : canEdit && cellMount(c, { metered, openingUsage, editing: true }) !== "static" ? (
                      <button
                        type="button"
                        className="w-28 rounded border border-transparent bg-transparent px-1 py-1 text-left hover:border-line"
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

function Cell({ value, onCommit, onDone }: { value: number | undefined; onCommit: (value: number | null) => void; onDone: () => void }) {
  const shown = value == null ? "" : String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  return (
    <input
      autoFocus
      inputMode="decimal"
      className="w-24 rounded border border-transparent bg-transparent px-1 py-1 hover:border-line focus:border-honey focus:outline-none"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (!trimmed) {
          if (value != null) onCommit(null);
          onDone();
          return;
        }
        const next = Number(trimmed);
        if (!Number.isFinite(next)) {
          onDone();
          return;
        }
        if (next !== value) onCommit(next);
        onDone();
      }}
    />
  );
}

function ColumnsTab({
  meter,
  columns,
  canEdit,
  run,
}: {
  meter: UtilityMeter;
  columns: UtilityColumn[];
  canEdit: boolean;
  run: ReturnType<typeof useBook>["run"];
}) {
  const [editing, setEditing] = useState<UtilityColumn | "new" | null>(null);
  const [tiers, setTiers] = useState(meter.tiers.map((t) => `${t.upTo ?? ""} ${t.rateCents}`).join("\n"));
  const metered = hasMeter(columns, meter.unit);
  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Columns</p>
            <p className="text-xs text-muted">Select a column to rename it, change its kind, or edit the formula. Calculated cells are not stored.</p>
          </div>
          {canEdit ? <Button tone="quiet" onClick={() => setEditing("new")}>Add column</Button> : null}
        </div>
        <ul className="space-y-2">
          {columns.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
              <button type="button" className="min-w-0 text-left" onClick={() => canEdit && setEditing(c)}>
                <span className="font-medium">{c.label}</span>
                <span className="mt-0.5 block text-muted">
                  {c.kind}
                  {c.unit ? ` · ${c.unit}` : ""}
                  {c.rollup ? ` · from ${c.rollup}` : ""}
                  {c.fromChildren ? " · sum children" : ""}
                  {c.formula ? ` · ${c.formula}` : ""}
                </span>
              </button>
              {canEdit ? (
                <span className="flex flex-wrap gap-1">
                  <Button tone="quiet" onClick={() => setEditing(c)}>Edit</Button>
                  <Button tone="ghost" disabled={i === 0} onClick={() => run({ type: "column.move", id: c.id, direction: "up" })}>Up</Button>
                  <Button tone="ghost" disabled={i === columns.length - 1} onClick={() => run({ type: "column.move", id: c.id, direction: "down" })}>Down</Button>
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
  metered,
  onClose,
}: {
  meterId: string;
  column?: UtilityColumn;
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
  return (
    <Modal open title={column ? "Edit column" : "Add column"} onClose={onClose}>
      <Field label="Label"><input className={fieldClass} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
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
        <p className="text-xs text-muted">Use {"{field}"}, {"{prev.field}"}, days, avg_daily, yoy, avg_same_month, max_same_month, avg, and tier_charge. A bad formula shows an em dash.</p>
      ) : null}
      {kind !== "date" ? (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fromChildren} onChange={(e) => setFromChildren(e.target.checked)} /> Sum children</label>
      ) : null}
      {structural ? <p className="text-xs text-muted">The source stays {column?.rollup}. The key stays put so formulas that mention it keep working.</p> : null}
      <Button onClick={async () => {
        if (!label.trim()) return;
        await run({
          type: "column.save",
          column: {
            id: column?.id,
            meterId,
            label: label.trim(),
            kind,
            unit: kind === "date" ? "" : unit.trim(),
            formula: kind === "calculated" ? formula.trim() : "",
            rollup: kind === "date" ? "readDate" : (column?.rollup ?? ""),
            fromChildren: kind === "date" ? false : fromChildren,
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
  const [template, setTemplate] = useState("electric");
  return (
    <Modal open title={meter ? "Edit meter" : "New meter"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Provider"><input className={fieldClass} value={provider} onChange={(e) => setProvider(e.target.value)} /></Field>
      <Field label="Unit"><input className={fieldClass} value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
      <Field label="Parent">
        <select className={fieldClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
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
          await run({ type: "meter.save", meter: { id: meter?.id, name, provider, unit, parentId: parentId || null }, template: meter ? undefined : template });
          onClose();
        }}>Save</Button>
        {meter ? <Button tone="danger" onClick={async () => { await run({ type: "meter.delete", id: meter.id }); onClose(); }}>Delete</Button> : null}
      </div>
    </Modal>
  );
}

function ReadDialog({ meter, onClose }: { meter: UtilityMeter; onClose: () => void }) {
  const { data, run } = useBook();
  const [readOn, setReadOn] = useState(data?.today ?? "");
  const [meterValue, setMeterValue] = useState("");
  const [amount, setAmount] = useState("");
  const [opening, setOpening] = useState(false);
  return (
    <Modal open title={`Read ${meter.name}`} onClose={onClose}>
      <Field label="Read date"><input type="date" className={fieldClass} value={readOn} onChange={(e) => setReadOn(e.target.value)} /></Field>
      <Field label={`Meter (${meter.unit})`}><input className={fieldClass} value={meterValue} onChange={(e) => setMeterValue(e.target.value)} /></Field>
      <Field label="Statement"><input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} /> Opening read, no usage</label>
      <p className="text-xs text-muted">Bill month is {readOn.slice(0, 7) || "—"}. The month before is {readOn ? previousMonth(readOn) : "—"}.</p>
      <Button onClick={async () => {
        await run({
          type: "reading.save",
          reading: {
            meterId: meter.id,
            readOn,
            meter: meterValue.trim() === "" ? null : Number(meterValue),
            amountCents: Math.round(Number(amount || "0") * 100),
            opening,
          },
        });
        onClose();
      }}>Save read</Button>
    </Modal>
  );
}
