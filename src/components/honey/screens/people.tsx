import { useState } from "react";
import { money, periodOf, periodStart, personFlow } from "@/lib/honey/calc";
import type { Person } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Field, Modal, PageIntro, fieldClass } from "../kit";

const RELATIONS = [
  { value: "adult", label: "Adult" },
  { value: "child", label: "Child" },
  { value: "other", label: "Other" },
];

export function PeoplePage() {
  const { data, run, canEdit } = useBook();
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  if (!data) return null;
  const month = periodOf(data.today, data.profile.monthStartDay);
  const from = periodStart(month, data.profile.monthStartDay);
  const flow = personFlow(
    data.transactions,
    data.people.filter((p) => !p.archived),
    from,
    data.today,
  );
  const cur = data.profile.currency;
  return (
    <div>
      <PageIntro
        title="People"
        lede="Assign income and spending to someone in the household — a partner, a kid, or leave it shared. Reports and credit scores follow the same people."
        action={canEdit ? <Button onClick={() => setEditing({ relation: "adult", sort: data.people.length })}>Add person</Button> : null}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {flow.map((row) => (
          <Card key={row.id || "household"}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-sm text-muted">
                  {row.id ? RELATIONS.find((r) => r.value === data.people.find((p) => p.id === row.id)?.relation)?.label ?? "Person" : "Unassigned"}
                  {" · "}this month
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm">Spent <span className="num">{money(row.spending, cur)}</span></p>
            <p className="text-sm">Income <span className="num">{money(row.income, cur)}</span></p>
            {row.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="inline-flex min-h-11 items-center text-sm text-honey-deep" href={`/transactions?person=${row.id}`}>Transactions</a>
                <a className="inline-flex min-h-11 items-center text-sm text-honey-deep" href={`/credit?person=${row.id}`}>Credit</a>
                {canEdit ? (
                  <Button tone="quiet" onClick={() => setEditing(data.people.find((p) => p.id === row.id) ?? null)}>Edit</Button>
                ) : null}
              </div>
            ) : (
              <a className="mt-3 inline-flex min-h-11 items-center text-sm text-honey-deep" href="/transactions?person=household">Shared transactions</a>
            )}
          </Card>
        ))}
      </div>
      {flow.length === 0 ? <Card><p className="text-sm text-muted">Add the people who share these books. A paycheck can belong to one of you. Groceries can stay on the household.</p></Card> : null}
      {editing ? <PersonEditor person={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function PersonEditor({ person, onClose }: { person: Partial<Person>; onClose: () => void }) {
  const { run } = useBook();
  const [name, setName] = useState(person.name ?? "");
  const [relation, setRelation] = useState(person.relation ?? "adult");
  return (
    <Modal open title={person.id ? "Person" : "Add person"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Relation">
        <select className={fieldClass} value={relation} onChange={(e) => setRelation(e.target.value)}>
          {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            if (!name.trim()) return;
            await run({ type: "person.save", person: { id: person.id, name: name.trim(), relation, sort: person.sort ?? 0 } });
            onClose();
          }}
        >
          Save
        </Button>
        {person.id ? (
          <Button tone="danger" onClick={async () => { await run({ type: "person.delete", id: person.id! }); onClose(); }}>
            Remove
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
