import { useState } from "react";
import { useBook } from "./book";
import { Button, Modal } from "./kit";

function bytesFrom(dataBase64: string): Uint8Array {
  const bin = atob(dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function Receipts({ relatedType, relatedId }: { relatedType: "txn" | "bill"; relatedId?: string }) {
  const { data, run, canEdit } = useBook();
  const [error, setError] = useState("");
  const [image, setImage] = useState<{ name: string; url: string } | null>(null);
  const rows = (data?.documents ?? []).filter((doc) => doc.relatedType === relatedType && doc.relatedId === relatedId && doc.kind === "receipt");

  async function openReceipt(id: string, mime: string, name: string) {
    setError("");
    const result = await run({ type: "receipt.open", id });
    const file = result.file;
    if (!file) return;
    const url = URL.createObjectURL(new Blob([bytesFrom(file.dataBase64) as BlobPart], { type: file.mime || mime }));
    if ((file.mime || mime) === "application/pdf") {
      window.open(url, "_blank", "noopener");
      return;
    }
    setImage({ name: file.fileName || name, url });
  }

  if (!relatedId) return <p className="text-xs text-muted">Save first, then attach a picture or PDF.</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Receipt</p>
      {rows.length ? (
        <ul className="space-y-1 text-sm">
          {rows.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-2">
              <button type="button" className="text-honey-deep underline" onClick={() => void openReceipt(doc.id, doc.mime, doc.fileName || doc.title)}>
                {doc.fileName || doc.title}
              </button>
              {canEdit ? (
                <button type="button" className="text-clay" onClick={() => void run({ type: "receipt.delete", id: doc.id })}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">No file attached.</p>
      )}
      {canEdit ? (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || !relatedId) return;
            if (file.size > 8_000_000) {
              setError("That file is larger than 8 MB.");
              return;
            }
            setError("");
            const dataBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
            await run({ type: "receipt.save", relatedType, relatedId, fileName: file.name, mime: file.type, dataBase64 });
          }}
        />
      ) : null}
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <p className="text-xs text-muted">The file is encrypted on disk. It is not stored in the books, so opening a page does not load it.</p>
      <Modal open={!!image} title={image?.name ?? "Receipt"} onClose={() => setImage(null)}>
        {image ? <img src={image.url} alt={image.name} className="max-h-[70vh] w-full object-contain" /> : null}
      </Modal>
    </div>
  );
}
