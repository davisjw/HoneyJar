import type { ReactNode } from "react";
import { money, prettyDate, signedMoney } from "@/lib/honey/calc";

export const INK = "#1c1612";
export const MUTED = "#6f6458";
export const RULE = "#e6dfd2";

export const axisTick = { fill: MUTED, fontSize: 11 };

export function shortMoney(cents: number) {
  const n = cents / 100;
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function ChartTip({
  active,
  label,
  payload,
  format,
  total,
}: {
  active?: boolean;
  label?: unknown;
  payload?: unknown;
  format?: (n: number) => string;
  total?: boolean;
}) {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const rows = payload.flatMap((row) => {
    const item = row as { name?: unknown; value?: unknown; color?: string; dataKey?: unknown };
    if (item.dataKey === "net" || item.value == null || item.value === "") return [];
    const value = Number(item.value);
    if (!Number.isFinite(value)) return [];
    return [{ key: String(item.dataKey ?? item.name), name: String(item.name ?? item.dataKey ?? ""), value, color: item.color }];
  });
  if (!rows.length) return null;
  const text = format ?? ((n: number) => String(n));
  const sum = rows.reduce((s, row) => s + row.value, 0);
  const raw = String(label ?? "");
  const title = /^\d{4}-\d{2}-\d{2}/.test(raw) ? prettyDate(raw.slice(0, 10)) : raw;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-sm shadow-sm">
      {title ? <p className="text-xs text-muted">{title}</p> : null}
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              {row.color ? <i className="inline-block h-2 w-2 rounded-sm" style={{ background: row.color }} /> : null}
              {row.name}
            </span>
            <span className="num">{text(row.value)}</span>
          </li>
        ))}
      </ul>
      {total && rows.length > 1 ? (
        <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1">
          <span>Total</span>
          <span className="num font-medium">{text(sum)}</span>
        </p>
      ) : null}
    </div>
  );
}

function pointOf(payload: unknown): Record<string, unknown> | null {
  if (!Array.isArray(payload) || !payload.length) return null;
  const row = payload[0] as { payload?: Record<string, unknown> };
  return row.payload ?? null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function TipCard({ title, amount, children }: { title: string; amount?: string; children: ReactNode }) {
  return (
    <div className="w-64 rounded-xl border border-line bg-card px-3 py-2 text-sm shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-base text-ink">{title}</p>
        {amount ? <p className="num font-display text-base">{amount}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function WorthTip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: unknown;
  currency?: string;
}) {
  if (!active) return null;
  const point = pointOf(payload);
  if (!point) return null;
  const property = num(point.property);
  const investments = num(point.investments);
  const cash = num(point.cash);
  const net = property + investments + cash;
  const parts = [
    { name: "Property", value: property, color: "#c4a894" },
    { name: "Investments", value: investments, color: "#e2c98a" },
    { name: "Cash", value: cash, color: "#8eae98" },
  ];
  const span = parts.reduce((s, part) => s + Math.max(0, part.value), 0);
  const raw = String(point.date ?? "");
  return (
    <TipCard title={/^\d{4}-\d{2}-\d{2}/.test(raw) ? prettyDate(raw) : raw} amount={money(net, currency)}>
      {span > 0 ? (
        <div className="mt-2 flex h-2 overflow-hidden rounded-full">
          {parts.map((part) =>
            part.value > 0 ? <i key={part.name} style={{ width: `${(part.value / span) * 100}%`, background: part.color }} /> : null,
          )}
        </div>
      ) : null}
      <ul className="mt-2 space-y-0.5">
        {parts.map((part) => (
          <li key={part.name} className="flex justify-between gap-3">
            <span>{part.name}</span>
            <span className="num">
              {money(part.value, currency)}
              {span > 0 ? `  ${Math.round((Math.max(0, part.value) / span) * 100)}%` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {money(num(point.liquid), currency)} in the bank − {money(num(point.cards), currency)} on cards
        {num(point.otherDebt) ? ` − ${money(num(point.otherDebt), currency)} in other loans` : ""}
      </p>
    </TipCard>
  );
}

export function CashTip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: unknown;
  currency?: string;
}) {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const point = pointOf(payload);
  const accounts = payload.flatMap((row) => {
    const item = row as { name?: unknown; value?: unknown; color?: string; dataKey?: unknown };
    if (item.dataKey === "events" || item.dataKey === "balance" || item.value == null) return [];
    const value = Number(item.value);
    if (!Number.isFinite(value)) return [];
    return [{ key: String(item.dataKey ?? item.name), name: String(item.name ?? ""), value, color: item.color }];
  });
  if (!accounts.length) return null;
  const total = accounts.reduce((s, row) => s + row.value, 0);
  const events = Array.isArray(point?.events) ? (point.events as { label?: unknown; cents?: unknown }[]) : [];
  const shown = events.slice(0, 4);
  const raw = String(point?.date ?? "");
  return (
    <TipCard title={/^\d{4}-\d{2}-\d{2}/.test(raw) ? prettyDate(raw) : raw} amount={money(total, currency)}>
      <ul className="mt-2 space-y-0.5">
        {accounts.map((row) => (
          <li key={row.key} className="flex justify-between gap-3">
            <span className="flex items-center gap-1.5">
              {row.color ? <i className="inline-block h-2 w-2 rounded-sm" style={{ background: row.color }} /> : null}
              {row.name}
            </span>
            <span className="num">{money(row.value, currency)}</span>
          </li>
        ))}
      </ul>
      {shown.length ? (
        <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
          {shown.map((event, i) => {
            const cents = num(event.cents);
            return (
              <li key={`${event.label}-${i}`} className="flex justify-between gap-3">
                <span className={cents > 0 ? "text-sage" : undefined}>{String(event.label ?? "")}</span>
                <span className={`num ${cents > 0 ? "text-sage" : ""}`}>{signedMoney(cents, currency)}</span>
              </li>
            );
          })}
          {events.length > shown.length ? <li className="text-xs text-muted">and {events.length - shown.length} more</li> : null}
        </ul>
      ) : null}
    </TipCard>
  );
}

export function SliceTip({
  active,
  payload,
  currency,
  noun,
}: {
  active?: boolean;
  payload?: unknown;
  currency?: string;
  noun: string;
}) {
  if (!active) return null;
  const point = pointOf(payload);
  if (!point) return null;
  const cents = num(point.cents);
  const total = num(point.total);
  const name = String(point.name ?? point.label ?? "");
  const count = num(point.count);
  const who = String(point.who ?? "");
  const share = total > 0 ? Math.max(0, Math.min(1, Math.abs(cents) / total)) : 0;
  return (
    <TipCard title={name} amount={money(cents, currency)}>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
        <i className="block h-full bg-[#c4a06a]" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="mt-2">{total > 0 ? `${Math.round(share * 100)}% of ${noun}` : noun}</p>
      {count ? <p className="text-muted">{count} {count === 1 ? "transaction" : "transactions"}</p> : null}
      {who ? <p className="text-muted">Mostly {who}</p> : null}
    </TipCard>
  );
}
