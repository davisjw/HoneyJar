import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ChartTip, RULE, axisTick } from "../charts";
import {
  CHART_COLORS,
  centsToInput,
  dollarsToCents,
  matchCategory,
  money,
  monthLabel,
  parseCsv,
  parseTags,
  periodOf,
  planModel,
  prettyDate,
  projectCash,
  shiftPeriod,
} from "@/lib/honey/calc";
import type { Bill, Txn } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Empty, Field, Modal, MoneyText, PageIntro, fieldClass } from "../kit";

function param(search: string, key: string) {
  return new URLSearchParams(search.replace(/^\?/, "")).get(key) ?? "";
}

export function TransactionsPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [q, setQ] = useState(param(search, "q"));
  const category = param(search, "category");
  const focus = param(search, "txn");
  const personFilter = param(search, "person");
  const tagFilter = param(search, "tag");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Txn> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [accountId, setAccountId] = useState("");
  const [who, setWho] = useState(personFilter);
  const [tag, setTag] = useState(tagFilter);
  useEffect(() => {
    setWho(personFilter);
    setTag(tagFilter);
  }, [personFilter, tagFilter]);
  useEffect(() => {
    if (param(search, "import") === "1") setImportOpen(true);
  }, [search]);
  if (!data) return null;
  const month = periodOf(data.today, data.profile.monthStartDay);
  const rows = data.transactions.filter((t) => {
    if (category && t.categoryId !== category) return false;
    if (who === "household" && t.personId) return false;
    if (who && who !== "household" && t.personId !== who) return false;
    if (tag && !t.tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return false;
    if (!q) return true;
    const hay = `${t.merchant} ${t.memo}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const cur = data.profile.currency;

  function startNew() {
    if (!data) return;
    setEditing({
      accountId: data.accounts.find((a) => !a.archived)?.id ?? "",
      postedOn: data.today,
      amountCents: 0,
      merchant: "",
      memo: "",
      categoryId: null,
      reviewed: true,
    });
    setOpen(true);
  }

  return (
    <div>
      <PageIntro
        title="Transactions"
        lede="Open a row to change it, tag it, or turn the merchant into a rule."
        action={
          canEdit ? (
            <div className="flex gap-2">
              <Button tone="quiet" onClick={() => setImportOpen(true)}>Import CSV</Button>
              <Button onClick={startNew}>Add</Button>
            </div>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={`${fieldClass} max-w-xs`} placeholder="Search merchant" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${fieldClass} max-w-xs`} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Everyone</option>
          <option value="household">Household (shared)</option>
          {data.people.filter((p) => !p.archived).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className={`${fieldClass} max-w-xs`} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Any tag</option>
          {[...new Set(data.transactions.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b)).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {canEdit ? (
          <Button tone="quiet" onClick={() => run({ type: "txn.recategorize" })}>Auto-categorize</Button>
        ) : null}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Merchant</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((t) => (
              <tr key={t.id} className={t.id === focus ? "bg-honey-soft" : "border-t border-line"}>
                <td className="px-4 py-3">{prettyDate(t.postedOn)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-left font-medium"
                    onClick={() => {
                      setEditing({ ...t });
                      setOpen(true);
                    }}
                  >
                    {t.merchant}
                  </button>
                  {t.memo ? <p className="text-xs text-muted">{t.memo}</p> : null}
                  {t.tags.length ? <p className="text-xs text-honey-deep">{t.tags.join(" · ")}</p> : null}
                </td>
                <td className="px-4 py-3">{data.people.find((p) => p.id === t.personId)?.name ?? "Household"}</td>
                <td className="px-4 py-3">{data.categories.find((c) => c.id === t.categoryId)?.name ?? "Uncategorized"}</td>
                <td className="px-4 py-3">{data.accounts.find((a) => a.id === t.accountId)?.name}</td>
                <td className="px-4 py-3 text-right"><MoneyText cents={t.amountCents} currency={cur} signed /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <Empty>Nothing matches.</Empty> : null}
      </Card>
      <p className="mt-2 text-xs text-muted">{rows.length} shown · month context {monthLabel(month)}</p>
      {open && editing ? (
        <TxnEditor
          key={editing.id ?? "new"}
          open
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          initial={editing}
          canEdit={canEdit}
          onSave={async (txn, alsoRule) => {
            await run({ type: "txn.save", txn });
            if (alsoRule && txn.categoryId && txn.merchant) {
              await run({ type: "rule.save", rule: { pattern: txn.merchant, categoryId: txn.categoryId, priority: 15 } });
            }
            setOpen(false);
            setEditing(null);
          }}
          onDelete={async (id) => {
            await run({ type: "txn.delete", id });
            setOpen(false);
            setEditing(null);
          }}
        />
      ) : null}
      <Modal open={importOpen} title="Import a bank CSV" onClose={() => setImportOpen(false)}>
        <Field label="Account">
          <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose</option>
            {data.accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="CSV">
          <textarea className={`${fieldClass} min-h-32 py-2`} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"date,amount,merchant,memo\n2026-10-01,-12.40,Blue Bottle,coffee"} />
        </Field>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
        />
        <Button
          onClick={async () => {
            const parsed = parseCsv(csv);
            if (!accountId || !parsed.length) return;
            await run({ type: "txn.import", accountId, rows: parsed });
            setImportOpen(false);
            setCsv("");
          }}
        >
          Import {parseCsv(csv).length || ""}
        </Button>
      </Modal>
    </div>
  );
}

function TxnEditor({
  open,
  initial,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial: Partial<Txn>;
  canEdit: boolean;
  onClose: () => void;
  onSave: (txn: TxnSave, alsoRule: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { data } = useBook();
  const [merchant, setMerchant] = useState(initial.merchant ?? "");
  const [memo, setMemo] = useState(initial.memo ?? "");
  const [amount, setAmount] = useState(centsToInput(initial.amountCents ?? 0));
  const [postedOn, setPostedOn] = useState(initial.postedOn ?? data?.today ?? "");
  const [accountId, setAccountId] = useState(initial.accountId ?? "");
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [taxSchedule, setTaxSchedule] = useState(initial.taxSchedule ?? "");
  const [taxLine, setTaxLine] = useState(initial.taxLine ?? "");
  const [personId, setPersonId] = useState(initial.personId ?? "");
  const [tags, setTags] = useState(initial.tags ?? []);
  const [alsoRule, setAlsoRule] = useState(false);
  if (!data) return null;
  const guess = matchCategory(merchant, memo, data.rules, data.categories);
  return (
    <Modal open={open} title={initial.id ? merchant || "Transaction" : "New transaction"} onClose={onClose}>
      <Field label="Merchant"><input className={fieldClass} value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
      <Field label="Amount (negative for spending)"><input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date"><input type="date" className={fieldClass} value={postedOn} onChange={(e) => setPostedOn(e.target.value)} /></Field>
        <Field label="Account">
          <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Category">
        <select className={fieldClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Uncategorized</option>
          {data.categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Person">
        <select className={fieldClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Household (shared)</option>
          {data.people.filter((p) => !p.archived).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <TagField
        tags={tags}
        suggestions={data.transactions.flatMap((t) => t.tags)}
        onChange={setTags}
      />
      {guess && guess !== categoryId ? (
        <button type="button" className="text-sm text-honey-deep" onClick={() => setCategoryId(guess)}>
          Suggestion: {data.categories.find((c) => c.id === guess)?.name}
        </button>
      ) : null}
      <Field label="Memo"><input className={fieldClass} value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tax schedule">
          <select className={fieldClass} value={taxSchedule} onChange={(e) => setTaxSchedule(e.target.value)}>
            <option value="">None</option>
            {["A", "B", "C", "D", "E", "F"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Tax line">
          <input className={fieldClass} value={taxLine} onChange={(e) => setTaxLine(e.target.value)} placeholder="mortgage_interest" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={alsoRule} onChange={(e) => setAlsoRule(e.target.checked)} />
        Also remember this merchant
      </label>
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            onClick={() =>
              onSave(
                {
                  id: initial.id,
                  accountId,
                  postedOn,
                  amountCents: dollarsToCents(amount),
                  merchant,
                  memo,
                  categoryId: categoryId || null,
                  taxSchedule,
                  taxLine,
                  reviewed: true,
                  pending: false,
                  source: initial.source ?? "manual",
                  personId: personId || null,
                  tags,
                },
                alsoRule,
              )
            }
          >
            Save
          </Button>
          {initial.id ? <Button tone="danger" onClick={() => onDelete(initial.id!)}>Delete</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}

type TxnSave = {
  id?: string;
  accountId: string;
  postedOn: string;
  amountCents: number;
  merchant: string;
  memo: string;
  categoryId: string | null;
  taxSchedule: string;
  taxLine: string;
  reviewed: boolean;
  pending: boolean;
  source: string;
  personId: string | null;
  tags: string[];
};

function TagField({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const known = [...new Set(suggestions.map((t) => t.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  function add(raw: string) {
    const next = parseTags([...tags, raw]);
    if (next.length === tags.length && !raw.trim()) return;
    onChange(next);
    setDraft("");
  }
  const hint = known.filter((name) => !tags.some((t) => t.toLowerCase() === name.toLowerCase()) && (!draft || name.toLowerCase().includes(draft.toLowerCase()))).slice(0, 6);
  return (
    <div className="space-y-2">
      <span className="text-sm text-muted">Tags</span>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className="rounded-full bg-honey-soft px-2 py-1 text-xs text-ink"
            onClick={() => onChange(tags.filter((x) => x.toLowerCase() !== t.toLowerCase()))}
          >
            {t} ×
          </button>
        ))}
      </div>
      <input
        className={fieldClass}
        value={draft}
        placeholder="Type a tag and press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          }
        }}
      />
      {hint.length ? (
        <div className="flex flex-wrap gap-1">
          {hint.map((name) => (
            <button key={name} type="button" className="rounded-full border border-line px-2 py-1 text-xs" onClick={() => add(name)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BillsPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const focus = param(search, "bill");
  const [editing, setEditing] = useState<Partial<Bill> | null>(null);
  const [pay, setPay] = useState<Bill | null>(null);
  const [amount, setAmount] = useState("");
  if (!data) return null;
  const groups = [
    ["Due & bills", data.bills.filter((b) => b.kind === "bill")],
    ["Subscriptions", data.bills.filter((b) => b.kind === "subscription")],
    ["Utilities", data.bills.filter((b) => b.kind === "utility")],
  ] as const;
  return (
    <div>
      <PageIntro
        title="Bills"
        lede="Subscriptions, utilities, and the rest. Recording a payment writes the transaction and moves the next due date."
        action={canEdit ? <Button onClick={() => setEditing({ direction: "out", kind: "bill", cadence: "monthly", nextDue: data.today, amountCents: 0, status: "active" })}>Add</Button> : null}
      />
      <div className="space-y-5">
        {groups.map(([label, list]) => (
          <section key={label}>
            <h2 className="mb-2 text-sm text-muted">{label}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((b) => (
                <Card key={b.id} className={b.id === focus ? "ring-2 ring-honey" : ""}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-sm text-muted">{prettyDate(b.nextDue)} · {b.cadence}{b.autopay ? " · autopay" : ""}{b.status === "paused" ? " · paused" : ""}{b.personId ? ` · ${data.people.find((p) => p.id === b.personId)?.name ?? ""}` : ""}</p>
                    </div>
                    <p className="num font-display text-xl">{b.direction === "in" ? "+" : ""}{money(b.amountCents, data.profile.currency)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canEdit && b.status === "active" ? (
                      <Button onClick={() => { setPay(b); setAmount(centsToInput(b.amountCents)); }}>
                        {b.direction === "in" ? "Record deposit" : "Record payment"}
                      </Button>
                    ) : null}
                    <Button tone="quiet" onClick={() => setEditing(b)}>Edit</Button>
                    {b.url ? <a className="inline-flex min-h-11 items-center text-sm text-honey-deep" href={b.url} target="_blank" rel="noreferrer">Site</a> : null}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
      {editing ? <BillEditor key={editing.id ?? "new"} bill={editing} onClose={() => setEditing(null)} /> : null}
      <Modal open={!!pay} title={pay ? `Pay ${pay.name}` : "Pay"} onClose={() => setPay(null)}>
        <Field label="Amount">
          <input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Button
          onClick={async () => {
            if (!pay) return;
            await run({ type: "bill.pay", id: pay.id, amountCents: dollarsToCents(amount), paidOn: data.today });
            setPay(null);
          }}
        >
          Record
        </Button>
      </Modal>
    </div>
  );
}

function BillEditor({ bill, onClose }: { bill: Partial<Bill>; onClose: () => void }) {
  const { data, run, canEdit } = useBook();
  const [name, setName] = useState(bill.name ?? "");
  const [payee, setPayee] = useState(bill.payee ?? "");
  const [amount, setAmount] = useState(centsToInput(bill.amountCents ?? 0));
  const [principal, setPrincipal] = useState(bill.principalCents == null ? "" : centsToInput(bill.principalCents));
  const [kind, setKind] = useState(bill.kind ?? "bill");
  const [direction, setDirection] = useState(bill.direction ?? "out");
  const [cadence, setCadence] = useState(bill.cadence ?? "monthly");
  const [nextDue, setNextDue] = useState(bill.nextDue ?? "");
  const [accountId, setAccountId] = useState(bill.accountId ?? "");
  const [debtAccountId, setDebtAccountId] = useState(bill.debtAccountId ?? "");
  const [categoryId, setCategoryId] = useState(bill.categoryId ?? "");
  const [autopay, setAutopay] = useState(!!bill.autopay);
  const [status, setStatus] = useState(bill.status ?? "active");
  const [notes, setNotes] = useState(bill.notes ?? "");
  const [personId, setPersonId] = useState(bill.personId ?? "");
  if (!data) return null;
  return (
    <Modal open title={bill.id ? "Edit bill" : "New bill"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Payee"><input className={fieldClass} value={payee} onChange={(e) => setPayee(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount"><input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Principal (optional)"><input className={fieldClass} value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Kind">
          <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="bill">Bill</option>
            <option value="subscription">Subscription</option>
            <option value="utility">Utility</option>
          </select>
        </Field>
        <Field label="Direction">
          <select className={fieldClass} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="out">Out</option>
            <option value="in">Income</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cadence">
          <select className={fieldClass} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {["weekly", "biweekly", "monthly", "quarterly", "yearly"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Next due"><input type="date" className={fieldClass} value={nextDue} onChange={(e) => setNextDue(e.target.value)} /></Field>
      </div>
      <Field label="Pay from">
        <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">None</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Linked debt">
        <select className={fieldClass} value={debtAccountId} onChange={(e) => setDebtAccountId(e.target.value)}>
          <option value="">None</option>
          {data.accounts.filter((a) => a.kind === "loan" || a.kind === "mortgage" || a.kind === "credit").map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Category">
        <select className={fieldClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">None</option>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Whose bill">
        <select className={fieldClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Household</option>
          {data.people.filter((p) => !p.archived).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} /> Autopay</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={status === "paused"} onChange={(e) => setStatus(e.target.checked ? "paused" : "active")} /> Paused</label>
      <Field label="Notes"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              await run({
                type: "bill.save",
                bill: {
                  id: bill.id,
                  name,
                  payee,
                  amountCents: dollarsToCents(amount),
                  principalCents: principal ? dollarsToCents(principal) : null,
                  kind,
                  direction,
                  cadence,
                  nextDue,
                  accountId: accountId || null,
                  debtAccountId: debtAccountId || null,
                  categoryId: categoryId || null,
                  autopay,
                  status,
                  notes,
                  variable: bill.variable ?? false,
                  url: bill.url ?? "",
                  personId: personId || null,
                },
              });
              onClose();
            }}
          >
            Save
          </Button>
          {bill.id ? <Button tone="danger" onClick={async () => { await run({ type: "bill.delete", id: bill.id! }); onClose(); }}>Delete</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}

export function PlanPage() {
  const { data, run, canEdit } = useBook();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const focus = param(search, "category");
  const [cursor, setCursor] = useState<string | null>(null);
  if (!data) return null;
  const month = cursor ?? periodOf(data.today, data.profile.monthStartDay);
  const plan = planModel(data.categories, data.transactions, data.plan, month, data.profile.monthStartDay);
  const cur = data.profile.currency;
  return (
    <div>
      <PageIntro
        title="Spending plan"
        lede="Assign the month, then what’s left in each envelope is what you can still spend. Rollover carries the leftover — or the overage — forward."
        action={
          <div className="flex gap-2">
            <Button tone="quiet" onClick={() => setCursor(shiftPeriod(month, -1))}>Prev</Button>
            <Button tone="quiet" onClick={() => setCursor(shiftPeriod(month, 1))}>Next</Button>
          </div>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">{monthLabel(month)} income</p><p className="font-display text-2xl num">{money(plan.income, cur)}</p></Card>
        <Card><p className="text-sm text-muted">Left to assign</p><p className="font-display text-2xl num">{money(plan.leftToAssign, cur)}</p></Card>
        <Card><p className="text-sm text-muted">Left in the plan</p><p className="font-display text-2xl num">{money(plan.leftInPlan, cur)}</p></Card>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Rolled in</th>
              <th className="px-4 py-3 font-medium">Assigned</th>
              <th className="px-4 py-3 font-medium">Spent</th>
              <th className="px-4 py-3 font-medium">Available</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={row.category.id} className={row.category.id === focus ? "bg-honey-soft" : "border-t border-line"}>
                <td className="px-4 py-3">
                  <a className="font-medium" href={`/transactions?category=${row.category.id}`}>{row.category.name}</a>
                  <p className="text-xs text-muted">{row.category.rollover ? "Rolls over" : "Resets"} · {row.category.section}</p>
                </td>
                <td className="px-4 py-3 num">{money(row.rolloverIn, cur)}</td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <input
                      className="w-28 rounded-lg border border-line px-2 py-1"
                      defaultValue={centsToInput(row.assigned)}
                      key={`${row.category.id}-${month}-${row.assigned}`}
                      onBlur={(e) => {
                        const next = dollarsToCents(e.target.value);
                        if (next !== row.assigned) run({ type: "plan.set", categoryId: row.category.id, month, assignedCents: next });
                      }}
                    />
                  ) : (
                    money(row.assigned, cur)
                  )}
                </td>
                <td className="px-4 py-3 num">{money(row.spent, cur)}</td>
                <td className={`px-4 py-3 num ${row.available < 0 ? "text-clay" : "text-sage"}`}>{money(row.available, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function CashflowPage() {
  const { data } = useBook();
  const [days, setDays] = useState(180);
  const chart = useMemo(() => {
    if (!data) return null;
    return projectCash({
      today: data.today,
      days,
      accounts: data.accounts,
      bills: data.bills,
      categories: data.categories,
      startDay: data.profile.monthStartDay,
    });
  }, [data, days]);
  if (!data || !chart) return null;
  const cur = data.profile.currency;
  const sampled = chart.points.filter((_, i) => i % Math.ceil(chart.points.length / 80) === 0);
  const cashBands = [...chart.accounts].sort((a, b) => (chart.points[0]?.byAccount[b.id] ?? 0) - (chart.points[0]?.byAccount[a.id] ?? 0));
  return (
    <div>
      <PageIntro
        title="Projected cash"
        lede="Checking, savings, and cash, one band per account. Bills land on the account they’re paid from. Anything without an account comes out of the largest checking account."
        action={
          <div className="flex gap-2">
            {[90, 180, 365].map((d) => (
              <Button key={d} tone={days === d ? "primary" : "quiet"} onClick={() => setDays(d)}>{d === 365 ? "1 year" : `${d}d`}</Button>
            ))}
          </div>
        }
      />
      <Card>
        <p className="text-sm text-muted">Lowest balance</p>
        <p className="font-display text-4xl num">{money(chart.low.balance, cur)}</p>
        <p className="text-sm text-muted">{prettyDate(chart.low.date)} · {chart.low.label}</p>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sampled.map((p) => ({ date: p.date, ...p.byAccount }))}>
              <CartesianGrid vertical={false} stroke={RULE} />
              <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} minTickGap={24} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip content={(props) => <ChartTip active={props.active} label={props.label} payload={props.payload} format={(n) => money(n, cur)} total />} />
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
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {cashBands.map((account, i) => (
            <li key={account.id}><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{account.name}</li>
          ))}
        </ul>
      </Card>
      <Card className="mt-4">
        <h2 className="font-display text-xl">Events</h2>
        <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto text-sm">
          {chart.events.slice(0, 80).map((e, i) => (
            <li key={`${e.date}-${e.label}-${i}`} className="flex justify-between gap-3 py-2">
              <span>{prettyDate(e.date)} · {e.label}</span>
              <MoneyText cents={e.cents} currency={cur} signed />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
