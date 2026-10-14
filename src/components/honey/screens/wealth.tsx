import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  assetEquity,
  centsToInput,
  dollarsToCents,
  estimateTax,
  hitMonth,
  money,
  netWorthParts,
  prettyDate,
  projectBalance,
  utilization,
  zillowHref,
} from "@/lib/honey/calc";
import type { Asset, Goal, Milestone } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass } from "../kit";

function param(search: string, key: string) {
  return new URLSearchParams(search.replace(/^\?/, "")).get(key) ?? "";
}

export function NetWorthPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const focus = param(search, "asset");
  const [editing, setEditing] = useState<Partial<Asset> | null>(null);
  const [estimateFor, setEstimateFor] = useState<Asset | null>(null);
  const [estimate, setEstimate] = useState("");
  if (!data) return null;
  const nw = netWorthParts(data.accounts, data.assets);
  const history = [
    ...data.snapshots.map((s) => ({ date: s.asOf, net: s.assetsCents - s.debtsCents })),
    { date: data.today, net: nw.net },
  ];
  const debts = data.accounts.filter((a) => !a.archived && ["credit", "loan", "mortgage"].includes(a.kind));
  const cur = data.profile.currency;
  return (
    <div>
      <PageIntro
        title="Net worth"
        lede="Homes, cars, cash, and the loans attached to them. Zillow doesn’t offer a public API — open the listing, then save the Zestimate so the history is yours."
        action={canEdit ? <Button onClick={() => setEditing({ kind: "home", valueCents: 0, asOf: data.today })}>Add asset</Button> : null}
      />
      <Card>
        <p className="text-sm text-muted">Today</p>
        <p className="font-display text-4xl num">{money(nw.net, cur)}</p>
        <p className="text-sm text-muted">Assets {money(nw.assets, cur)} · Debts {money(nw.debts, cur)}</p>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(0, 7)} minTickGap={28} />
              <YAxis hide />
              <Tooltip formatter={(v) => money(Number(v), cur)} labelFormatter={(l) => prettyDate(String(l))} />
              <Line dataKey="net" stroke="#8c5a10" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data.assets.map((asset) => {
          const equity = assetEquity(asset, data.accounts);
          const loan = data.accounts.find((a) => a.id === asset.loanAccountId);
          return (
            <Card key={asset.id} className={asset.id === focus ? "ring-2 ring-honey" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{asset.name}</p>
                  <p className="text-sm text-muted">{asset.kind} · {asset.detail}</p>
                </div>
                <p className="num font-display text-xl">{money(asset.valueCents, cur)}</p>
              </div>
              <p className="mt-2 text-sm">Equity {money(equity, cur)}{loan ? ` after ${loan.name}` : ""}</p>
              {asset.zestimateCents != null ? <p className="text-xs text-muted">Last Zestimate {money(asset.zestimateCents, cur)} · {prettyDate(asset.asOf)}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button tone="quiet" onClick={() => setEditing(asset)}>Edit</Button>
                {asset.address ? (
                  <a className="inline-flex min-h-11 items-center text-sm text-honey-deep" href={asset.zillowUrl || zillowHref(asset.address)} target="_blank" rel="noreferrer">
                    Open on Zillow
                  </a>
                ) : null}
                {canEdit ? (
                  <Button
                    tone="quiet"
                    onClick={() => {
                      setEstimateFor(asset);
                      setEstimate(centsToInput(asset.zestimateCents ?? asset.valueCents));
                    }}
                  >
                    Save estimate
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="mt-4">
        <h2 className="font-display text-xl">Debts</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {debts.map((a) => (
            <li key={a.id} className="flex justify-between py-2">
              <a href={`/accounts?account=${a.id}`}>{a.name}</a>
              <span className="num">{money(a.balanceCents, cur)}{a.aprBps ? ` · ${(a.aprBps / 100).toFixed(2)}%` : ""}</span>
            </li>
          ))}
        </ul>
      </Card>
      {editing ? <AssetEditor asset={editing} onClose={() => setEditing(null)} /> : null}
      <Modal open={!!estimateFor} title="Record value" onClose={() => setEstimateFor(null)}>
        <p className="text-sm text-muted">Paste today’s Zestimate or your own number. It’s stored on the asset and in the value history.</p>
        <Field label="Value">
          <input className={fieldClass} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              if (!estimateFor) return;
              await run({ type: "valuation.add", assetId: estimateFor.id, asOf: data.today, valueCents: dollarsToCents(estimate), source: "zillow" });
              setEstimateFor(null);
            }}
          >
            Save as Zestimate
          </Button>
          <Button
            tone="quiet"
            onClick={async () => {
              if (!estimateFor) return;
              await run({ type: "valuation.add", assetId: estimateFor.id, asOf: data.today, valueCents: dollarsToCents(estimate), source: "manual" });
              setEstimateFor(null);
            }}
          >
            Save as mine
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AssetEditor({ asset, onClose }: { asset: Partial<Asset>; onClose: () => void }) {
  const { data, run, canEdit } = useBook();
  const [name, setName] = useState(asset.name ?? "");
  const [kind, setKind] = useState(asset.kind ?? "other");
  const [value, setValue] = useState(centsToInput(asset.valueCents ?? 0));
  const [address, setAddress] = useState(asset.address ?? "");
  const [detail, setDetail] = useState(asset.detail ?? "");
  const [loanAccountId, setLoanAccountId] = useState(asset.loanAccountId ?? "");
  if (!data) return null;
  return (
    <Modal open title={asset.id ? "Edit asset" : "New asset"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Kind">
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="home">Home</option>
          <option value="vehicle">Vehicle</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Value"><input className={fieldClass} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
      <Field label="Address"><input className={fieldClass} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
      <Field label="Detail"><input className={fieldClass} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
      <Field label="Loan">
        <select className={fieldClass} value={loanAccountId} onChange={(e) => setLoanAccountId(e.target.value)}>
          <option value="">None</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              await run({
                type: "asset.save",
                asset: {
                  id: asset.id,
                  name,
                  kind,
                  valueCents: dollarsToCents(value),
                  asOf: data.today,
                  address,
                  detail,
                  loanAccountId: loanAccountId || null,
                  zillowUrl: address ? zillowHref(address) : asset.zillowUrl ?? "",
                  zestimateCents: asset.zestimateCents ?? null,
                  customJson: asset.customJson ?? "[]",
                },
              });
              onClose();
            }}
          >
            Save
          </Button>
          {asset.id ? <Button tone="danger" onClick={async () => { await run({ type: "asset.delete", id: asset.id! }); onClose(); }}>Delete</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}

export function GoalsPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const focus = param(search, "goal");
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);
  const [fund, setFund] = useState<Goal | null>(null);
  const [amount, setAmount] = useState("");
  if (!data) return null;
  const cur = data.profile.currency;
  return (
    <div>
      <PageIntro title="Goals" lede="Name a target, a date, and a monthly pace. Contributions update the saved balance." action={canEdit ? <Button onClick={() => setEditing({ targetCents: 0, savedCents: 0, monthlyCents: 0 })}>Add goal</Button> : null} />
      <div className="grid gap-3 md:grid-cols-2">
        {data.goals.filter((g) => !g.archived).map((g) => {
          const pct = g.targetCents ? Math.min(100, Math.round((g.savedCents / g.targetCents) * 100)) : 0;
          return (
            <Card key={g.id} className={g.id === focus ? "ring-2 ring-honey" : ""}>
              <div className="flex justify-between gap-3">
                <p className="font-medium">{g.name}</p>
                <p className="num text-sm">{pct}%</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
                <div className="h-full bg-honey" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted">{money(g.savedCents, cur)} of {money(g.targetCents, cur)}{g.targetDate ? ` · ${prettyDate(g.targetDate)}` : ""}</p>
              {g.notes ? <p className="text-sm">{g.notes}</p> : null}
              <div className="mt-3 flex gap-2">
                {canEdit ? <Button onClick={() => { setFund(g); setAmount(centsToInput(g.monthlyCents || 0)); }}>Add money</Button> : null}
                <Button tone="quiet" onClick={() => setEditing(g)}>Edit</Button>
              </div>
            </Card>
          );
        })}
      </div>
      {editing ? <GoalEditor goal={editing} onClose={() => setEditing(null)} /> : null}
      <Modal open={!!fund} title={fund?.name ?? "Contribute"} onClose={() => setFund(null)}>
        <Field label="Amount"><input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Button
          onClick={async () => {
            if (!fund) return;
            await run({ type: "goal.contribute", goalId: fund.id, amountCents: dollarsToCents(amount), on: data.today, note: "Added from goals" });
            setFund(null);
          }}
        >
          Save
        </Button>
      </Modal>
    </div>
  );
}

function GoalEditor({ goal, onClose }: { goal: Partial<Goal>; onClose: () => void }) {
  const { data, run, canEdit } = useBook();
  const [name, setName] = useState(goal.name ?? "");
  const [target, setTarget] = useState(centsToInput(goal.targetCents ?? 0));
  const [saved, setSaved] = useState(centsToInput(goal.savedCents ?? 0));
  const [monthly, setMonthly] = useState(centsToInput(goal.monthlyCents ?? 0));
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [notes, setNotes] = useState(goal.notes ?? "");
  if (!data) return null;
  return (
    <Modal open title={goal.id ? "Edit goal" : "New goal"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Target"><input className={fieldClass} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      <Field label="Already saved"><input className={fieldClass} value={saved} onChange={(e) => setSaved(e.target.value)} /></Field>
      <Field label="Monthly pace"><input className={fieldClass} value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
      <Field label="Target date"><input type="date" className={fieldClass} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
      <Field label="Notes"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              await run({
                type: "goal.save",
                goal: {
                  id: goal.id,
                  name,
                  targetCents: dollarsToCents(target),
                  savedCents: dollarsToCents(saved),
                  monthlyCents: dollarsToCents(monthly),
                  targetDate: targetDate || null,
                  notes,
                  priority: goal.priority ?? 0,
                  archived: false,
                },
              });
              onClose();
            }}
          >
            Save
          </Button>
          {goal.id ? <Button tone="danger" onClick={async () => { await run({ type: "goal.delete", id: goal.id! }); onClose(); }}>Delete</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}

export function MilestonesPage() {
  const { data, run, canEdit } = useBook();
  const [editing, setEditing] = useState<Partial<Milestone> | null>(null);
  if (!data) return null;
  const tax = estimateTax(data.profile, data.transactions, data.categories, data.today);
  const marginal = tax.marginal || 0.22;
  const cur = data.profile.currency;
  return (
    <div>
      <PageIntro
        title="Milestones"
        lede="Run the same monthly amount three ways: taxable (15% drag on gains), Roth (no drag), and pre-tax (you can put more in because it lowers this year’s tax, then pay your current marginal rate on the way out)."
        action={canEdit ? <Button onClick={() => setEditing({ kind: "savings", targetCents: 0, currentCents: 0, monthlyCents: 0, annualReturnBps: 500 })}>Add</Button> : null}
      />
      <div className="space-y-4">
        {data.milestones.map((m) => {
          const months = 360;
          const taxable = projectBalance({ currentCents: m.currentCents, monthlyCents: m.monthlyCents, annualReturnBps: m.annualReturnBps, months, drag: 0.15 });
          const roth = projectBalance({ currentCents: m.currentCents, monthlyCents: m.monthlyCents, annualReturnBps: m.annualReturnBps, months });
          const pretaxMonthly = Math.round(m.monthlyCents / Math.max(0.05, 1 - marginal));
          const pretax = projectBalance({ currentCents: m.currentCents, monthlyCents: pretaxMonthly, annualReturnBps: m.annualReturnBps, months });
          const pretaxSpendable = pretax.map((p) => ({ ...p, balanceCents: Math.round(p.balanceCents * (1 - marginal)) }));
          const target = m.kind === "debt" ? 0 : m.targetCents;
          return (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-muted">{m.kind} · {(m.annualReturnBps / 100).toFixed(2)}% · {money(m.monthlyCents, cur)} / month</p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button tone="quiet" onClick={() => setEditing(m)}>Edit</Button>
                    <Button tone="danger" onClick={() => run({ type: "milestone.delete", id: m.id })}>Delete</Button>
                  </div>
                ) : null}
              </div>
              {m.kind === "debt" ? (
                <p className="mt-2 text-sm">At {money(m.monthlyCents, cur)} a month, the {money(m.currentCents, cur)} balance clears in about {m.monthlyCents ? Math.ceil(m.currentCents / m.monthlyCents) : "—"} months, before interest. The rate on the milestone is the note’s APR, so this is a sketch, not an amortization schedule.</p>
              ) : (
                <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <li className="rounded-xl bg-paper p-3">Taxable hits {target ? `in ${hitMonth(taxable, target) ?? "360+"} mo` : "—"}. Ending spendable after a 15% gain drag.</li>
                  <li className="rounded-xl bg-paper p-3">Roth hits in {hitMonth(roth, target) ?? "360+"} months. Same out-of-pocket, no tax on the growth in this model.</li>
                  <li className="rounded-xl bg-paper p-3">Pre-tax contribution becomes {money(pretaxMonthly, cur)} because of a {Math.round(marginal * 100)}% marginal rate. Spendable after that same rate on withdrawal hits in {hitMonth(pretaxSpendable, target) ?? "360+"} months.</li>
                </ul>
              )}
              {m.notes ? <p className="mt-2 text-sm text-muted">{m.notes}</p> : null}
            </Card>
          );
        })}
      </div>
      {editing ? <MilestoneEditor milestone={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function MilestoneEditor({ milestone, onClose }: { milestone: Partial<Milestone>; onClose: () => void }) {
  const { data, run } = useBook();
  const [name, setName] = useState(milestone.name ?? "");
  const [kind, setKind] = useState(milestone.kind ?? "savings");
  const [target, setTarget] = useState(centsToInput(milestone.targetCents ?? 0));
  const [current, setCurrent] = useState(centsToInput(milestone.currentCents ?? 0));
  const [monthly, setMonthly] = useState(centsToInput(milestone.monthlyCents ?? 0));
  const [rate, setRate] = useState(String((milestone.annualReturnBps ?? 500) / 100));
  const [notes, setNotes] = useState(milestone.notes ?? "");
  if (!data) return null;
  return (
    <Modal open title="Milestone" onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Kind">
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="savings">Savings</option>
          <option value="debt">Debt payoff</option>
          <option value="networth">Net worth</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      <Field label="Target"><input className={fieldClass} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      <Field label="Current"><input className={fieldClass} value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="Monthly"><input className={fieldClass} value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
      <Field label="Annual return or APR %"><input className={fieldClass} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      <Field label="Notes"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button
        onClick={async () => {
          await run({
            type: "milestone.save",
            milestone: {
              id: milestone.id,
              name,
              kind,
              targetCents: dollarsToCents(target),
              currentCents: dollarsToCents(current),
              monthlyCents: dollarsToCents(monthly),
              annualReturnBps: Math.round(Number(rate || 0) * 100),
              notes,
              targetDate: milestone.targetDate ?? null,
            },
          });
          onClose();
        }}
      >
        Save
      </Button>
    </Modal>
  );
}

export function CreditPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const asked = param(search, "person");
  const [personId, setPersonId] = useState<string | null>(asked || null);
  const [bureau, setBureau] = useState("Experian");
  const [score, setScore] = useState("720");
  const [factors, setFactors] = useState("");
  if (!data) return null;
  const people = data.people.filter((p) => !p.archived);
  const selected = personId === null ? people[0]?.id ?? "" : personId;
  const mine = data.scores.filter((s) => (s.personId ?? "") === selected);
  const util = utilization(data.accounts);
  const latest = new Map<string, (typeof data.scores)[number]>();
  for (const s of mine) latest.set(s.bureau, s);
  const dates = [...new Set(mine.map((s) => s.asOf))].sort();
  const series = dates.map((asOf) => {
    const row: Record<string, string | number> = { asOf };
    for (const s of mine) if (s.asOf === asOf) row[s.bureau] = s.score;
    return row;
  });
  const bureaus = [...new Set(mine.map((s) => s.bureau))];
  const who = people.find((p) => p.id === selected);
  return (
    <div>
      <PageIntro
        title="Credit"
        lede="Each person keeps their own scores. Nothing is pulled from a bureau — you log what you see."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {people.map((p) => (
          <Button key={p.id} tone={p.id === selected ? "primary" : "quiet"} onClick={() => setPersonId(p.id)}>{p.name}</Button>
        ))}
        {data.scores.some((s) => !s.personId) ? (
          <Button tone={selected === "" ? "primary" : "quiet"} onClick={() => setPersonId("")}>Unassigned</Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[...latest.values()].map((s) => (
          <Card key={s.id}>
            <p className="text-sm text-muted">{s.bureau}{who ? ` · ${who.name}` : ""}</p>
            <p className="font-display text-4xl num">{s.score}</p>
            <p className="text-xs text-muted">{prettyDate(s.asOf)}</p>
            {s.factors ? <p className="mt-2 text-sm">{s.factors}</p> : null}
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <p className="text-sm text-muted">Card utilization · household</p>
        <p className="font-display text-3xl num">{util.limit ? `${Math.round(util.ratio * 100)}%` : "—"}</p>
        <p className="text-sm text-muted">{money(util.owed, data.profile.currency)} of {money(util.limit, data.profile.currency)} in limits. Under 30% is the usual watch-point, under 10% is quieter.</p>
        {series.length ? (
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <XAxis dataKey="asOf" tickFormatter={(v) => String(v).slice(0, 7)} />
                <YAxis domain={[600, 850]} width={36} />
                <Tooltip />
                {(bureaus.length ? bureaus : ["Experian"]).map((name, i) => (
                  <Line key={name} dataKey={name} stroke={["#2f6b4f", "#c4841d", "#a33b2b"][i % 3]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No scores for {who?.name ?? "this person"} yet.</p>
        )}
      </Card>
      {canEdit ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Log a score{who ? ` for ${who.name}` : ""}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Field label="Bureau">
              <select className={fieldClass} value={bureau} onChange={(e) => setBureau(e.target.value)}>
                {["Experian", "Equifax", "TransUnion"].map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Score"><input className={fieldClass} value={score} onChange={(e) => setScore(e.target.value)} /></Field>
            <Field label="Factors"><input className={fieldClass} value={factors} onChange={(e) => setFactors(e.target.value)} /></Field>
          </div>
          <div className="mt-3">
            <Button
              disabled={!selected}
              onClick={() => run({ type: "score.save", score: { bureau, score: Number(score), asOf: data.today, factors, personId: selected } })}
            >
              Save score
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
