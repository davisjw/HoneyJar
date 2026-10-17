import { useState } from "react";
import { dollarsToCents, money, prettyDate } from "@/lib/honey/calc";
import type { Lease } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass } from "../kit";

export function LeasesPage() {
  const { data, jar, run, canEdit } = useBook();
  const [open, setOpen] = useState(false);
  const [cash, setCash] = useState<{ lease: Lease; direction: "in" | "out" } | null>(null);
  if (!data || !jar) return null;
  if (jar.kind !== "property") {
    return <PageIntro title="Leases" lede="Leases live on a property jar. Switch to one to keep a tenant, a deposit, and the rent that comes due." />;
  }
  const cur = data.profile.currency;
  const accounts = jar.accounts.filter((account) => !account.archived && account.kind !== "mortgage" && account.kind !== "loan");
  const held = jar.leases.reduce((sum, lease) => sum + lease.depositHeldCents, 0);
  return (
    <div>
      <PageIntro
        title="Leases"
        lede="Rent comes due on the day you set. Each month the lease opens an invoice, and recording the payment posts Schedule E rent. A deposit increases cash and what you owe the tenant. It is not income."
        action={canEdit ? <Button onClick={() => setOpen(true)}>Add lease</Button> : null}
      />
      <Card className="mb-4">
        <p className="text-sm text-muted">Deposits held</p>
        <p className="font-display text-2xl num">{money(held, cur)}</p>
        <p className="text-xs text-muted">Owed back. Not profit, and not part of household net worth.</p>
      </Card>
      <div className="space-y-3">
        {jar.leases.length ? jar.leases.map((lease) => (
          <Card key={lease.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{lease.tenant}{lease.unit ? ` · ${lease.unit}` : ""}</p>
                <p className="text-sm text-muted">
                  {[lease.email, [lease.city, lease.region].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </p>
                <p className="text-sm text-muted">
                  {money(lease.rentCents, cur)} due day {lease.dueDay} · since {prettyDate(lease.startOn)}
                  {lease.endOn ? ` · through ${prettyDate(lease.endOn)}` : ""} · {lease.status}
                </p>
                <p className="text-sm">Deposit held {money(lease.depositHeldCents, cur)} of {money(lease.depositCents, cur)}</p>
              </div>
              {canEdit && lease.status === "active" ? (
                <div className="flex flex-wrap gap-2">
                  <Button tone="quiet" onClick={() => setCash({ lease, direction: "in" })}>Record deposit</Button>
                  {lease.depositHeldCents > 0 ? <Button tone="quiet" onClick={() => setCash({ lease, direction: "out" })}>Return deposit</Button> : null}
                  <button type="button" className="text-sm text-muted" onClick={() => run({ type: "lease.end", id: lease.id })}>End lease</button>
                </div>
              ) : null}
            </div>
          </Card>
        )) : <p className="text-sm text-muted">No leases yet.</p>}
      </div>
      {open ? (
        <LeaseModal
          today={data.today}
          address={jar.activity}
          onClose={() => setOpen(false)}
          onSave={async (lease) => {
            await run({ type: "lease.save", ledgerId: jar.id, lease });
            setOpen(false);
          }}
        />
      ) : null}
      {cash ? (
        <DepositModal
          lease={cash.lease}
          direction={cash.direction}
          today={data.today}
          currency={cur}
          accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
          onClose={() => setCash(null)}
          onSave={async (row) => {
            await run(cash.direction === "in"
              ? { type: "lease.deposit", id: cash.lease.id, ...row }
              : { type: "lease.return", id: cash.lease.id, ...row });
            setCash(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LeaseModal({ today, address, onClose, onSave }: { today: string; address: string; onClose: () => void; onSave: (lease: { tenant: string; email: string; address: string; city: string; region: string; postal: string; unit: string; rentCents: number; dueDay: number; startOn: string; depositCents: number; notes: string }) => void }) {
  const [tenant, setTenant] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState(address);
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [unit, setUnit] = useState("");
  const [rent, setRent] = useState("");
  const [dueDay, setDueDay] = useState("1");
  const [startOn, setStartOn] = useState(today);
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Modal open title="New lease" onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await onSave({
              tenant,
              email,
              address: street,
              city,
              region,
              postal,
              unit,
              rentCents: dollarsToCents(rent),
              dueDay: Number(dueDay) || 1,
              startOn,
              depositCents: dollarsToCents(deposit),
              notes,
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Tenant"><input className={fieldClass} value={tenant} onChange={(e) => setTenant(e.target.value)} /></Field>
        <Field label="Email"><input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Street"><input className={fieldClass} value={street} onChange={(e) => setStreet(e.target.value)} /></Field>
        <Field label="Unit"><input className={fieldClass} value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
        <Field label="City"><input className={fieldClass} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label="State"><input className={fieldClass} value={region} onChange={(e) => setRegion(e.target.value)} /></Field>
        <Field label="Postal code"><input className={fieldClass} value={postal} onChange={(e) => setPostal(e.target.value)} /></Field>
        <Field label="Monthly rent"><input className={fieldClass} inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Due day"><input className={fieldClass} inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></Field>
        <Field label="Starts"><input className={fieldClass} type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} /></Field>
        <Field label="Deposit"><input className={fieldClass} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Note"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Button type="submit" pending={saving}>Save lease</Button></div>
      </form>
    </Modal>
  );
}

function DepositModal({ lease, direction, today, currency, accounts, onClose, onSave }: { lease: Lease; direction: "in" | "out"; today: string; currency: string; accounts: { id: string; name: string }[]; onClose: () => void; onSave: (row: { accountId: string; amountCents: number; postedOn: string }) => void }) {
  const owed = Math.max(0, lease.depositCents - lease.depositHeldCents);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(((direction === "in" ? owed || lease.depositCents : lease.depositHeldCents) / 100).toFixed(2));
  const [postedOn, setPostedOn] = useState(today);
  return (
    <Modal open title={direction === "in" ? "Deposit received" : "Deposit returned"} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        {direction === "in"
          ? `Held now ${money(lease.depositHeldCents, currency)}. This is cash you owe back, not rent.`
          : `Held now ${money(lease.depositHeldCents, currency)}. Returning it is not an expense.`}
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ accountId, amountCents: dollarsToCents(amount), postedOn });
        }}
      >
        <Field label="Account">
          <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </Field>
        <Field label="Amount"><input className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date"><input className={fieldClass} type="date" value={postedOn} onChange={(e) => setPostedOn(e.target.value)} /></Field>
        <Button type="submit">{direction === "in" ? "Record deposit" : "Return deposit"}</Button>
      </form>
    </Modal>
  );
}
