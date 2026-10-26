import { useEffect, useRef, useState } from "react";
import { centsToInput, dollarsToCents, money, parseTags, prettyDate } from "@/lib/honey/calc";
import type { Account, Category, Person, Txn } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, fieldClass } from "../kit";

export type ImportDraft = {
  key: string;
  postedOn: string;
  amount: string;
  merchant: string;
  memo: string;
  accountId: string;
  categoryId: string;
  personId: string;
  tags: string;
  status: "waiting" | "imported" | "ignored";
  note: string;
  matches: Txn[];
  open: boolean;
};

function patchDraft(drafts: ImportDraft[], key: string, patch: Partial<ImportDraft>): ImportDraft[] {
  return drafts.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

function copyField(txn: Txn, field: "postedOn" | "amount" | "merchant" | "memo" | "accountId" | "categoryId" | "personId" | "tags"): Partial<ImportDraft> {
  if (field === "postedOn") return { postedOn: txn.postedOn };
  if (field === "amount") return { amount: centsToInput(txn.amountCents) };
  if (field === "merchant") return { merchant: txn.merchant };
  if (field === "memo") return { memo: txn.memo };
  if (field === "accountId") return { accountId: txn.accountId };
  if (field === "categoryId") return { categoryId: txn.categoryId ?? "" };
  if (field === "personId") return { personId: txn.personId ?? "" };
  return { tags: txn.tags.join(", ") };
}

export function ImportReview({
  drafts,
  accounts,
  categories,
  people,
  currency,
  onChange,
  onMatches,
  onClose,
}: {
  drafts: ImportDraft[];
  accounts: Account[];
  categories: Category[];
  people: Person[];
  currency: string;
  onChange: (next: ImportDraft[]) => void;
  onMatches: (matches: { key: string; txns: Txn[] }[]) => void;
  onClose: () => void;
}) {
  const { run } = useBook();
  const [error, setError] = useState("");
  const waiting = drafts.filter((row) => row.status === "waiting");
  const probe = waiting.map((row) => `${row.key}\u001f${row.accountId}\u001f${row.postedOn}\u001f${dollarsToCents(row.amount)}\u001f${row.merchant}`).join("\n");
  const probeNow = useRef(probe);
  const waitingNow = useRef(waiting);
  const onMatchesNow = useRef(onMatches);
  const runNow = useRef(run);
  probeNow.current = probe;
  waitingNow.current = waiting;
  onMatchesNow.current = onMatches;
  runNow.current = run;

  useEffect(() => {
    if (!probe) return;
    const sent = probe;
    const timer = window.setTimeout(() => {
      const rows = waitingNow.current
        .filter((row) => row.status === "waiting")
        .map((row) => ({
          key: row.key,
          accountId: row.accountId,
          postedOn: row.postedOn,
          amountCents: dollarsToCents(row.amount),
          merchant: row.merchant,
        }));
      void runNow.current({ type: "txn.match", rows })
        .then((result) => {
          if (probeNow.current !== sent) return;
          onMatchesNow.current(result.matches ?? []);
        })
        .catch(() => setError("Could not check existing transactions."));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [probe]);

  function toRow(row: ImportDraft) {
    return {
      postedOn: row.postedOn,
      amountCents: dollarsToCents(row.amount),
      merchant: row.merchant,
      memo: row.memo,
      accountId: row.accountId,
      categoryId: row.categoryId || null,
      personId: row.personId || null,
      tags: parseTags(row.tags),
    };
  }

  async function commit(keys: string[]) {
    const chosen = drafts.filter((row) => keys.includes(row.key) && row.status === "waiting" && row.accountId && row.postedOn);
    if (!chosen.length) return;
    setError("");
    await run({ type: "txn.import", accountId: chosen[0]!.accountId, rows: chosen.map(toRow) });
    const done = new Set(chosen.map((row) => row.key));
    onChange(drafts.map((row) => (done.has(row.key) ? { ...row, status: "imported", note: "Imported" } : row)));
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Review import</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            A likely duplicate is the same account, the same amount, a date within seven days, and a close merchant. A leading VISA or MC is ignored, and a shortened name such as BLU BTTL still matches Blue Bottle. Open a row to see those. Click one field to copy only that field. The matches themselves are not imported.
          </p>
        </div>
        <div className="flex gap-2">
          <Button tone="quiet" onClick={onClose}>Discard</Button>
          <Button disabled={!waiting.length} onClick={() => commit(waiting.map((row) => row.key))}>
            Import all {waiting.length || ""}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {drafts.map((row) => {
          const locked = row.status !== "waiting";
          return (
            <div key={row.key} className={locked ? "rounded-xl border border-line p-3 opacity-50" : "rounded-xl border border-line p-3"}>
              <div className="grid gap-2 md:grid-cols-4">
                <label className="text-sm">
                  <span className="text-muted">Date</span>
                  <input type="date" className={fieldClass} disabled={locked} value={row.postedOn} onChange={(e) => onChange(patchDraft(drafts, row.key, { postedOn: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <span className="text-muted">Amount</span>
                  <input className={fieldClass} disabled={locked} value={row.amount} onChange={(e) => onChange(patchDraft(drafts, row.key, { amount: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <span className="text-muted">Merchant</span>
                  <input className={fieldClass} disabled={locked} value={row.merchant} onChange={(e) => onChange(patchDraft(drafts, row.key, { merchant: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <span className="text-muted">Memo</span>
                  <input className={fieldClass} disabled={locked} value={row.memo} onChange={(e) => onChange(patchDraft(drafts, row.key, { memo: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <span className="text-muted">Account</span>
                  <select className={fieldClass} disabled={locked} value={row.accountId} onChange={(e) => onChange(patchDraft(drafts, row.key, { accountId: e.target.value }))}>
                    {accounts.filter((account) => !account.archived).map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-muted">Category</span>
                  <select className={fieldClass} disabled={locked} value={row.categoryId} onChange={(e) => onChange(patchDraft(drafts, row.key, { categoryId: e.target.value }))}>
                    <option value="">None</option>
                    {categories.filter((category) => !category.archived).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-muted">Person</span>
                  <select className={fieldClass} disabled={locked} value={row.personId} onChange={(e) => onChange(patchDraft(drafts, row.key, { personId: e.target.value }))}>
                    <option value="">Household</option>
                    {people.filter((person) => !person.archived).map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-muted">Tags</span>
                  <input className={fieldClass} disabled={locked} value={row.tags} placeholder="comma separated" onChange={(e) => onChange(patchDraft(drafts, row.key, { tags: e.target.value }))} />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {locked ? (
                  <span className="text-sm text-muted">{row.note || (row.status === "imported" ? "Imported" : "Ignored")}</span>
                ) : (
                  <Button onClick={() => commit([row.key])}>Import this row</Button>
                )}
                {row.matches.length ? (
                  <button type="button" className="text-sm text-honey-deep underline" onClick={() => onChange(patchDraft(drafts, row.key, { open: !row.open }))}>
                    {row.open ? "Hide" : "Show"} {row.matches.length} likely {row.matches.length === 1 ? "duplicate" : "duplicates"}
                  </button>
                ) : (
                  <span className="text-sm text-muted">No likely duplicate</span>
                )}
              </div>
              {row.open && row.matches.length ? (
                <ul className="mt-3 space-y-2 border-t border-line pt-3">
                  {row.matches.map((txn) => (
                    <li key={txn.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <FieldButton disabled={locked} label={prettyDate(txn.postedOn)} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "postedOn")))} />
                      <FieldButton disabled={locked} label={money(txn.amountCents, currency)} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "amount")))} />
                      <FieldButton disabled={locked} label={txn.merchant || "No merchant"} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "merchant")))} />
                      <FieldButton disabled={locked} label={txn.memo || "No memo"} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "memo")))} />
                      <FieldButton disabled={locked} label={accounts.find((account) => account.id === txn.accountId)?.name ?? "Account"} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "accountId")))} />
                      <FieldButton disabled={locked} label={categories.find((category) => category.id === txn.categoryId)?.name ?? "No category"} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "categoryId")))} />
                      <FieldButton disabled={locked} label={people.find((person) => person.id === txn.personId)?.name ?? "Household"} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "personId")))} />
                      <FieldButton disabled={locked} label={txn.tags.length ? txn.tags.join(", ") : "No tags"} onClick={() => onChange(patchDraft(drafts, row.key, copyField(txn, "tags")))} />
                      <a className="text-honey-deep underline" href={`/transactions?txn=${txn.id}`} target="_blank" rel="noreferrer">Edit</a>
                      <Button
                        tone="quiet"
                        disabled={locked}
                        onClick={() => onChange(patchDraft(drafts, row.key, { status: "ignored", note: `Ignored because it matches ${txn.merchant} on ${prettyDate(txn.postedOn)}` }))}
                      >
                        Ignore import
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FieldButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" disabled={disabled} className="rounded-lg border border-line bg-card px-2 py-1 text-left hover:border-honey disabled:opacity-50" onClick={onClick}>
      {label}
    </button>
  );
}
