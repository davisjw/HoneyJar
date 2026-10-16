import { useState } from "react";
import type { LedgerBook } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Field, PageIntro, fieldClass } from "../kit";

const FORMS = [
  { id: "C", label: "Schedule C · sole prop" },
  { id: "E", label: "Schedule E · rental" },
  { id: "F", label: "Schedule F · farm" },
];

export function JarsPage() {
  const { data, jar, jars, setJar, run, canEdit } = useBook();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"personal" | "business" | "property">("personal");
  const [taxForm, setTaxForm] = useState("C");
  const [activity, setActivity] = useState("");
  if (!data) return null;
  const archived = data.ledgers.filter((item) => item.archived);
  const personal = jars.filter((item) => item.kind === "personal");
  const business = jars.filter((item) => item.kind === "business");
  const property = jars.filter((item) => item.kind === "property");
  return (
    <div>
      <PageIntro
        title="Jars"
        lede="Each jar is its own set of books on this sign-in. A different family should have its own sign-in, so their ten years of transactions are not loaded with yours. Personal is the household. Business is a Schedule C, E, or F activity. Property is a rental on Schedule E. Archive hides a jar and does not pull a draw back."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <JarList title="Personal" rows={personal} current={jar?.id} onOpen={setJar} canEdit={canEdit} onArchive={(id) => run({ type: "ledger.archive", id, archived: true })} />
        <JarList title="Business" rows={business} current={jar?.id} onOpen={setJar} canEdit={canEdit} onArchive={(id) => run({ type: "ledger.archive", id, archived: true })} />
        <JarList title="Property" rows={property} current={jar?.id} onOpen={setJar} canEdit={canEdit} onArchive={(id) => run({ type: "ledger.archive", id, archived: true })} />
      </div>
      {canEdit ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Add a jar</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await run({ type: "ledger.save", ledger: { name, kind, taxForm, activity } });
              setName("");
              setActivity("");
            }}
          >
            <Field label="Name">
              <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "property" ? "Maple Street" : kind === "business" ? "Studio" : "Mine"} />
            </Field>
            <Field label="Kind">
              <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value === "business" ? "business" : e.target.value === "property" ? "property" : "personal")}>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
                <option value="property">Property</option>
              </select>
            </Field>
            {kind === "business" ? (
              <>
                <Field label="Tax form">
                  <select className={fieldClass} value={taxForm} onChange={(e) => setTaxForm(e.target.value)}>
                    {FORMS.map((form) => <option key={form.id} value={form.id}>{form.label}</option>)}
                  </select>
                </Field>
                <Field label="What it does">
                  <input className={fieldClass} value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Design, orchard" />
                </Field>
              </>
            ) : null}
            {kind === "property" ? (
              <Field label="Address">
                <input className={fieldClass} value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="418 Maple Street" />
              </Field>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit">Add jar</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {archived.length ? (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Archived</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {archived.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <span>{item.name}<span className="text-muted"> · {item.kind}</span></span>
                {canEdit ? <Button tone="quiet" onClick={() => run({ type: "ledger.archive", id: item.id, archived: false })}>Restore</Button> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function JarList({
  title,
  rows,
  current,
  onOpen,
  canEdit,
  onArchive,
}: {
  title: string;
  rows: LedgerBook[];
  current?: string;
  onOpen: (id: string) => void;
  canEdit: boolean;
  onArchive: (id: string) => void;
}) {
  return (
    <Card>
      <h2 className="font-display text-xl">{title}</h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {rows.length ? rows.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{item.name}</span>
              {item.id === current ? <span className="text-muted"> · open</span> : null}
              {item.kind === "personal" ? null : <span className="text-muted"> · Schedule {item.taxForm}</span>}
            </span>
            <span className="flex items-center gap-2">
              {item.id !== current ? <button type="button" className="text-honey-deep" onClick={() => onOpen(item.id)}>Open</button> : null}
              {canEdit ? <button type="button" className="text-muted" onClick={() => onArchive(item.id)}>Archive</button> : null}
            </span>
          </li>
        )) : <li className="py-2 text-muted">None yet.</li>}
      </ul>
    </Card>
  );
}
