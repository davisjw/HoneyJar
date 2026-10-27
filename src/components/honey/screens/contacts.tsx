import { useState } from "react";
import type { Contact } from "@/lib/honey/types";
import { useBook } from "../book";
import { Button, Card, Empty, Field, Modal, PageIntro, fieldClass } from "../kit";

const KINDS = [
  ["bank", "Bank"],
  ["merchant", "Merchant"],
  ["utility", "Utility"],
  ["other", "Other"],
] as const;

export function ContactsPage() {
  const { data, run, canEdit } = useBook();
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [kind, setKind] = useState("all");
  if (!data) return null;
  const rows = data.contacts.filter((contact) => kind === "all" || contact.kind === kind);
  return (
    <div>
      <PageIntro
        title="Contacts"
        lede="Banks, merchants, and utilities used when you add an account, a transaction, a bill, or a meter. A name is enough. Look up fills the public phone, website, and address when the business publishes them."
        action={canEdit ? <Button onClick={() => setEditing({ name: "", kind: "merchant" })}>Add</Button> : null}
      />
      <div className="mb-3">
        <select className={`${fieldClass} max-w-xs`} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All</option>
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <Card className="p-0">
        {rows.length ? (
          <ul className="divide-y divide-line text-sm">
            {rows.map((contact) => {
              const place = [contact.city, contact.region].filter(Boolean).join(", ");
              return (
                <li key={contact.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <button type="button" className="text-left" onClick={() => setEditing(contact)}>
                    <span className="font-medium">{contact.name}</span>
                    <span className="text-muted"> · {contact.kind}</span>
                    <p className="text-xs text-muted">{[contact.phone, contact.website.replace(/^https?:\/\//, ""), place].filter(Boolean).join(" · ") || "Name only"}</p>
                  </button>
                  {canEdit ? <Button tone="danger" onClick={() => run({ type: "contact.delete", id: contact.id })}>Remove</Button> : null}
                </li>
              );
            })}
          </ul>
        ) : <Empty>No contacts yet.</Empty>}
      </Card>
      {editing ? <ContactEditor key={editing.id ?? "new"} contact={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ContactEditor({ contact, onClose }: { contact: Partial<Contact>; onClose: () => void }) {
  const { run, canEdit } = useBook();
  const [name, setName] = useState(contact.name ?? "");
  const [kind, setKind] = useState(contact.kind ?? "merchant");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [website, setWebsite] = useState(contact.website ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [street, setStreet] = useState(contact.street ?? "");
  const [city, setCity] = useState(contact.city ?? "");
  const [region, setRegion] = useState(contact.region ?? "");
  const [postal, setPostal] = useState(contact.postal ?? "");
  const [hours, setHours] = useState(contact.hours ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");

  async function lookup() {
    if (!name.trim()) return;
    const result = await run({ type: "contact.lookup", name });
    const found = result.lookup;
    if (!found) return;
    if (found.name) setName(found.name);
    setPhone((current) => current || found.phone);
    setWebsite((current) => current || found.website);
    setEmail((current) => current || found.email);
    setStreet((current) => current || found.street);
    setCity((current) => current || found.city);
    setRegion((current) => current || found.region);
    setPostal((current) => current || found.postal);
    setHours((current) => current || found.hours);
  }

  return (
    <Modal open title={contact.id ? "Edit contact" : "New contact"} onClose={onClose}>
      <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Kind">
        <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      {canEdit ? <Button tone="quiet" onClick={lookup}>Look up public details</Button> : null}
      <p className="text-xs text-muted">Lookup searches for the business website and reads the phone, address, and hours that site publishes. It does not sign in anywhere. Empty fields are filled. Anything you already typed stays.</p>
      <Field label="Phone"><input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <Field label="Website"><input className={fieldClass} value={website} onChange={(e) => setWebsite(e.target.value)} /></Field>
      <Field label="Email"><input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Street"><input className={fieldClass} value={street} onChange={(e) => setStreet(e.target.value)} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="City"><input className={fieldClass} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label="State"><input className={fieldClass} value={region} onChange={(e) => setRegion(e.target.value)} /></Field>
        <Field label="Postal"><input className={fieldClass} value={postal} onChange={(e) => setPostal(e.target.value)} /></Field>
      </div>
      <Field label="Hours"><input className={fieldClass} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      <Field label="Notes"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              if (!name.trim()) return;
              await run({
                type: "contact.save",
                contact: { id: contact.id, name, kind, phone, website, email, street, city, region, postal, hours, notes },
              });
              onClose();
            }}
          >
            Save
          </Button>
          {contact.id ? <Button tone="danger" onClick={async () => { await run({ type: "contact.delete", id: contact.id! }); onClose(); }}>Delete</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}
