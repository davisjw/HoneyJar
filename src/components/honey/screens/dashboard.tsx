import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { CashTip, RULE, SliceTip, axisTick } from "../charts";
import {
  CHART_COLORS,
  allTags,
  evaluateAlerts,
  matchTxnFilters,
  money,
  monthLabel,
  netWorthParts,
  periodOf,
  periodStart,
  personFlow,
  planModel,
  prettyDate,
  projectCash,
  spendingByCategory,
  topMerchants,
} from "@/lib/honey/calc";
import { useBook } from "../book";
import { Card, MoneyText } from "../kit";

export function Dashboard() {
  const { data, run } = useBook();
  const [personId, setPersonId] = useState("");
  const [tag, setTag] = useState("");
  if (!data) return null;
  const month = periodOf(data.today, data.profile.monthStartDay);
  const from = periodStart(month, data.profile.monthStartDay);
  const scoped = data.transactions.filter((t) => matchTxnFilters(t, { personId, tag }));
  const spendAll = spendingByCategory(data.transactions, data.categories, from, data.today);
  const incomeAll = spendingByCategory(data.transactions, data.categories, from, data.today, "in");
  const spend = spendingByCategory(scoped, data.categories, from, data.today, "out", data.people);
  const pieTotal = spend.reduce((s, row) => s + row.cents, 0);
  const pie = spend.map((row) => ({ ...row, total: pieTotal, who: personId ? "" : row.who }));
  const incomeTotal = incomeAll.reduce((s, r) => s + r.cents, 0);
  const spendTotal = spendAll.reduce((s, r) => s + r.cents, 0);
  const plan = planModel(data.categories, data.transactions, data.plan, month, data.profile.monthStartDay);
  const nw = netWorthParts(data.accounts, data.assets);
  const alerts = evaluateAlerts({
    today: data.today,
    startDay: data.profile.monthStartDay,
    accounts: data.accounts,
    categories: data.categories,
    txns: data.transactions,
    bills: data.bills,
    goals: data.goals,
    watches: data.watches,
    reminders: data.reminders,
    scores: data.scores,
    planRows: plan.rows,
  }).filter((a) => !data.readAlerts.includes(a.key));
  const cash = projectCash({
    today: data.today,
    days: 120,
    accounts: data.accounts,
    bills: data.bills,
    categories: data.categories,
    startDay: data.profile.monthStartDay,
  });
  const cashBands = [...cash.accounts].sort((a, b) => (cash.points[0]?.byAccount[b.id] ?? 0) - (cash.points[0]?.byAccount[a.id] ?? 0));
  const merchants = topMerchants(data.transactions, from, data.today);
  const upcoming = data.bills
    .filter((b) => b.status === "active")
    .slice()
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 5);
  const recent = data.transactions.slice(0, 6);
  const cur = data.profile.currency;
  const byPerson = personFlow(
    tag ? data.transactions.filter((t) => matchTxnFilters(t, { tag })) : data.transactions,
    data.people.filter((p) => !p.archived),
    from,
    data.today,
  );
  const tags = allTags(data.transactions);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{data.profile.displayName}</p>
          <h1 className="font-display text-4xl">{monthLabel(month)}</h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">Left in the plan</p>
          <p className="font-display text-4xl num">
            <MoneyText cents={plan.leftInPlan} currency={cur} />
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Spent" value={money(spendTotal, cur)} href="/transactions" />
        <Stat label="Income" value={money(incomeTotal, cur)} href="/reports" />
        <Stat label="Net worth" value={money(nw.net, cur)} href="/networth" />
        <Stat label="Lowest cash, 120 days" value={money(cash.low.balance, cur)} href="/cashflow" />
      </div>
      {byPerson.length ? (
        <Card>
          <h2 className="font-display text-xl">By person</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {byPerson.map((row) => (
              <li key={row.id || "household"} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <a href={row.id ? `/transactions?person=${row.id}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}` : `/transactions?person=household${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`}>
                  <span className="font-medium">{row.name}</span>
                </a>
                <span className="text-muted">
                  spent <span className="num text-ink">{money(row.spending, cur)}</span>
                  {" · "}
                  in <span className="num text-ink">{money(row.income, cur)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl">Where it went</h2>
            <div className="flex flex-wrap gap-2">
              <select className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Everyone</option>
                <option value="household">Household</option>
                {data.people.filter((p) => !p.archived).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Any tag</option>
                {tags.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          </div>
          {spend.length ? (
            <div className="grid items-center gap-2 sm:grid-cols-2">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="cents" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={1} stroke="#fffdf8" strokeWidth={2}>
                      {pie.map((s, i) => (
                        <Cell key={s.id} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={(props) => <SliceTip active={props.active} payload={props.payload} currency={cur} noun="spending this month" />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 text-sm">
                {spend.slice(0, 6).map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <a href={`/transactions?category=${s.id}${personId ? `&person=${encodeURIComponent(personId)}` : ""}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      {s.name}
                    </a>
                    <span className="num">{money(s.cents, cur)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">{personId || tag ? "Nothing in this slice." : "No spending in this period yet."}</p>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="font-display text-xl">Needs a look</h2>
          <ul className="mt-3 space-y-2">
            {alerts.length === 0 ? <li className="text-sm text-muted">Nothing is ringing. Watchlists live on their own page.</li> : null}
            {alerts.slice(0, 5).map((a) => (
              <li key={a.key} className="rounded-xl bg-paper px-3 py-2">
                <a href={a.href} className="block text-sm font-medium">{a.title}</a>
                <p className="text-xs text-muted">{a.body}</p>
                <button type="button" className="mt-1 text-xs text-honey-deep" onClick={() => run({ type: "alert.read", key: a.key })}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl">Cash ahead</h2>
          <Link to="/cashflow" className="text-sm text-honey-deep">Full year</Link>
        </div>
        <p className="mb-2 text-xs text-muted">Each band is an account. A bill comes out of the account it is paid from.</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cash.points.filter((p, i) => i % 3 === 0 || p.events.length > 0 || i === cash.points.length - 1).map((p) => ({ date: p.date, events: p.events, ...p.byAccount }))}>
              <CartesianGrid vertical={false} stroke={RULE} />
              <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} minTickGap={28} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip content={(props) => <CashTip active={props.active} payload={props.payload} currency={cur} />} cursor={{ stroke: "#1c1612", strokeWidth: 1 }} />
              {cashBands.map((account, i) => (
                <Area
                  key={account.id}
                  type="linear"
                  dataKey={account.id}
                  name={account.name}
                  stackId="cash"
                  stroke="none"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {cashBands.map((account, i) => (
            <li key={account.id}><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{account.name}</li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl">Coming up</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {upcoming.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <a href={`/bills?bill=${b.id}`}>
                  <span className="block font-medium">{b.name}</span>
                  <span className="text-muted">{prettyDate(b.nextDue)} · {b.kind}</span>
                </a>
                <span className={b.direction === "in" ? "num text-sage" : "num"}>{b.direction === "in" ? "+" : "−"}{money(b.amountCents, cur)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-xl">Recent</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <a href={`/transactions?txn=${t.id}`}>
                  <span className="block font-medium">{t.merchant}</span>
                  <span className="text-muted">{prettyDate(t.postedOn)}</span>
                </a>
                <MoneyText cents={t.amountCents} currency={cur} signed />
              </li>
            ))}
          </ul>
          {merchants[0] ? <p className="mt-3 text-xs text-muted">Top merchant: {merchants[0].name}</p> : null}
        </Card>
      </div>
      <Card>
        <h2 className="font-display text-xl">Business</h2>
        <p className="mt-1 text-sm text-muted">The household and the business are separate books. Profit and loss, Schedule C, and owner draws are on their own page. Invoices and mileage are still later.</p>
        <Link to="/business" className="mt-2 inline-block text-sm text-honey-deep">Open Business</Link>
      </Card>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <a href={href} className="rounded-2xl border border-line bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl num">{value}</p>
    </a>
  );
}
