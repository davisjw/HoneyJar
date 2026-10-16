import { useState } from "react";
import { centsToInput, dollarsToCents, isLiquid, ledgerProfit, mileageDeductionCents, money, omittedVehicleLines, prettyDate, signedMoney, taxLines, vehicleLine, withMileage } from "@/lib/honey/calc";
import type { LedgerBook } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass } from "../kit";

export function BusinessPage() {
  const { data, jar, run, canEdit } = useBook();
  const [txnOpen, setTxnOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  if (!data || !jar || (jar.kind !== "business" && jar.kind !== "property")) return null;
  const book = jar;
  const year = Number(data.today.slice(0, 4));
  const from = `${year}-01-01`;
  const cur = data.profile.currency;
  const personal = data.ledgers.filter((item) => item.kind === "personal" && !item.archived);
  const homeAccounts = personal.flatMap((item) =>
    item.accounts
      .filter((account) => !account.archived && isLiquid(account.kind))
      .map((account) => ({ id: account.id, name: personal.length > 1 ? `${item.name} · ${account.name}` : account.name })),
  );
  return (
    <div>
      <PageIntro
        title={book.name}
        lede={`Schedule ${book.taxForm}${book.activity ? ` · ${book.activity}` : ""}. Profit is income minus expenses. A draw moves cash to a personal jar and is not profit.`}
      />
      <BusinessBook
        book={book}
        year={year}
        from={from}
        to={data.today}
        cur={cur}
        today={data.today}
        canEdit={canEdit}
        homeAccounts={homeAccounts}
        people={data.people.filter((p) => !p.archived)}
        onTxn={() => setTxnOpen(true)}
        onAccount={() => setAccountOpen(true)}
        onDraw={(draw) => run({ type: "biz.draw", ledgerId: book.id, ...draw })}
        onDeleteDraw={(id) => run({ type: "biz.draw.delete", id })}
        onDeleteTxn={(id) => run({ type: "biz.txn.delete", id })}
      />
      {txnOpen ? (
        <TxnModal
          book={book}
          today={data.today}
          people={data.people.filter((p) => !p.archived)}
          onClose={() => setTxnOpen(false)}
          onSave={async (txn) => {
            await run({ type: "biz.txn.save", ledgerId: book.id, txn });
            setTxnOpen(false);
          }}
        />
      ) : null}
      {accountOpen ? (
        <AccountModal
          onClose={() => setAccountOpen(false)}
          onSave={async (account) => {
            await run({ type: "biz.account.save", ledgerId: book.id, account });
            setAccountOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function BusinessBook({
  book,
  year,
  from,
  to,
  cur,
  today,
  canEdit,
  homeAccounts,
  people,
  onTxn,
  onAccount,
  onDraw,
  onDeleteDraw,
  onDeleteTxn,
}: {
  book: LedgerBook;
  year: number;
  from: string;
  to: string;
  cur: string;
  today: string;
  canEdit: boolean;
  homeAccounts: { id: string; name: string }[];
  people: { id: string; name: string }[];
  onTxn: () => void;
  onAccount: () => void;
  onDraw: (draw: { direction: "draw" | "contribution"; amountCents: number; postedOn: string; bizAccountId: string; homeAccountId: string }) => void;
  onDeleteDraw: (id: string) => void;
  onDeleteTxn: (id: string) => void;
}) {
  const logged = book.trips.map((trip) => ({ on: trip.on, milesHundredths: trip.milesHundredths, use: trip.use, parkingCents: trip.parkingCents, tollsCents: trip.tollsCents }));
  const miles = mileageDeductionCents(logged, from, to);
  const omit = omittedVehicleLines(logged);
  const pl = ledgerProfit(book.transactions, book.categories, from, to, miles, omit);
  const lines = withMileage(taxLines(book.transactions, book.categories, year, omit)[book.taxForm as "C" | "E" | "F"] ?? [], miles, vehicleLine(book.taxForm));
  const cash = book.accounts.filter((a) => !a.archived && isLiquid(a.kind)).reduce((s, a) => s + a.balanceCents, 0);
  const operating = book.transactions.filter((t) => book.categories.find((c) => c.id === t.categoryId)?.flow !== "transfer");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><p className="text-sm text-muted">Income</p><p className="font-display text-2xl num">{money(pl.income, cur)}</p></Card>
        <Card><p className="text-sm text-muted">Expenses</p><p className="font-display text-2xl num">{money(pl.expenses, cur)}</p></Card>
        <Card><p className="text-sm text-muted">Profit</p><p className="font-display text-2xl num">{signedMoney(pl.profit, cur)}</p>{miles ? <p className="text-xs text-muted">Includes {money(miles, cur)} of mileage, which is not cash.</p> : null}</Card>
        <Card><p className="text-sm text-muted">Cash here</p><p className="font-display text-2xl num">{money(cash, cur)}</p><p className="text-xs text-muted">Not in household net worth until you draw it.{book.kind === "property" && book.leases.some((lease) => lease.depositHeldCents > 0) ? ` Deposits held ${money(book.leases.reduce((sum, lease) => sum + lease.depositHeldCents, 0), cur)} are owed back.` : ""}</p></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl">Schedule {book.taxForm}</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {lines.length ? lines.map((line) => (
              <li key={line.line} className="flex justify-between py-2">
                <span>{line.line}</span>
                <span className="num">{money(line.cents, cur)}</span>
              </li>
            )) : <li className="py-2 text-muted">Nothing tagged yet this year.</li>}
          </ul>
          {lines.some((line) => line.line === "meals") ? <p className="mt-2 text-xs text-muted">Meals are shown in full. Half is the usual deduction.</p> : null}
          <p className="mt-2 text-xs text-muted">This profit is included in the household tax estimate. It is a worksheet, not a filed return.</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl">Accounts</h2>
            {canEdit ? <Button tone="quiet" onClick={onAccount}>Add</Button> : null}
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {book.accounts.map((account) => (
              <li key={account.id} className="flex justify-between py-2">
                <span>{account.name}<span className="text-muted"> · {account.kind}</span></span>
                <span className="num">{money(account.balanceCents, cur)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Income and expenses</h2>
          {canEdit ? <Button onClick={onTxn}>Add</Button> : null}
        </div>
        <ul className="mt-2 divide-y divide-line text-sm">
          {operating.length ? operating.map((txn) => {
            const cat = book.categories.find((c) => c.id === txn.categoryId);
            const who = people.find((p) => p.id === txn.personId);
            return (
              <li key={txn.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-medium">{txn.merchant}</span>
                  <span className="text-muted">{prettyDate(txn.postedOn)} · {cat?.name ?? "Uncategorized"}{who ? ` · ${who.name}` : ""}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={txn.amountCents > 0 ? "num text-sage" : "num"}>{signedMoney(txn.amountCents, cur)}</span>
                  {canEdit ? <button type="button" className="text-xs text-muted" onClick={() => onDeleteTxn(txn.id)}>Delete</button> : null}
                </span>
              </li>
            );
          }) : <li className="py-2 text-muted">No operating transactions yet.</li>}
        </ul>
      </Card>
      <DrawCard book={book} cur={cur} today={today} canEdit={canEdit} homeAccounts={homeAccounts} onDraw={onDraw} onDelete={onDeleteDraw} />
    </div>
  );
}

function DrawCard({
  book,
  cur,
  today,
  canEdit,
  homeAccounts,
  onDraw,
  onDelete,
}: {
  book: LedgerBook;
  cur: string;
  today: string;
  canEdit: boolean;
  homeAccounts: { id: string; name: string }[];
  onDraw: (draw: { direction: "draw" | "contribution"; amountCents: number; postedOn: string; bizAccountId: string; homeAccountId: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [direction, setDirection] = useState<"draw" | "contribution">("draw");
  const [amount, setAmount] = useState("");
  const [postedOn, setPostedOn] = useState(today);
  const [bizAccountId, setBizAccountId] = useState(book.accounts[0]?.id ?? "");
  const [homeAccountId, setHomeAccountId] = useState(homeAccounts[0]?.id ?? "");
  return (
    <Card>
      <h2 className="font-display text-xl">Owner draws</h2>
      <p className="mt-1 text-sm text-muted">A draw leaves this jar and lands in a personal jar. It is not profit. A contribution is the reverse. Archiving this jar leaves a deposit that already landed.</p>
      <ul className="mt-2 divide-y divide-line text-sm">
        {book.draws.map((draw) => (
          <li key={draw.id} className="flex items-center justify-between gap-3 py-2">
            <span>{prettyDate(draw.postedOn)} · {draw.direction === "contribution" ? "Contribution" : "Draw"}</span>
            <span className="flex items-center gap-3">
              <span className="num">{money(draw.amountCents, cur)}</span>
              {canEdit ? <button type="button" className="text-xs text-muted" onClick={() => onDelete(draw.id)}>Delete</button> : null}
            </span>
          </li>
        ))}
      </ul>
      {canEdit && book.accounts.length && homeAccounts.length ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onDraw({ direction, amountCents: dollarsToCents(amount), postedOn, bizAccountId, homeAccountId });
            setAmount("");
          }}
        >
          <Field label="Direction">
            <select className={fieldClass} value={direction} onChange={(e) => setDirection(e.target.value === "contribution" ? "contribution" : "draw")}>
              <option value="draw">Draw to the household</option>
              <option value="contribution">Contribution from the household</option>
            </select>
          </Field>
          <Field label="Amount">
            <input className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Date">
            <input className={fieldClass} type="date" value={postedOn} onChange={(e) => setPostedOn(e.target.value)} />
          </Field>
          <Field label="Business account">
            <select className={fieldClass} value={bizAccountId} onChange={(e) => setBizAccountId(e.target.value)}>
              {book.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Personal jar account">
            <select className={fieldClass} value={homeAccountId} onChange={(e) => setHomeAccountId(e.target.value)}>
              {homeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Record</Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

function AccountModal({ onClose, onSave }: { onClose: () => void; onSave: (account: { name: string; kind: string }) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("checking");
  return (
    <Modal open title="Account" onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Kind">
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="cash">Cash</option>
          <option value="credit">Credit card</option>
          <option value="mortgage">Mortgage</option>
          <option value="loan">Loan</option>
        </select>
      </Field>
      <Button onClick={() => onSave({ name, kind })}>Save</Button>
    </Modal>
  );
}

function TxnModal({
  book,
  today,
  people,
  onClose,
  onSave,
}: {
  book: LedgerBook;
  today: string;
  people: { id: string; name: string }[];
  onClose: () => void;
  onSave: (txn: { accountId: string; categoryId: string; postedOn: string; amountCents: number; merchant: string; personId: string | null }) => void;
}) {
  const operating = book.categories.filter((c) => c.flow !== "transfer" && !c.archived);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState(operating.find((c) => c.flow === "in")?.id ?? operating[0]?.id ?? "");
  const [postedOn, setPostedOn] = useState(today);
  const [accountId, setAccountId] = useState(book.accounts[0]?.id ?? "");
  const [personId, setPersonId] = useState("");
  const category = operating.find((c) => c.id === direction);
  return (
    <Modal open title="Business transaction" onClose={onClose}>
      <Field label="Merchant"><input className={fieldClass} value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
      <Field label="Category">
        <select className={fieldClass} value={direction} onChange={(e) => setDirection(e.target.value)}>
          {operating.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Amount">
        <input className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={centsToInput(0)} />
      </Field>
      <Field label="Date"><input className={fieldClass} type="date" value={postedOn} onChange={(e) => setPostedOn(e.target.value)} /></Field>
      <Field label="Account">
        <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {book.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Person">
        <select className={fieldClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Household</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Button
        onClick={() => {
          const cents = dollarsToCents(amount);
          const signed = category?.flow === "in" ? Math.abs(cents) : -Math.abs(cents);
          onSave({ accountId, categoryId: direction, postedOn, amountCents: signed, merchant, personId: personId || null });
        }}
      >
        Save
      </Button>
    </Modal>
  );
}
