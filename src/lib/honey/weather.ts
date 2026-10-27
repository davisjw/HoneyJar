/** Mean of the daily temperatures, rounded. Null days are skipped. */
export function monthlyAverageF(days: (number | null | undefined)[]): number | null {
  const values = days.filter((day): day is number => typeof day === "number" && Number.isFinite(day));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, day) => sum + day, 0) / values.length);
}

/** First and last calendar day of YYYY-MM. */
export function monthBounds(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return null;
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** Group daily means into a rounded average per YYYY-MM. Months with no numbers are omitted. */
export function averagesFromDaily(days: { date: string; temp: number | null | undefined }[]): Map<string, number> {
  const groups = new Map<string, (number | null | undefined)[]>();
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue;
    const month = day.date.slice(0, 7);
    const list = groups.get(month) ?? [];
    list.push(day.temp);
    groups.set(month, list);
  }
  const out = new Map<string, number>();
  for (const [month, temps] of groups) {
    const avg = monthlyAverageF(temps);
    if (avg != null) out.set(month, avg);
  }
  return out;
}
