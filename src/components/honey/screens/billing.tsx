import { useState } from "react";
import { dollarsToCents, mileageBasisCents, mileageDeductionCents, money, prettyDate, tripDeductionCents } from "@/lib/honey/calc";
import type { Invoice, InvoiceLine } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass } from "../kit";

function milesText(hundredths: number) {
  return (hundredths / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function milesToHundredths(input: string) {
  const n = Number(input.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function invoiceTotal(invoice: Invoice) {
  return invoice.lines.reduce((sum, line) => sum + line.amountCents, 0);
}

export function InvoicesPage() {
  const { data, jar, run, canEdit } = useBook();
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  if (!data || !jar || (jar.kind !== "business" && jar.kind !== "property")) return null;
  const cur = data.profile.currency;
  const accounts = jar.accounts.filter((account) => !account.archived);
  return (
    <div>
      <PageIntro
        title="Invoices"
        lede="A bill you send from this jar. The client’s name and address stay on the invoice. Recording a payment posts the total as income here. It does not appear on a personal jar."
        action={canEdit ? <Button onClick={() => setOpen(true)}>New invoice</Button> : null}
      />
      <Card>
        <ul className="divide-y divide-line text-sm">
          {jar.invoices.length ? jar.invoices.map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{invoice.number} · {invoice.client}</p>
                <p className="text-muted">
                  {[invoice.clientEmail, [invoice.clientCity, invoice.clientRegion].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </p>
                <p className="text-muted">
                  Due {prettyDate(invoice.dueOn)} · {invoice.status}
                  {invoice.status === "open" && invoice.dueOn < data.today ? " · past due" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="num">{money(invoiceTotal(invoice), cur)}</span>
                {canEdit && invoice.status === "open" ? (
                  <Button tone="quiet" onClick={() => setPaying(invoice)}>Record payment</Button>
                ) : null}
                {canEdit && invoice.status !== "void" ? (
                  <button type="button" className="text-muted" onClick={() => run({ type: "invoice.void", id: invoice.id })}>Void</button>
                ) : null}
              </div>
            </li>
          )) : <li className="py-2 text-muted">No invoices yet.</li>}
        </ul>
      </Card>
      {open ? (
        <InvoiceModal
          today={data.today}
          onClose={() => setOpen(false)}
          onSave={async (invoice) => {
            await run({ type: "invoice.save", ledgerId: jar.id, invoice });
            setOpen(false);
          }}
        />
      ) : null}
      {paying ? (
        <PayModal
          invoice={paying}
          today={data.today}
          currency={cur}
          accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
          onClose={() => setPaying(null)}
          onPay={async (payment) => {
            await run({ type: "invoice.pay", id: paying.id, ...payment });
            setPaying(null);
          }}
        />
      ) : null}
    </div>
  );
}

function InvoiceModal({ today, onClose, onSave }: { today: string; onClose: () => void; onSave: (invoice: { client: string; clientEmail: string; clientAddress: string; clientCity: string; clientRegion: string; clientPostal: string; issuedOn: string; dueOn: string; notes: string; lines: InvoiceLine[] }) => void }) {
  const [client, setClient] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientRegion, setClientRegion] = useState("");
  const [clientPostal, setClientPostal] = useState("");
  const [issuedOn, setIssuedOn] = useState(today);
  const [dueOn, setDueOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ description: "", amount: "" }]);
  return (
    <Modal open title="New invoice" onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            client,
            clientEmail,
            clientAddress,
            clientCity,
            clientRegion,
            clientPostal,
            issuedOn,
            dueOn,
            notes,
            lines: lines.map((line) => ({ description: line.description, amountCents: dollarsToCents(line.amount) })),
          });
        }}
      >
        <Field label="Client"><input className={fieldClass} value={client} onChange={(e) => setClient(e.target.value)} /></Field>
        <Field label="Email"><input className={fieldClass} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="name@client.example" /></Field>
        <Field label="Street"><input className={fieldClass} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} /></Field>
        <Field label="City"><input className={fieldClass} value={clientCity} onChange={(e) => setClientCity(e.target.value)} /></Field>
        <Field label="State"><input className={fieldClass} value={clientRegion} onChange={(e) => setClientRegion(e.target.value)} /></Field>
        <Field label="Postal code"><input className={fieldClass} value={clientPostal} onChange={(e) => setClientPostal(e.target.value)} /></Field>
        <Field label="Issued"><input className={fieldClass} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></Field>
        <Field label="Due"><input className={fieldClass} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></Field>
        <Field label="Note"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <Field label={index === 0 ? "Description" : "Another line"}>
              <input className={fieldClass} value={line.description} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
            </Field>
            <Field label="Amount">
              <input className={fieldClass} inputMode="decimal" value={line.amount} placeholder="0.00" onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} />
            </Field>
          </div>
        ))}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="button" tone="quiet" onClick={() => setLines([...lines, { description: "", amount: "" }])}>Add line</Button>
          <Button type="submit">Save invoice</Button>
        </div>
      </form>
    </Modal>
  );
}

