import { prettyDate } from "@/lib/honey/calc";

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
