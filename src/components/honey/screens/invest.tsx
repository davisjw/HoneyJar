import { useState } from "react";
import {
  centsToInput,
  dollarsToCents,
  formatShares,
  hitMonth,
  latestPrice,
  lotMarketCents,
  money,
  portfolioPerformance,
  prettyDate,
  projectBalance,
  sharesToMicros,
  signedMoney,
} from "@/lib/honey/calc";
import type { Account, Lot, PortfolioFlow, RetirementSketch, SecurityPrice } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass } from "../kit";

const FLOW_KINDS = [
  ["buy", "Buy"],
  ["contribution", "Contribution"],
  ["withdrawal", "Withdrawal"],
  ["dividend", "Dividend"],
  ["fee", "Fee"],
] as const;

function pct(rate: number | null) {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function PortfolioPage() {
  const { data, run, canEdit } = useBook();
  const [lot, setLot] = useState<Partial<Lot> | null>(null);
  const [price, setPrice] = useState<Partial<SecurityPrice> | null>(null);
  const [flow, setFlow] = useState<Partial<PortfolioFlow> | null>(null);
  const [sketch, setSketch] = useState<Partial<RetirementSketch> | null>(null);
  const [sell, setSell] = useState<Lot | null>(null);
  if (!data) return null;
  const perf = portfolioPerformance({ lots: data.lots, prices: data.prices, flows: data.flows, today: data.today });
  const cur = data.profile.currency;
  const investmentAccounts = data.accounts.filter((a) => !a.archived && a.kind === "investment");
  const accountValue = investmentAccounts.reduce((s, a) => s + a.balanceCents, 0);
  const open = data.lots.filter((l) => !l.closedOn);
  const symbols = [...new Set(open.map((l) => l.symbol))];
  return (
    <div>
      <PageIntro
        title="Portfolio"
        lede="Lots, the prices you type, and the cash that moved in or out. Returns use those dates. Nothing here calls a market."
        action={canEdit ? <Button onClick={() => setLot({ acquiredOn: data.today, sharesMicros: 0, costCents: 0 })}>Add lot</Button> : null}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">Market value</p>
          <p className="font-display text-3xl num">{money(perf.marketCents, cur)}</p>
          <p className="text-xs text-muted">Cost {money(perf.costCents, cur)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Unrealized</p>
          <p className="font-display text-3xl num">{money(perf.gainCents, cur)}</p>
          <p className="text-xs text-muted">{perf.unpriced.length ? `Priced at cost: ${perf.unpriced.join(", ")}` : "Using your latest price on or before today"}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Time-weighted</p>
          <p className="font-display text-3xl num">{pct(perf.dietzAnnual)}</p>
          <p className="text-xs text-muted">Annualized Dietz. {pct(perf.dietz)} since {perf.since ? prettyDate(perf.since) : "the first flow"}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Money-weighted</p>
          <p className="font-display text-3xl num">{pct(perf.irr)}</p>
          <p className="text-xs text-muted">IRR, with today’s value treated as if sold</p>
        </Card>
      </div>
      <Card className="mt-4">
        <p className="text-sm">
          Net worth still uses the investment account balance ({money(accountValue, cur)}), not this market value. Copy a balance over only when you want the books to match the lots.
        </p>
        {canEdit && investmentAccounts.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {investmentAccounts.map((a) => (
              <Button key={a.id} tone="quiet" onClick={() => run({ type: "portfolio.sync", accountId: a.id })}>
                Set {a.name} from its lots
              </Button>
            ))}
          </div>
        ) : null}
        <p className="mt-3 text-sm text-muted">Dividends recorded on flows this year: {money(perf.dividendsYtd, cur)}. A dividend marked “record in the books” also posts cash and a Schedule B line.</p>
      </Card>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Holdings</h2>
        </div>
        {symbols.length === 0 ? <p className="text-sm text-muted">No open lots yet.</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {symbols.map((symbol) => {
            const rows = open.filter((l) => l.symbol === symbol);
            const shares = rows.reduce((s, l) => s + l.sharesMicros, 0);
            const cost = rows.reduce((s, l) => s + l.costCents, 0);
            const px = latestPrice(data.prices, symbol, data.today);
            const value = rows.reduce((s, l) => s + lotMarketCents(l, px).cents, 0);
            return (
              <Card key={symbol}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{symbol}</p>
                    <p className="text-sm text-muted">{rows[0]?.name} · {formatShares(shares)} shares</p>
                  </div>
                  <p className="num font-display text-xl">{money(value, cur)}</p>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {px == null ? "No price yet, so this is cost." : `${money(px, cur)} / share`} · cost {money(cost, cur)}
                </p>
              </Card>
            );
          })}
        </div>
        <ul className="mt-3 divide-y divide-line text-sm">
          {data.lots.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {row.symbol} · {formatShares(row.sharesMicros)} · {prettyDate(row.acquiredOn)}
                {row.closedOn ? ` · closed ${prettyDate(row.closedOn)}` : ""}
              </span>
              <span className="flex items-center gap-3">
                <span className="num">{money(row.costCents, cur)}</span>
                {canEdit && !row.closedOn ? <button type="button" className="text-honey-deep" onClick={() => setSell(row)}>Sell</button> : null}
                {canEdit ? <button type="button" className="text-honey-deep" onClick={() => setLot(row)}>Edit</button> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-xl">Realized</h2>
        <p className="mb-2 text-sm text-muted">A sale uses the lot’s average cost. Held a year or more is long-term. The gain is not cash. The proceeds are, and they land in the account. Schedule D on a personal jar picks this up.</p>
        <ul className="divide-y divide-line text-sm">
          {data.realizations.length ? data.realizations.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <span>{prettyDate(row.soldOn)} · {row.symbol} · {formatShares(row.sharesMicros)} · {row.term}</span>
              <span className="num">{signedMoney(row.gainCents, cur)}</span>
            </li>
          )) : <li className="py-2 text-muted">No sales yet.</li>}
        </ul>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl">Prices you typed</h2>
          {canEdit ? <Button tone="quiet" onClick={() => setPrice({ asOf: data.today, priceCents: 0 })}>Add price</Button> : null}
        </div>
        <ul className="divide-y divide-line text-sm">
          {[...data.prices].sort((a, b) => b.asOf.localeCompare(a.asOf)).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <span>{row.symbol} · {prettyDate(row.asOf)}</span>
              <span className="flex items-center gap-3">
                <span className="num">{money(row.priceCents, cur)}</span>
                {canEdit ? (
                  <>
                    <button type="button" className="text-honey-deep" onClick={() => setPrice(row)}>Edit</button>
                    <button type="button" className="text-clay" onClick={() => run({ type: "price.delete", id: row.id })}>Delete</button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl">Cash flows</h2>
          {canEdit ? <Button tone="quiet" onClick={() => setFlow({ kind: "dividend", postedOn: data.today, amountCents: 0, external: true })}>Add flow</Button> : null}
        </div>
        <p className="mb-2 text-sm text-muted">Buys and contributions are money in. Withdrawals, dividends, and fees are money out. A reinvested dividend should stay off “cash left the portfolio,” and the new shares should be their own lot.</p>
        <ul className="divide-y divide-line text-sm">
          {[...data.flows].sort((a, b) => b.postedOn.localeCompare(a.postedOn)).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{prettyDate(row.postedOn)} · {row.kind}{row.symbol ? ` · ${row.symbol}` : ""}{row.external ? "" : " · inside"}{row.transactionId ? " · in the books" : ""}</span>
              <span className="flex items-center gap-3">
                <span className="num">{money(row.amountCents, cur)}</span>
                {canEdit && row.kind !== "sell" ? (
                  <>
                    <button type="button" className="text-honey-deep" onClick={() => setFlow(row)}>Edit</button>
                    <button type="button" className="text-clay" onClick={() => run({ type: "flow.delete", id: row.id })}>Delete</button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Retirement sketch</h2>
          {canEdit ? <Button tone="quiet" onClick={() => setSketch({ name: "Retirement", monthlyCents: 0, annualReturnBps: 600, years: 25, targetCents: 0, usePortfolio: true, startCents: 0 })}>Add sketch</Button> : null}
        </div>
        <p className="mb-3 text-sm text-muted">A straight line at one return. Not a plan, not a Monte Carlo, and it ignores the order of bad years.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {data.sketches.map((row) => {
            const start = row.usePortfolio ? perf.marketCents : row.startCents;
            const points = projectBalance({ currentCents: start, monthlyCents: row.monthlyCents, annualReturnBps: row.annualReturnBps, months: row.years * 12 });
            const end = points[points.length - 1]?.balanceCents ?? start;
            const hit = row.targetCents ? hitMonth(points, row.targetCents) : null;
            return (
              <Card key={row.id}>
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{row.name}</p>
                  {canEdit ? <button type="button" className="text-sm text-honey-deep" onClick={() => setSketch(row)}>Edit</button> : null}
                </div>
                <p className="mt-2 font-display text-2xl num">{money(end, cur)}</p>
                <p className="text-sm text-muted">
                  After {row.years} years, from {money(start, cur)}, adding {money(row.monthlyCents, cur)} a month at {(row.annualReturnBps / 100).toFixed(2)}%.
                </p>
                <p className="mt-1 text-sm">{row.targetCents ? (hit ? `Reaches ${money(row.targetCents, cur)} in about ${hit} months.` : `Does not reach ${money(row.targetCents, cur)} in this window.`) : "No target set."}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {lot ? <LotEditor lot={lot} accounts={data.accounts} onClose={() => setLot(null)} /> : null}
      {sell ? <SellEditor lot={sell} today={data.today} onClose={() => setSell(null)} /> : null}
      {price ? <PriceEditor price={price} today={data.today} onClose={() => setPrice(null)} /> : null}
      {flow ? <FlowEditor flow={flow} accounts={data.accounts} onClose={() => setFlow(null)} /> : null}
      {sketch ? <SketchEditor sketch={sketch} onClose={() => setSketch(null)} /> : null}
    </div>
  );
}

function SellEditor({ lot, today, onClose }: { lot: Lot; today: string; onClose: () => void }) {
  const { run } = useBook();
  const [soldOn, setSoldOn] = useState(today);
  const [shares, setShares] = useState(formatShares(lot.sharesMicros));
  const [proceeds, setProceeds] = useState("");
  return (
    <Modal open title={`Sell ${lot.symbol}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">{formatShares(lot.sharesMicros)} shares open. Basis is the average cost of this lot. Proceeds are added to its account.</p>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await run({ type: "lot.sell", id: lot.id, soldOn, sharesMicros: sharesToMicros(shares), proceedsCents: dollarsToCents(proceeds), accountId: lot.accountId ?? "" });
          onClose();
        }}
      >
        <Field label="Sold"><input type="date" className={fieldClass} value={soldOn} onChange={(e) => setSoldOn(e.target.value)} /></Field>
        <Field label="Shares"><input className={fieldClass} value={shares} onChange={(e) => setShares(e.target.value)} /></Field>
        <Field label="Proceeds"><input className={fieldClass} inputMode="decimal" value={proceeds} onChange={(e) => setProceeds(e.target.value)} placeholder="0.00" /></Field>
        <Button type="submit">Record sale</Button>
      </form>
    </Modal>
  );
}

function LotEditor({ lot, accounts, onClose }: { lot: Partial<Lot>; accounts: Account[]; onClose: () => void }) {
  const { run, canEdit } = useBook();
  const [symbol, setSymbol] = useState(lot.symbol ?? "");
  const [name, setName] = useState(lot.name ?? "");
  const [acquiredOn, setAcquiredOn] = useState(lot.acquiredOn ?? "");
  const [shares, setShares] = useState(lot.sharesMicros ? formatShares(lot.sharesMicros) : "");
  const [cost, setCost] = useState(centsToInput(lot.costCents ?? 0));
  const [accountId, setAccountId] = useState(lot.accountId ?? "");
  const [closedOn, setClosedOn] = useState(lot.closedOn ?? "");
  const [notes, setNotes] = useState(lot.notes ?? "");
  const [recordBuy, setRecordBuy] = useState(!lot.id);
  return (
    <Modal open title={lot.id ? "Edit lot" : "New lot"} onClose={onClose}>
      <Field label="Ticker"><input className={fieldClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} /></Field>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Bought"><input type="date" className={fieldClass} value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} /></Field>
      <Field label="Shares"><input className={fieldClass} value={shares} onChange={(e) => setShares(e.target.value)} /></Field>
      <Field label="Total cost"><input className={fieldClass} value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      <Field label="Account">
        <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Unassigned</option>
          {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Closed"><input type="date" className={fieldClass} value={closedOn} onChange={(e) => setClosedOn(e.target.value)} /></Field>
      <Field label="Notes"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {!lot.id ? (
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={recordBuy} onChange={(e) => setRecordBuy(e.target.checked)} />
          Record the cost as a buy on this date
        </label>
      ) : null}
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              await run({
                type: "lot.save",
                recordBuy,
                lot: {
                  id: lot.id,
                  symbol,
                  name,
                  acquiredOn,
                  sharesMicros: sharesToMicros(shares),
                  costCents: dollarsToCents(cost),
                  accountId: accountId || null,
                  closedOn: closedOn || null,
                  notes,
                },
              });
              onClose();
            }}
          >
            Save
          </Button>
          {lot.id ? <Button tone="danger" onClick={async () => { await run({ type: "lot.delete", id: lot.id! }); onClose(); }}>Delete</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}

function PriceEditor({ price, today, onClose }: { price: Partial<SecurityPrice>; today: string; onClose: () => void }) {
  const { run } = useBook();
  const [symbol, setSymbol] = useState(price.symbol ?? "");
  const [asOf, setAsOf] = useState(price.asOf ?? today);
  const [amount, setAmount] = useState(centsToInput(price.priceCents ?? 0));
  return (
    <Modal open title={price.id ? "Edit price" : "New price"} onClose={onClose}>
      <p className="text-sm text-muted">Per share, on this date. The latest date on or before today is the one the market value uses.</p>
      <Field label="Ticker"><input className={fieldClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} /></Field>
      <Field label="Date"><input type="date" className={fieldClass} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
      <Field label="Price"><input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Button
        onClick={async () => {
          await run({ type: "price.save", price: { id: price.id, symbol, asOf, priceCents: dollarsToCents(amount) } });
          onClose();
        }}
      >
        Save
      </Button>
    </Modal>
  );
}

function FlowEditor({ flow, accounts, onClose }: { flow: Partial<PortfolioFlow>; accounts: Account[]; onClose: () => void }) {
  const { run, canEdit } = useBook();
  const [kind, setKind] = useState(flow.kind ?? "dividend");
  const [postedOn, setPostedOn] = useState(flow.postedOn ?? "");
  const [amount, setAmount] = useState(centsToInput(flow.amountCents ?? 0));
  const [symbol, setSymbol] = useState(flow.symbol ?? "");
  const [accountId, setAccountId] = useState(flow.accountId ?? "");
  const [external, setExternal] = useState(flow.external !== false);
  const [memo, setMemo] = useState(flow.memo ?? "");
  const [recordInBooks, setRecordInBooks] = useState(false);
  return (
    <Modal open title={flow.id ? "Edit cash flow" : "New cash flow"} onClose={onClose}>
      <Field label="Kind">
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {FLOW_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="Date"><input type="date" className={fieldClass} value={postedOn} onChange={(e) => setPostedOn(e.target.value)} /></Field>
      <Field label="Amount"><input className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Ticker"><input className={fieldClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} /></Field>
      <Field label="Account">
        <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">None</option>
          {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Memo"><input className={fieldClass} value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} />
        Cash left or entered the portfolio
      </label>
      {!flow.id && kind === "dividend" ? (
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={recordInBooks} onChange={(e) => setRecordInBooks(e.target.checked)} />
          Record it in the books as Schedule B dividend income
        </label>
      ) : null}
      {canEdit ? (
        <Button
          onClick={async () => {
            await run({
              type: "flow.save",
              recordInBooks,
              flow: {
                id: flow.id,
                kind,
                postedOn,
                amountCents: dollarsToCents(amount),
                symbol,
                accountId: accountId || null,
                external,
                memo,
                lotId: flow.lotId ?? null,
                transactionId: flow.transactionId ?? null,
              },
            });
            onClose();
          }}
        >
          Save
        </Button>
      ) : null}
    </Modal>
  );
}

function SketchEditor({ sketch, onClose }: { sketch: Partial<RetirementSketch>; onClose: () => void }) {
  const { run, canEdit } = useBook();
  const [name, setName] = useState(sketch.name ?? "");
  const [monthly, setMonthly] = useState(centsToInput(sketch.monthlyCents ?? 0));
  const [rate, setRate] = useState(String((sketch.annualReturnBps ?? 600) / 100));
  const [years, setYears] = useState(String(sketch.years ?? 25));
  const [target, setTarget] = useState(centsToInput(sketch.targetCents ?? 0));
  const [usePortfolio, setUsePortfolio] = useState(sketch.usePortfolio !== false);
  const [start, setStart] = useState(centsToInput(sketch.startCents ?? 0));
  return (
    <Modal open title={sketch.id ? "Edit sketch" : "New sketch"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Monthly addition"><input className={fieldClass} value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
      <Field label="Annual return %"><input className={fieldClass} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      <Field label="Years"><input className={fieldClass} value={years} onChange={(e) => setYears(e.target.value)} /></Field>
      <Field label="Target"><input className={fieldClass} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={usePortfolio} onChange={(e) => setUsePortfolio(e.target.checked)} />
        Start from today’s portfolio value
      </label>
      {usePortfolio ? null : <Field label="Starting balance"><input className={fieldClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>}
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              const bps = Math.round(Number(rate) * 100);
              await run({
                type: "sketch.save",
                sketch: {
                  id: sketch.id,
                  name,
                  monthlyCents: dollarsToCents(monthly),
                  annualReturnBps: Number.isFinite(bps) ? bps : 600,
                  years: Math.round(Number(years) || 25),
                  targetCents: dollarsToCents(target),
                  usePortfolio,
                  startCents: dollarsToCents(start),
                },
              });
              onClose();
            }}
          >
            Save
          </Button>
          {sketch.id ? <Button tone="danger" onClick={async () => { await run({ type: "sketch.delete", id: sketch.id! }); onClose(); }}>Delete</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}