function PayModal({ invoice, today, currency, accounts, onClose, onPay }: { invoice: Invoice; today: string; currency: string; accounts: { id: string; name: string }[]; onClose: () => void; onPay: (payment: { accountId: string; paidOn: string }) => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [paidOn, setPaidOn] = useState(today);
  return (
    <Modal open title={`Payment for ${invoice.number}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">{money(invoiceTotal(invoice), currency)} posts as income. It is not a household deposit.</p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onPay({ accountId, paidOn });
        }}
      >
        <Field label="Business account">
          <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </Field>
        <Field label="Paid on"><input className={fieldClass} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Button type="submit">Record payment</Button>
      </form>
    </Modal>
  );
}

export function MileagePage() {
  const { data, jar, run, canEdit } = useBook();
  const [on, setOn] = useState(data?.today ?? "");
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [use, setUse] = useState("business");
  const [miles, setMiles] = useState("");
  const [parking, setParking] = useState("");
  const [tolls, setTolls] = useState("");
  if (!data || !jar || (jar.kind !== "business" && jar.kind !== "property")) return null;
  const year = data.today.slice(0, 4);
  const from = `${year}-01-01`;
  const trips = jar.trips.map((trip) => ({ on: trip.on, milesHundredths: trip.milesHundredths, use: trip.use, parkingCents: trip.parkingCents, tollsCents: trip.tollsCents }));
  const deduction = mileageDeductionCents(trips, from, data.today);
  const basis = mileageBasisCents(trips, from, data.today);
  const yearMiles = trips.filter((trip) => trip.on >= from && trip.on <= data.today && trip.use !== "commute" && trip.use !== "personal").reduce((sum, trip) => sum + trip.milesHundredths, 0);
  const cur = data.profile.currency;
  return (
    <div>
      <PageIntro
        title="Mileage"
        lede="Only business miles count. A commute from home to your regular workplace does not. Each trip needs a date, destination, purpose, and miles, written down at the time. Parking and tolls for a business trip are allowed on top of the rate. The rate is 72.5¢ a mile through June 30, 2026 and 76¢ after that. Once this log has business miles, gas, repairs, and depreciation recorded as car expenses are left off the schedule. Choose this method the first year the car is used for the business. A leased car stays on it for the whole lease. The deduction is not cash."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Business miles</p><p className="font-display text-2xl num">{milesText(yearMiles)}</p></Card>
        <Card><p className="text-sm text-muted">Deduction</p><p className="font-display text-2xl num">{money(deduction, cur)}</p><p className="text-xs text-muted">Rate, plus parking and tolls.</p></Card>
        <Card><p className="text-sm text-muted">Basis reduction</p><p className="font-display text-2xl num">{money(basis, cur)}</p><p className="text-xs text-muted">35¢ of the 2026 rate is depreciation. Already inside the deduction, not added again.</p></Card>
      </div>
      {canEdit ? (
        <Card className="mb-4">
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await run({
                type: "mileage.save",
                ledgerId: jar.id,
                trip: { on, purpose, destination, use, milesHundredths: milesToHundredths(miles), parkingCents: dollarsToCents(parking), tollsCents: dollarsToCents(tolls) },
              });
              setPurpose("");
              setDestination("");
              setMiles("");
              setParking("");
              setTolls("");
            }}
          >
            <Field label="Date"><input className={fieldClass} type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
            <Field label="Use">
              <select className={fieldClass} value={use} onChange={(e) => setUse(e.target.value)}>
                <option value="business">Business</option>
                <option value="commute">Commute</option>
                <option value="personal">Personal</option>
              </select>
            </Field>
            <Field label="Miles"><input className={fieldClass} inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="0.0" /></Field>
            <Field label="Destination"><input className={fieldClass} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Client office" /></Field>
            <Field label="Purpose"><input className={fieldClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Deliver a proof" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Parking"><input className={fieldClass} inputMode="decimal" value={parking} onChange={(e) => setParking(e.target.value)} placeholder="0.00" /></Field>
              <Field label="Tolls"><input className={fieldClass} inputMode="decimal" value={tolls} onChange={(e) => setTolls(e.target.value)} placeholder="0.00" /></Field>
            </div>
            <div className="sm:col-span-3"><Button type="submit">Add trip</Button></div>
          </form>
        </Card>
      ) : null}
      <Card>
        <ul className="divide-y divide-line text-sm">
          {jar.trips.length ? jar.trips.map((trip) => {
            const deductible = trip.use !== "commute" && trip.use !== "personal";
            const amount = deductible ? tripDeductionCents(trip.on, trip.milesHundredths) + trip.parkingCents + trip.tollsCents : 0;
            return (
              <li key={trip.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {prettyDate(trip.on)} · {trip.destination || trip.purpose}
                  <span className="text-muted"> · {trip.use === "commute" ? "commute, not deductible" : trip.use === "personal" ? "personal, not deductible" : trip.purpose}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="num">{milesText(trip.milesHundredths)} mi{deductible ? ` · ${money(amount, cur)}` : ""}</span>
                  {canEdit ? <button type="button" className="text-muted" onClick={() => run({ type: "mileage.delete", id: trip.id })}>Remove</button> : null}
                </span>
              </li>
            );
          }) : <li className="py-2 text-muted">No trips yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
