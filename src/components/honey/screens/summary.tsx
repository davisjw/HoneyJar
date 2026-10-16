import { useNavigate } from "@tanstack/react-router";
import {
  isLiquid,
  ledgerProfit,
  mileageDeductionCents,
  money,
  monthLabel,
  netWorthParts,
  omittedVehicleLines,
  periodEnd,
  periodOf,
  periodStart,
  scheduleD,
  spendingByCategory,
} from "@/lib/honey/calc";
import type { LedgerBook } from "@/lib/honey/types";
import { useBook } from "../book";
import { Card, PageIntro } from "../kit";

function spent(book: LedgerBook, from: string, to: string) {
  return spendingByCategory(book.transactions, book.categories, from, to, "out").reduce((sum, row) => sum + row.cents, 0);
}

function result(book: LedgerBook, from: string, to: string) {
  return ledgerProfit(
    book.transactions,
    book.categories,
    from,
    to,
    mileageDeductionCents(book.trips, from, to),
    omittedVehicleLines(book.trips),
  );
}

function cash(book: LedgerBook) {
  return book.accounts.filter((account) => !account.archived && isLiquid(account.kind)).reduce((sum, account) => sum + account.balanceCents, 0);
}

function openInvoices(book: LedgerBook) {
  return book.invoices.filter((invoice) => invoice.status === "open").reduce((sum, invoice) => sum + invoice.lines.reduce((inner, line) => inner + line.amountCents, 0), 0);
}

export function SummaryPage() {
  const { data, jars, setJar } = useBook();
  const navigate = useNavigate();
  if (!data) return null;
  const startDay = data.profile.monthStartDay;
  const period = periodOf(data.today, startDay);
  const monthFrom = periodStart(period, startDay);
  const monthTo = data.today < periodEnd(period, startDay) ? data.today : periodEnd(period, startDay);
  const year = data.today.slice(0, 4);
  const yearFrom = `${year}-01-01`;
  const yearTo = data.today;
  const monthName = monthLabel(period).replace(/ \d{4}$/, "");
  const cur = data.profile.currency;
  const personalAccounts = jars.filter((book) => book.kind === "personal").flatMap((book) => book.accounts);
  const worth = netWorthParts(personalAccounts, data.assets);
  const deposits = jars.reduce((sum, book) => sum + book.leases.reduce((inner, lease) => inner + lease.depositHeldCents, 0), 0);
  const invoices = jars.reduce((sum, book) => sum + openInvoices(book), 0);
  const gains = scheduleD(data.realizations, Number(year));
  const openJar = (book: LedgerBook) => {
    setJar(book.id);
    navigate({ to: book.kind === "personal" ? "/" : "/business" });
  };
  return (
    <div>
      <PageIntro
        title="All jars"
        lede={`${monthName} beside ${year}. Each card is one jar. A draw is a transfer, not profit, and business or property cash stays out of net worth until you draw it.`}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {jars.map((book) => {
          const held = book.leases.reduce((sum, lease) => sum + lease.depositHeldCents, 0);
          const waiting = openInvoices(book);
          const drew = book.draws.filter((draw) => draw.direction === "draw" && draw.postedOn >= yearFrom && draw.postedOn <= yearTo).reduce((sum, draw) => sum + draw.amountCents, 0);
          if (book.kind === "personal") {
            return (
              <button key={book.id} type="button" onClick={() => openJar(book)} className="rounded-2xl border border-line bg-card p-4 text-left hover:border-honey">
                <p className="text-sm text-muted">Household · {book.name}</p>
                <p className="font-display text-3xl num">{money(cash(book), cur)}</p>
                <p className="text-xs text-muted">Cash on this jar</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-paper p-2"><p className="text-xs text-muted">{monthName}</p><p>Spent {money(spent(book, monthFrom, monthTo), cur)}</p></div>
                  <div className="rounded-xl bg-paper p-2"><p className="text-xs text-muted">{year}</p><p>Spent {money(spent(book, yearFrom, yearTo), cur)}</p></div>
                </div>
                <p className="mt-3 text-sm text-muted">{book.bills.filter((bill) => bill.status === "active").length} bills still coming</p>
              </button>
            );
          }
          const month = result(book, monthFrom, monthTo);
          const ytd = result(book, yearFrom, yearTo);
          const inn = book.kind === "property" ? "Rent" : "In";
          return (
            <button key={book.id} type="button" onClick={() => openJar(book)} className="rounded-2xl border border-line bg-card p-4 text-left hover:border-honey">
              <p className="text-sm text-muted">{book.kind === "property" ? "Property" : "Business"} · {book.name}</p>
              <p className="font-display text-3xl num">{money(ytd.profit, cur)}</p>
              <p className="text-xs text-muted">Profit this year · cash {money(cash(book), cur)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-paper p-2">
                  <p className="text-xs text-muted">{monthName}</p>
                  <p>{inn} {money(month.income, cur)}</p>
                  <p>Out {money(month.expenses, cur)}</p>
                </div>
                <div className="rounded-xl bg-paper p-2">
                  <p className="text-xs text-muted">{year}</p>
                  <p>{inn} {money(ytd.income, cur)}</p>
                  <p>Out {money(ytd.expenses, cur)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted">
                {waiting ? `Open invoices ${money(waiting, cur)}` : "No open invoices"}
                {held ? ` · deposit held ${money(held, cur)}` : ""}
                {drew ? ` · drew home ${money(drew, cur)}` : ""}
              </p>
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Card><p className="text-sm text-muted">Net worth</p><p className="font-display text-2xl num">{money(worth.net, cur)}</p><p className="text-xs text-muted">Household only. Other jars’ cash is not in this.</p></Card>
        <Card><p className="text-sm text-muted">Deposits held</p><p className="font-display text-2xl num">{money(deposits, cur)}</p><p className="text-xs text-muted">Owed back. Not profit.</p></Card>
        <Card><p className="text-sm text-muted">Open invoices</p><p className="font-display text-2xl num">{money(invoices, cur)}</p><p className="text-xs text-muted">{gains.longCents || gains.ordinaryCents ? `Realized this year ${money(gains.ordinaryCents + gains.longCents, cur)}. Not part of a jar’s profit.` : "Nothing waiting to be paid."}</p></Card>
      </div>
    </div>
  );
}
