import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { askAdvisor } from "@/lib/honey/fns";
import {
  centsToInput,
  dollarsToCents,
  estimateTax,
  lineSum,
  money,
  prettyDate,
  rangeFor,
  runReport,
  taxLines,
} from "@/lib/honey/calc";
import type { Account, Category, Profile, ProfilePatch, Reminder, Watch } from "@/lib/honey/types";
import { createVault, decryptText, encryptText, unlockVault } from "@/lib/honey/vault";
import { NAV_IDS } from "../shell";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, downloadText, fieldClass } from "../kit";

function param(search: string, key: string) {
  return new URLSearchParams(search.replace(/^\?/, "")).get(key) ?? "";
}

function readFilters(json: string): { personId: string; tag: string } {
  try {
    const v = JSON.parse(json || "{}") as { personId?: string; tag?: string };
    return { personId: String(v.personId ?? ""), tag: String(v.tag ?? "") };
  } catch {
    return { personId: "", tag: "" };
  }
}

export function ReportsPage() {
  const { data, run, canEdit } = useBook();
  const [name, setName] = useState("Custom spending");
  const [metric, setMetric] = useState("spending");
  const [rangeKey, setRangeKey] = useState("month");
  const [groupBy, setGroupBy] = useState("category");
  const [active, setActive] = useState<string | null>(null);
  const [personId, setPersonId] = useState("");
  const [tag, setTag] = useState("");
  const reportKey = active ?? data?.reports[0]?.id ?? "";
  useEffect(() => {
    if (!data) return;
    const saved = data.reports.find((r) => r.id === reportKey);
    if (!saved) return;
    const filters = readFilters(saved.filtersJson);
    setPersonId(filters.personId);
    setTag(filters.tag);
    setMetric(saved.metric);
    setRangeKey(saved.rangeKey);
    setGroupBy(saved.groupBy);
  }, [reportKey]);
  if (!data) return null;
  const chosen = data.reports.find((r) => r.id === active) ?? data.reports[0];
  const spec = { name: chosen?.name ?? name, metric, rangeKey, groupBy };
  const range = rangeFor(spec.rangeKey, data.today, data.profile.monthStartDay);
  const rows = runReport({
    metric: spec.metric,
    groupBy: spec.groupBy,
    from: range.from,
    to: range.to,
    txns: data.transactions,
    categories: data.categories,
    accounts: data.accounts,
    people: data.people,
    personId,
    tag,
  });
  const cur = data.profile.currency;
  const tags = [...new Set(data.transactions.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b));
  const personName = personId === "household" ? "Household" : data.people.find((p) => p.id === personId)?.name;
  return (
    <div>
      <PageIntro title="Reports" lede="Slice spending or income by person, by tag, or both. A transaction with two tags is counted under each when you group by tag." />
      <div className="mb-3 flex flex-wrap gap-2">
        {data.reports.map((r) => (
          <Button key={r.id} tone={(chosen?.id ?? "") === r.id ? "primary" : "quiet"} onClick={() => setActive(r.id)}>{r.name}</Button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">{spec.name}</h2>
            <p className="text-sm text-muted">
              {range.from} to {range.to}
              {personName ? ` · ${personName}` : ""}
              {tag ? ` · #${tag}` : ""}
            </p>
          </div>
          <Button
            tone="quiet"
            onClick={() => {
              const csv = ["label,cents", ...rows.map((r) => `"${r.label.replaceAll('"', "")}",${r.cents}`)].join("\n");
              downloadText(`${spec.name}.csv`, csv, "text/csv");
            }}
          >
            Export CSV
          </Button>
        </div>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.slice(0, 8)}>
              <XAxis dataKey="label" interval={0} tick={{ fontSize: 11 }} hide={rows.length > 6} />
              <Tooltip formatter={(v) => money(Number(v), cur)} />
              <Bar dataKey="cents" fill="#c4841d" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between py-2">
              <span>{r.label}</span>
              <span className="num">{money(r.cents, cur)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="Person">
            <select className={fieldClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Everyone</option>
              <option value="household">Household (shared)</option>
              {data.people.filter((p) => !p.archived).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tag">
            <select className={fieldClass} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Any tag</option>
              {tags.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      {canEdit ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">New report</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Metric">
              <select className={fieldClass} value={metric} onChange={(e) => setMetric(e.target.value)}>
                <option value="spending">Spending</option>
                <option value="income">Income</option>
                <option value="net">Net</option>
                <option value="merchant">Merchants</option>
              </select>
            </Field>
            <Field label="Range">
              <select className={fieldClass} value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
                <option value="month">This month</option>
                <option value="last">Last month</option>
                <option value="quarter">90 days</option>
                <option value="ytd">Year to date</option>
                <option value="12mo">12 months</option>
              </select>
            </Field>
            <Field label="Group">
              <select className={fieldClass} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <option value="category">Category</option>
                <option value="merchant">Merchant</option>
                <option value="month">Month</option>
                <option value="account">Account</option>
                <option value="person">Person</option>
                <option value="tag">Tag</option>
              </select>
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => run({ type: "report.save", report: { name, metric, rangeKey, groupBy, filtersJson: JSON.stringify({ personId, tag }) } })}>Save report</Button>
            {chosen?.id ? <Button tone="danger" onClick={() => run({ type: "report.delete", id: chosen.id })}>Delete shown</Button> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function TaxesPage() {
  const { data, run, canEdit, isOwner } = useBook();
  if (!data) return null;
  const year = Number(data.today.slice(0, 4));
  const pack = taxLines(data.transactions, data.categories, year);
  const tax = estimateTax(data.profile, data.transactions, data.categories, data.today);
  const cur = data.profile.currency;
  const p = data.profile;
  const schedules = {
    year,
    filingStatus: p.filingStatus,
    A: {
      medical: lineSum(pack.A, "medical"),
      medicalAllowed: tax.medicalAllowed,
      salt: lineSum(pack.A, "salt"),
      saltAllowed: tax.saltAllowed,
      mortgageInterest: lineSum(pack.A, "mortgage_interest"),
      charity: lineSum(pack.A, "charity"),
    },
    B: { interest: lineSum(pack.B, "interest"), dividends: lineSum(pack.B, "dividends") },
    C: pack.C,
    D: pack.D,
    E: pack.E,
    F: pack.F,
    estimate: tax,
  };
  const voucher = tax.vouchersLeft ? Math.max(0, Math.round(tax.remaining / tax.vouchersLeft)) : Math.max(0, tax.remaining);
  return (
    <div>
      <PageIntro
        title="Taxes"
        lede={`Tag expenses as you go and they land on Schedules A–F. Figures use 2026 federal brackets. This is a planner, not a filed return.`}
        action={
          <div className="flex gap-2">
            <Button tone="quiet" onClick={() => downloadText(`honeyjar-schedules-${year}.json`, JSON.stringify(schedules, null, 2))}>Export JSON</Button>
            <Button
              tone="quiet"
              onClick={() => {
                const lines = ["schedule,line,cents"];
                for (const [sch, rows] of Object.entries(pack)) {
                  for (const row of rows) lines.push(`${sch},${row.line},${row.cents}`);
                }
                downloadText(`honeyjar-schedules-${year}.csv`, lines.join("\n"), "text/csv");
              }}
            >
              Export CSV
            </Button>
          </div>
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card><p className="text-sm text-muted">Estimated tax</p><p className="font-display text-3xl num">{money(tax.total, cur)}</p><p className="text-xs text-muted">{tax.deductionLabel}</p></Card>
        <Card><p className="text-sm text-muted">Still to set aside</p><p className="font-display text-3xl num">{money(Math.max(0, tax.remaining), cur)}</p><p className="text-xs text-muted">Next voucher {prettyDate(tax.nextVoucher)} · about {money(Math.max(0, voucher), cur)}</p></Card>
        <Card><p className="text-sm text-muted">Safe harbor</p><p className="font-display text-3xl num">{money(tax.safeHarbor, cur)}</p><p className="text-xs text-muted">{p.wagesCents + p.otherIncomeCents > 15000000 ? "110% of prior-year tax" : "100% of prior-year tax"}</p></Card>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl">Schedule A</h2>
          <Lines cur={cur} rows={[["Medical paid", lineSum(pack.A, "medical")], ["Allowed after 7.5% of AGI", tax.medicalAllowed], ["SALT paid", lineSum(pack.A, "salt")], ["SALT allowed", tax.saltAllowed], ["Mortgage interest", lineSum(pack.A, "mortgage_interest")], ["Charity", lineSum(pack.A, "charity")]]} />
          <a className="text-sm text-honey-deep" href="/transactions">Review tagged transactions</a>
        </Card>
        <Card>
          <h2 className="font-display text-xl">Schedule B</h2>
          <Lines cur={cur} rows={[["Interest", lineSum(pack.B, "interest")], ["Dividends", lineSum(pack.B, "dividends")]]} />
          <h2 className="mt-4 font-display text-xl">Schedules C, D, E, F</h2>
          <p className="text-sm text-muted">Totals from anything you tag. Business detail lands here when those books open; the tags already stick. Schedule lines are year-to-date, compared with the full-year standard deduction, so itemizing rarely wins before December.</p>
          <Lines cur={cur} rows={[["C", pack.C.reduce((s, r) => s + r.cents, 0)], ["D", pack.D.reduce((s, r) => s + r.cents, 0)], ["E", pack.E.reduce((s, r) => s + r.cents, 0)], ["F", pack.F.reduce((s, r) => s + r.cents, 0)]]} />
        </Card>
      </div>
      {isOwner ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Planner assumptions</h2>
          <ProfileMoney profile={p} canEdit={canEdit} onSave={(patch) => run({ type: "profile.update", patch })} />
        </Card>
      ) : null}
    </div>
  );
}

function Lines({ rows, cur }: { rows: [string, number][]; cur: string }) {
  return (
    <ul className="my-2 text-sm">
      {rows.map(([label, cents]) => (
        <li key={label} className="flex justify-between py-1">
          <span>{label}</span>
          <span className="num">{money(cents, cur)}</span>
        </li>
      ))}
    </ul>
  );
}

function ProfileMoney({
  profile,
  canEdit,
  onSave,
}: {
  profile: Profile;
  canEdit: boolean;
  onSave: (patch: ProfilePatch) => void;
}) {
  const [wages, setWages] = useState(centsToInput(profile.wagesCents));
  const [other, setOther] = useState(centsToInput(profile.otherIncomeCents));
  const [withholding, setWithholding] = useState(centsToInput(profile.withholdingCents));
  const [estimates, setEstimates] = useState(centsToInput(profile.estimatedPaidCents));
  const [prior, setPrior] = useState(centsToInput(profile.priorYearTaxCents));
  const [status, setStatus] = useState(profile.filingStatus);
  const [mode, setMode] = useState(profile.deductionMode);
  const [salt, setSalt] = useState(centsToInput(profile.saltCapCents));
  const [stateRate, setStateRate] = useState(String(profile.stateRateBps / 100));
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <Field label="Filing status">
        <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="single">Single</option>
          <option value="mfj">Married filing jointly</option>
          <option value="mfs">Married filing separately</option>
          <option value="hoh">Head of household</option>
        </select>
      </Field>
      <Field label="Deduction">
        <select className={fieldClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="auto">Whichever is higher</option>
          <option value="standard">Standard</option>
          <option value="itemized">Itemized</option>
        </select>
      </Field>
      <Field label="Wages (annual)"><input className={fieldClass} value={wages} onChange={(e) => setWages(e.target.value)} /></Field>
      <Field label="Other income"><input className={fieldClass} value={other} onChange={(e) => setOther(e.target.value)} /></Field>
      <Field label="Withholding so far"><input className={fieldClass} value={withholding} onChange={(e) => setWithholding(e.target.value)} /></Field>
      <Field label="Estimates already paid"><input className={fieldClass} value={estimates} onChange={(e) => setEstimates(e.target.value)} /></Field>
      <Field label="Prior-year total tax"><input className={fieldClass} value={prior} onChange={(e) => setPrior(e.target.value)} /></Field>
      <Field label="SALT cap"><input className={fieldClass} value={salt} onChange={(e) => setSalt(e.target.value)} /></Field>
      <Field label="State rate you assume, %"><input className={fieldClass} value={stateRate} onChange={(e) => setStateRate(e.target.value)} /></Field>
      <div className="flex items-end">
        <Button
          disabled={!canEdit}
          onClick={() =>
            onSave({
              filingStatus: status,
              deductionMode: mode,
              wagesCents: dollarsToCents(wages),
              otherIncomeCents: dollarsToCents(other),
              withholdingCents: dollarsToCents(withholding),
              estimatedPaidCents: dollarsToCents(estimates),
              priorYearTaxCents: dollarsToCents(prior),
              saltCapCents: dollarsToCents(salt),
              stateRateBps: Math.round(Number(stateRate || 0) * 100),
            })
          }
        >
          Update planner
        </Button>
      </div>
    </div>
  );
}

export function WatchPage() {
  const { data, run, canEdit } = useBook();
  const [editing, setEditing] = useState<Partial<Watch> | null>(null);
  if (!data) return null;
  return (
    <div>
      <PageIntro title="Watchlists" lede="A merchant, a category, a balance, or a goal. When it trips, it shows up on Spending with a link back to the thing itself." action={canEdit ? <Button onClick={() => setEditing({ kind: "category", comparator: "gt", thresholdCents: 0, enabled: true })}>Add watch</Button> : null} />
      <div className="space-y-2">
        {data.watches.map((w) => (
          <Card key={w.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{w.name}</p>
              <p className="text-sm text-muted">{w.kind} · {w.refName || "—"} · {w.comparator} {money(w.thresholdCents, data.profile.currency)}{w.enabled ? "" : " · off"}</p>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <Button tone="quiet" onClick={() => setEditing(w)}>Edit</Button>
                <Button tone="danger" onClick={() => run({ type: "watch.delete", id: w.id })}>Delete</Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      {editing ? <WatchEditor watch={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function WatchEditor({ watch, onClose }: { watch: Partial<Watch>; onClose: () => void }) {
  const { data, run } = useBook();
  const [name, setName] = useState(watch.name ?? "");
  const [kind, setKind] = useState(watch.kind ?? "category");
  const [refId, setRefId] = useState(watch.refId ?? "");
  const [refName, setRefName] = useState(watch.refName ?? "");
  const [comparator, setComparator] = useState(watch.comparator ?? "gt");
  const [threshold, setThreshold] = useState(centsToInput(watch.thresholdCents ?? 0));
  if (!data) return null;
  return (
    <Modal open title="Watch" onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Kind">
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="category">Category spend</option>
          <option value="merchant">Merchant spend</option>
          <option value="balance">Account balance</option>
          <option value="goal">Goal behind pace</option>
        </select>
      </Field>
      {kind === "merchant" ? (
        <Field label="Merchant contains"><input className={fieldClass} value={refName} onChange={(e) => setRefName(e.target.value)} /></Field>
      ) : (
        <Field label="Target">
          <select
            className={fieldClass}
            value={refId}
            onChange={(e) => {
              setRefId(e.target.value);
              const label = e.target.selectedOptions[0]?.text ?? "";
              setRefName(label);
            }}
          >
            <option value="">Choose</option>
            {(kind === "balance" ? data.accounts : kind === "goal" ? data.goals : data.categories).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="When">
          <select className={fieldClass} value={comparator} onChange={(e) => setComparator(e.target.value)}>
            <option value="gt">Over</option>
            <option value="lt">Under</option>
          </select>
        </Field>
        <Field label={kind === "goal" ? "Behind by at least" : "Amount"}>
          <input className={fieldClass} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
      </div>
      <Button
        onClick={async () => {
          await run({
            type: "watch.save",
            watch: { id: watch.id, name, kind, refId, refName, comparator, thresholdCents: dollarsToCents(threshold), enabled: true, note: watch.note ?? "" },
          });
          onClose();
        }}
      >
        Save
      </Button>
    </Modal>
  );
}

export function RemindersPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const focus = param(search, "reminder");
  const [editing, setEditing] = useState<Partial<Reminder> | null>(null);
  if (!data) return null;
  return (
    <div>
      <PageIntro title="Reminders" lede="A nudge with a link. Open it and you land on the bill, the house, or the tax planner." action={canEdit ? <Button onClick={() => setEditing({ dueOn: data.today, href: "", repeat: "none" })}>Add</Button> : null} />
      <ul className="space-y-2">
        {data.reminders.map((r) => (
          <li key={r.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 ${r.id === focus ? "ring-2 ring-honey" : ""}`}>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={r.done} disabled={!canEdit} onChange={() => run({ type: "reminder.save", reminder: { ...r, done: !r.done } })} />
              <span>
                <span className={r.done ? "text-muted line-through" : "font-medium"}>{r.title}</span>
                <span className="block text-xs text-muted">{prettyDate(r.dueOn)}{r.href ? " · linked" : ""}</span>
              </span>
            </label>
            <div className="flex gap-2">
              {r.href ? <a className="inline-flex min-h-11 items-center text-sm text-honey-deep" href={r.href}>Open</a> : null}
              {canEdit ? <Button tone="danger" onClick={() => run({ type: "reminder.delete", id: r.id })}>Delete</Button> : null}
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <ReminderEditor
          reminder={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ReminderEditor({ reminder, onClose }: { reminder: Partial<Reminder>; onClose: () => void }) {
  const { data, run } = useBook();
  const [title, setTitle] = useState(reminder.title ?? "");
  const [dueOn, setDueOn] = useState(reminder.dueOn ?? data?.today ?? "");
  const [href, setHref] = useState(reminder.href ?? "");
  const [notes, setNotes] = useState(reminder.notes ?? "");
  return (
    <Modal open title="Reminder" onClose={onClose}>
      <Field label="Title"><input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Due"><input type="date" className={fieldClass} value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></Field>
      <Field label="Link path"><input className={fieldClass} value={href} onChange={(e) => setHref(e.target.value)} placeholder="/bills?bill=…" /></Field>
      <Field label="Notes"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button onClick={async () => { await run({ type: "reminder.save", reminder: { id: reminder.id, title, dueOn, href, notes, done: false, repeat: "none", relatedType: "", relatedId: "" } }); onClose(); }}>Save</Button>
    </Modal>
  );
}

export function DocumentsPage() {
  const { data, run, canEdit, vaultKey, setVaultKey } = useBook();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("other");
  const [body, setBody] = useState("");
  const [pass, setPass] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [plain, setPlain] = useState("");
  if (!data) return null;
  const locked = Boolean(data.profile.vaultVerifier) && !vaultKey;
  return (
    <div>
      <PageIntro title="Documents" lede="Statements, policies, return summaries. Turn the vault on in Customize and new notes are sealed with AES-256-GCM before they leave the browser." />
      {data.profile.vaultVerifier ? (
        <Card className="mb-4">
          {vaultKey ? <p className="text-sm">Vault is unlocked on this device for this visit.</p> : (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const key = await unlockVault(pass, data.profile.vaultSalt, data.profile.vaultVerifier);
                setVaultKey(key);
                setPass("");
              }}
            >
              <input className={`${fieldClass} max-w-xs`} type="password" placeholder="Vault passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
              <Button type="submit">Unlock</Button>
            </form>
          )}
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {data.documents.map((d) => (
          <Card key={d.id}>
            <p className="font-medium">{d.title}</p>
            <p className="text-sm text-muted">{d.kind}{d.year ? ` · ${d.year}` : ""}{d.encrypted ? " · encrypted" : ""}</p>
            <p className="mt-1 text-sm">{d.notes}</p>
            {d.relatedType ? <a className="text-sm text-honey-deep" href={linkFor(d.relatedType, d.relatedId)}>Open related</a> : null}
            <div className="mt-2 flex gap-2">
              <Button
                tone="quiet"
                onClick={async () => {
                  if (!d.encrypted) {
                    setPlain(d.body);
                    setOpenId(d.id);
                    return;
                  }
                  if (!vaultKey) return;
                  setPlain(await decryptText(vaultKey, d.body));
                  setOpenId(d.id);
                }}
              >
                {d.encrypted && !vaultKey ? "Locked" : "Read"}
              </Button>
              {canEdit ? <Button tone="danger" onClick={() => run({ type: "document.delete", id: d.id })}>Delete</Button> : null}
            </div>
          </Card>
        ))}
      </div>
      {canEdit ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Add a note</h2>
          <div className="mt-3 space-y-2">
            <Field label="Title"><input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Kind">
              <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                {["tax", "statement", "insurance", "receipt", "other"].map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Body"><textarea className={`${fieldClass} min-h-28 py-2`} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <Button
              disabled={Boolean(data.profile.vaultVerifier) && !vaultKey}
              onClick={async () => {
                const encrypted = Boolean(vaultKey);
                const stored = vaultKey ? await encryptText(vaultKey, body) : body;
                await run({ type: "document.save", document: { title, kind, body: stored, encrypted, notes: "", year: Number(data.today.slice(0, 4)), relatedType: "", relatedId: "", fileName: "" } });
                setTitle("");
                setBody("");
              }}
            >
              {locked ? "Unlock the vault first" : vaultKey ? "Save encrypted" : "Save"}
            </Button>
          </div>
        </Card>
      ) : null}
      <Modal open={!!openId} title="Document" onClose={() => setOpenId(null)}>
        <p className="whitespace-pre-wrap text-sm">{plain}</p>
      </Modal>
    </div>
  );
}

function linkFor(type: string, id: string) {
  if (type === "asset") return `/networth?asset=${id}`;
  if (type === "bill") return `/bills?bill=${id}`;
  if (type === "account") return `/accounts?account=${id}`;
  if (type === "tax") return "/taxes";
  return "/documents";
}

export function SharePage() {
  const { data, run, isOwner, setOwnerId } = useBook();
  const [role, setRole] = useState("viewer");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [minted, setMinted] = useState("");
  if (!data) return null;
  return (
    <div>
      <PageIntro title="Sharing" lede="A partner can edit. An advisor can look. The invite code is the key — they sign in, enter it, and the household shows up in their switcher." />
      <Card>
        <h2 className="font-display text-xl">Join a household</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={`${fieldClass} max-w-xs uppercase`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" />
          <Button
            onClick={async () => {
              await run({ type: "invite.accept", code });
              setCode("");
            }}
          >
            Accept
          </Button>
        </div>
      </Card>
      {data.shared.length ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Shared with you</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {data.shared.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>{s.householdName} · {s.role}</span>
                <Button tone="quiet" onClick={() => setOwnerId(s.ownerUserId)}>Open</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {isOwner ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Invite</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Email (optional)"><input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Role">
              <select className={fieldClass} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="advisor">Advisor</option>
              </select>
            </Field>
          </div>
          <Button
            onClick={async () => {
              const res = await run({ type: "invite.create", role, email });
              setMinted(res.code ?? "");
            }}
          >
            Create code
          </Button>
          {minted ? <p className="mt-3 rounded-xl bg-honey-soft px-3 py-2 text-sm">Code <span className="num font-medium">{minted}</span> — copy it now. It also stays in the list below.</p> : null}
          <ul className="mt-4 divide-y divide-line text-sm">
            {data.invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="num">{inv.inviteCode}</span>
                <span>{inv.role} · {inv.status}{inv.memberEmail ? ` · ${inv.memberEmail}` : ""}</span>
                {inv.status !== "revoked" ? <Button tone="danger" onClick={() => run({ type: "invite.revoke", id: inv.id })}>Revoke</Button> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export function AccountsPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const focus = param(search, "account");
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [bank, setBank] = useState("");
  const [checking, setChecking] = useState("");
  const [cardBal, setCardBal] = useState("");
  const [cardLimit, setCardLimit] = useState("");
  if (!data) return null;
  const cur = data.profile.currency;
  return (
    <div>
      <PageIntro
        title="Accounts"
        lede="HoneyJar never logs into a bank. Name the institution, type the balances you see today, then import the CSV your bank already lets you download."
        action={canEdit ? <Button onClick={() => setEditing({ kind: "checking", balanceCents: 0, connected: false })}>Add account</Button> : null}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {data.accounts.filter((a) => !a.archived).map((a) => (
          <Card key={a.id} className={a.id === focus ? "ring-2 ring-honey" : ""}>
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-muted">{a.institution || "Manual"} · {a.kind}{a.mask ? ` · ${a.mask}` : ""}{a.connected ? " · connected" : ""}</p>
              </div>
              <p className="num font-display text-xl">{money(a.balanceCents, cur)}</p>
            </div>
            {a.limitCents ? <p className="mt-1 text-xs text-muted">Limit {money(a.limitCents, cur)}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button tone="quiet" onClick={() => setEditing(a)}>Edit</Button>
              {canEdit ? <Button tone="ghost" onClick={() => run({ type: "account.archive", id: a.id, archived: true })}>Archive</Button> : null}
              <a className="inline-flex min-h-11 items-center text-sm text-honey-deep" href="/transactions">Transactions</a>
            </div>
          </Card>
        ))}
      </div>
      {canEdit ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Connect a bank</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Type the institution and the balances on the screen right now. This does not sign in.</li>
            <li>In the bank’s site or app, export transactions as a CSV.</li>
            <li>Import that file on Transactions. Rules categorize the rows they recognize.</li>
          </ol>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Institution"><input className={fieldClass} value={bank} onChange={(e) => setBank(e.target.value)} placeholder="First Harbor" /></Field>
            <Field label="Checking balance"><input className={fieldClass} value={checking} onChange={(e) => setChecking(e.target.value)} /></Field>
            <Field label="Card balance owed"><input className={fieldClass} value={cardBal} onChange={(e) => setCardBal(e.target.value)} /></Field>
            <Field label="Card limit"><input className={fieldClass} value={cardLimit} onChange={(e) => setCardLimit(e.target.value)} /></Field>
          </div>
          <Button
            onClick={async () => {
              if (!bank) return;
              if (checking) {
                await run({ type: "account.save", account: { name: `${bank} checking`, institution: bank, kind: "checking", balanceCents: dollarsToCents(checking), connected: true } });
              }
              if (cardBal || cardLimit) {
                await run({ type: "account.save", account: { name: `${bank} card`, institution: bank, kind: "credit", balanceCents: dollarsToCents(cardBal || "0"), limitCents: cardLimit ? dollarsToCents(cardLimit) : null, connected: true } });
              }
              setBank("");
              setChecking("");
              setCardBal("");
              setCardLimit("");
            }}
          >
            Save connection
          </Button>
          <a className="ml-3 inline-flex min-h-11 items-center text-sm text-honey-deep" href="/transactions?import=1">Import a CSV</a>
        </Card>
      ) : null}
      {editing ? <AccountEditor account={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function AccountEditor({ account, onClose }: { account: Partial<Account>; onClose: () => void }) {
  const { run } = useBook();
  const [name, setName] = useState(account.name ?? "");
  const [institution, setInstitution] = useState(account.institution ?? "");
  const [kind, setKind] = useState(account.kind ?? "checking");
  const [balance, setBalance] = useState(centsToInput(account.balanceCents ?? 0));
  const [limit, setLimit] = useState(account.limitCents == null ? "" : centsToInput(account.limitCents));
  const [mask, setMask] = useState(account.mask ?? "");
  const [apr, setApr] = useState(account.aprBps == null ? "" : String(account.aprBps / 100));
  return (
    <Modal open title="Account" onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Institution"><input className={fieldClass} value={institution} onChange={(e) => setInstitution(e.target.value)} /></Field>
      <Field label="Kind">
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {["checking", "savings", "cash", "credit", "loan", "mortgage", "investment"].map((k) => <option key={k}>{k}</option>)}
        </select>
      </Field>
      <Field label="Balance"><input className={fieldClass} value={balance} onChange={(e) => setBalance(e.target.value)} /></Field>
      <Field label="Limit"><input className={fieldClass} value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      <Field label="Last 4"><input className={fieldClass} value={mask} onChange={(e) => setMask(e.target.value)} /></Field>
      <Field label="APR %"><input className={fieldClass} value={apr} onChange={(e) => setApr(e.target.value)} /></Field>
      <Button
        onClick={async () => {
          await run({
            type: "account.save",
            account: {
              id: account.id,
              name,
              institution,
              kind,
              balanceCents: dollarsToCents(balance),
              limitCents: limit ? dollarsToCents(limit) : null,
              mask,
              aprBps: apr ? Math.round(Number(apr) * 100) : null,
              connected: account.connected ?? false,
              customJson: account.customJson ?? "[]",
              openedOn: account.openedOn ?? null,
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

export function AdvisorPage() {
  const { data, run, ownerId, reload } = useBook();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!data) return null;
  async function ask() {
    if (!question.trim()) return;
    setPending(true);
    setError("");
    const q = question.trim();
    try {
      const res = await askAdvisor({ data: { question: q, ownerId } });
      if (res.mode === "ollama") {
        const response = await fetch(`${res.url.replace(/\/$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: res.model,
            stream: false,
            messages: [
              { role: "system", content: res.system },
              { role: "user", content: res.question },
            ],
          }),
        });
        if (!response.ok) throw new Error("Ollama didn’t answer. Is it running, and is OLLAMA_ORIGINS open to this site?");
        const body = (await response.json()) as { message?: { content?: string } };
        const text = body.message?.content ?? "No answer.";
        await run({ type: "advisor.log", question: q, answer: text });
      }
      setQuestion("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The advisor failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <PageIntro
        title="Advisor"
        lede={`Asking as ${data.profile.aiProvider === "grok" ? "Grok" : data.profile.aiProvider === "openai" ? "OpenAI" : "your local Ollama"}. Questions use a summary of this household, not a dump of every row. Switch models in Customize.`}
      />
      <Card>
        <div className="max-h-[28rem] space-y-3 overflow-y-auto">
          {data.messages.length === 0 ? <p className="text-sm text-muted">Try “What should I do before the next bill hits?” or “Am I over the grocery plan?”</p> : null}
          {data.messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "ml-8 rounded-2xl bg-honey-soft px-3 py-2 text-sm" : "mr-8 rounded-2xl bg-paper px-3 py-2 text-sm"}>
              {m.content}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={fieldClass} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about these books" onKeyDown={(e) => { if (e.key === "Enter") void ask(); }} />
          <Button disabled={pending} onClick={() => void ask()}>{pending ? "Thinking…" : "Ask"}</Button>
        </div>
        {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const { data, run, isOwner, vaultKey, setVaultKey } = useBook();
  const [pass, setPass] = useState("");
  const [openai, setOpenai] = useState("");
  const [token, setToken] = useState("");
  const [keyName, setKeyName] = useState("Advisor key");
  const [tryOut, setTryOut] = useState("");
  const [cat, setCat] = useState<Partial<Category> | null>(null);
  if (!data) return null;
  const hidden = new Set(data.profile.navHidden.split(",").filter(Boolean));
  const p = data.profile;
  return (
    <div className="space-y-4">
      <PageIntro title="Customize" lede="Names, categories, rules, which pages show up, the advisor, the vault, and the API. The household can be reshaped without waiting on a new version." />
      {isOwner ? (
        <Card>
          <h2 className="font-display text-xl">Household</h2>
          <HouseholdForm />
        </Card>
      ) : null}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Categories</h2>
          {isOwner || data.role === "editor" ? <Button onClick={() => setCat({ name: "", flow: "out", section: "Everyday", monthlyCents: 0, rollover: true, taxSchedule: "", taxLine: "" })}>Add</Button> : null}
        </div>
        <ul className="mt-2 divide-y divide-line text-sm">
          {data.categories.filter((c) => !c.archived).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <span>{c.name} <span className="text-muted">· {c.section} · {c.flow}{c.taxSchedule ? ` · Sch ${c.taxSchedule}` : ""}</span></span>
              <button type="button" className="text-honey-deep" onClick={() => setCat(c)}>Edit</button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-xl">Rules</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.rules.map((r) => (
            <li key={r.id} className="flex justify-between gap-2">
              <span>“{r.pattern}” → {data.categories.find((c) => c.id === r.categoryId)?.name}</span>
              <button type="button" className="text-clay" onClick={() => run({ type: "rule.delete", id: r.id })}>Remove</button>
            </li>
          ))}
        </ul>
      </Card>
      {isOwner ? (
        <Card>
          <h2 className="font-display text-xl">Navigation</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {NAV_IDS.filter((n) => n.id !== "home" && n.id !== "settings").map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!hidden.has(item.id)}
                  onChange={() => {
                    const next = new Set(hidden);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    void run({ type: "profile.update", patch: { navHidden: [...next].join(",") } });
                  }}
                />
                {item.label}
              </label>
            ))}
          </div>
        </Card>
      ) : null}
      {isOwner ? (
        <Card>
          <h2 className="font-display text-xl">Advisor</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Provider">
              <select className={fieldClass} value={p.aiProvider} onChange={(e) => run({ type: "profile.update", patch: { aiProvider: e.target.value as typeof p.aiProvider } })}>
                <option value="grok">Grok</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama on this computer</option>
              </select>
            </Field>
            <Field label="OpenAI model"><input className={fieldClass} defaultValue={p.openaiModel} onBlur={(e) => run({ type: "profile.update", patch: { openaiModel: e.target.value } })} /></Field>
            <Field label="Ollama URL"><input className={fieldClass} defaultValue={p.ollamaUrl} onBlur={(e) => run({ type: "profile.update", patch: { ollamaUrl: e.target.value } })} /></Field>
            <Field label="Ollama model"><input className={fieldClass} defaultValue={p.ollamaModel} onBlur={(e) => run({ type: "profile.update", patch: { ollamaModel: e.target.value } })} /></Field>
            <Field label={p.openaiKeySet ? "Replace OpenAI key" : "OpenAI key"}>
              <input className={fieldClass} type="password" value={openai} onChange={(e) => setOpenai(e.target.value)} placeholder={p.openaiKeySet ? "Saved" : "sk-…"} />
            </Field>
          </div>
          <div className="mt-2 flex gap-2">
            <Button tone="quiet" onClick={() => openai && run({ type: "profile.update", patch: { openaiKey: openai } }).then(() => setOpenai(""))}>Save key</Button>
            {p.openaiKeySet ? <Button tone="danger" onClick={() => run({ type: "profile.update", patch: { openaiKey: "" } })}>Clear key</Button> : null}
          </div>
          <p className="mt-2 text-xs text-muted">Grok uses the app’s own key and only runs when you press Ask. The OpenAI key stays on the server. Ollama is called from your browser, so it can reach localhost.</p>
        </Card>
      ) : null}
      {isOwner ? (
        <Card>
          <h2 className="font-display text-xl">Vault</h2>
          <p className="mt-1 text-sm text-muted">AES-256-GCM. The passphrase never leaves this browser. Lose it and encrypted documents stay unreadable. TLS covers the connection either way.</p>
          {vaultKey ? <p className="mt-2 text-sm">Unlocked for this visit. <button type="button" className="text-honey-deep" onClick={() => setVaultKey(null)}>Lock</button></p> : null}
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const created = await createVault(pass);
              await run({ type: "profile.update", patch: { vaultSalt: created.salt, vaultVerifier: created.verifier } });
              const key = await unlockVault(pass, created.salt, created.verifier);
              setVaultKey(key);
              setPass("");
            }}
          >
            <input className={`${fieldClass} max-w-xs`} type="password" minLength={8} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="New passphrase" />
            <Button type="submit">{p.vaultVerifier ? "Replace vault" : "Create vault"}</Button>
          </form>
        </Card>
      ) : null}
      {isOwner ? (
        <Card>
          <h2 className="font-display text-xl">API & MCP</h2>
          <p className="mt-1 text-sm text-muted">Bearer keys for your own tools. REST lives at /api/v1. MCP is a JSON-RPC post to /api/mcp with methods tools/list and tools/call.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className={`${fieldClass} max-w-xs`} value={keyName} onChange={(e) => setKeyName(e.target.value)} />
            <Button
              onClick={async () => {
                const res = await run({ type: "apikey.create", name: keyName });
                setToken(res.token ?? "");
              }}
            >
              Create key
            </Button>
          </div>
          {token ? <p className="mt-2 break-all rounded-xl bg-honey-soft px-3 py-2 text-sm">Copy this once: {token}</p> : null}
          <ul className="mt-3 text-sm">
            {data.keys.map((k) => (
              <li key={k.id} className="flex justify-between py-1">
                <span>{k.name} · {k.prefix}…</span>
                <button type="button" className="text-clay" onClick={() => run({ type: "apikey.revoke", id: k.id })}>Revoke</button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              tone="quiet"
              onClick={async () => {
                const res = await fetch("/api/v1/summary", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                setTryOut(await res.text());
              }}
            >
              Try summary
            </Button>
          </div>
          {tryOut ? <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-paper p-3 text-xs">{tryOut}</pre> : null}
        </Card>
      ) : null}
      {isOwner ? (
        <Card>
          <h2 className="font-display text-xl">Data</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button tone="quiet" onClick={() => downloadText("honeyjar.json", JSON.stringify(data, null, 2))}>Export everything</Button>
            <Button tone="danger" onClick={() => run({ type: "sample.clear" })}>Clear books</Button>
            <Button tone="quiet" onClick={() => run({ type: "sample.load" })}>Load sample household</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Clear keeps starter categories and your sign-in. Load sample replaces the books with the Calder household.</p>
        </Card>
      ) : null}
      {cat ? <CategoryEditor category={cat} onClose={() => setCat(null)} /> : null}
    </div>
  );
}

function HouseholdForm() {
  const { data, run } = useBook();
  const [name, setName] = useState(data?.profile.displayName ?? "");
  const [currency, setCurrency] = useState(data?.profile.currency ?? "USD");
  const [day, setDay] = useState(String(data?.profile.monthStartDay ?? 1));
  if (!data) return null;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Currency">
        <select className={fieldClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {["USD", "CAD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Month starts on day"><input className={fieldClass} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      <Button onClick={() => run({ type: "profile.update", patch: { displayName: name, currency, monthStartDay: Number(day) || 1 } })}>Save</Button>
    </div>
  );
}

function CategoryEditor({ category, onClose }: { category: Partial<Category>; onClose: () => void }) {
  const { run } = useBook();
  const [name, setName] = useState(category.name ?? "");
  const [section, setSection] = useState(category.section ?? "Everyday");
  const [flow, setFlow] = useState(category.flow ?? "out");
  const [monthly, setMonthly] = useState(centsToInput(category.monthlyCents ?? 0));
  const [rollover, setRollover] = useState(category.rollover !== false);
  const [taxSchedule, setTaxSchedule] = useState(category.taxSchedule ?? "");
  const [taxLine, setTaxLine] = useState(category.taxLine ?? "");
  return (
    <Modal open title="Category" onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Section"><input className={fieldClass} value={section} onChange={(e) => setSection(e.target.value)} /></Field>
      <Field label="Flow">
        <select className={fieldClass} value={flow} onChange={(e) => setFlow(e.target.value)}>
          <option value="out">Spending</option>
          <option value="in">Income</option>
          <option value="transfer">Transfer</option>
        </select>
      </Field>
      <Field label="Monthly plan"><input className={fieldClass} value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} /> Rollover</label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Schedule">
          <select className={fieldClass} value={taxSchedule} onChange={(e) => setTaxSchedule(e.target.value)}>
            <option value="">None</option>
            {["A", "B", "C", "D", "E", "F"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Line"><input className={fieldClass} value={taxLine} onChange={(e) => setTaxLine(e.target.value)} placeholder="charity" /></Field>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await run({
              type: "category.save",
              category: {
                id: category.id,
                name,
                section,
                flow,
                monthlyCents: dollarsToCents(monthly),
                rollover,
                taxSchedule,
                taxLine,
                icon: category.icon ?? "tag",
                sort: category.sort ?? 0,
                archived: false,
              },
            });
            onClose();
          }}
        >
          Save
        </Button>
        {category.id ? <Button tone="danger" onClick={async () => { await run({ type: "category.delete", id: category.id! }); onClose(); }}>Delete</Button> : null}
      </div>
    </Modal>
  );
}
