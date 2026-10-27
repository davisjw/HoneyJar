import { useId } from "react";
import type { Contact } from "@/lib/honey/types";
import { useBook } from "./book";
import { Button, Field, fieldClass } from "./kit";

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function blank(current: string | undefined, next: string) {
  return current?.trim() ? current : next;
}

export function ContactField({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind: "bank" | "merchant" | "utility";
  value: string;
  onChange: (name: string) => void;
}) {
  const { data, run, canEdit } = useBook();
  const listId = useId();
  const contacts = data?.contacts ?? [];
  const choices = contacts.filter((contact) => contact.kind === kind || contact.kind === "other");
  const match = contacts.find((contact) => sameName(contact.name, value));

  async function quickAdd() {
    const name = value.trim();
    if (!name || match) return;
    await run({ type: "contact.save", contact: { name, kind } });
  }

  async function lookup() {
    const name = value.trim();
    if (!name) return;
    const result = await run({ type: "contact.lookup", name });
    const found = result.lookup;
    if (!found) return;
    const existing = contacts.find((contact) => sameName(contact.name, found.name) || sameName(contact.name, name));
    const savedName = found.name || name;
    await run({
      type: "contact.save",
      contact: {
        id: existing?.id,
        name: savedName,
        kind: existing?.kind || kind,
        phone: blank(existing?.phone, found.phone),
        website: blank(existing?.website, found.website),
        email: blank(existing?.email, found.email),
        street: blank(existing?.street, found.street),
        city: blank(existing?.city, found.city),
        region: blank(existing?.region, found.region),
        postal: blank(existing?.postal, found.postal),
        hours: blank(existing?.hours, found.hours),
        notes: existing?.notes ?? "",
      },
    });
    onChange(savedName);
  }

  return (
    <div className="space-y-1">
      <Field label={label}>
        <input className={fieldClass} list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <datalist id={listId}>
        {choices.map((contact) => (
          <option key={contact.id} value={contact.name} />
        ))}
      </datalist>
      {match ? <ContactLine contact={match} canonical={value.trim() !== match.name} onUse={() => onChange(match.name)} /> : null}
      {canEdit && value.trim() && !match ? (
        <button type="button" className="text-sm text-honey-deep underline" onClick={() => void quickAdd()}>
          Save “{value.trim()}” as a contact
        </button>
      ) : null}
      {canEdit && value.trim() ? (
        <div>
          <Button tone="quiet" onClick={lookup}>Look up public details</Button>
        </div>
      ) : null}
    </div>
  );
}

function ContactLine({ contact, canonical, onUse }: { contact: Contact; canonical: boolean; onUse: () => void }) {
  const place = [contact.street, contact.city, contact.region, contact.postal].filter(Boolean).join(", ");
  return (
    <p className="text-xs text-muted">
      {contact.phone ? <span>{contact.phone}</span> : null}
      {contact.website ? <span>{contact.phone ? " · " : ""}{contact.website.replace(/^https?:\/\//, "")}</span> : null}
      {place ? <span> · {place}</span> : null}
      {canonical ? (
        <button type="button" className="ml-2 text-honey-deep underline" onClick={onUse}>
          Use {contact.name}
        </button>
      ) : null}
    </p>
  );
}
