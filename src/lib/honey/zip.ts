function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/** A zip of stored files. No compression, so a photo or PDF is copied as itself. */
export function zipStore(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50);
    u16(localView, 4, 20);
    u16(localView, 8, 0);
    u32(localView, 14, crc);
    u32(localView, 18, entry.data.length);
    u32(localView, 22, entry.data.length);
    u16(localView, 26, name.length);
    const chunk = concat([local, name, entry.data]);
    parts.push(chunk);
    const head = new Uint8Array(46);
    const headView = new DataView(head.buffer);
    u32(headView, 0, 0x02014b50);
    u16(headView, 4, 20);
    u16(headView, 6, 20);
    u32(headView, 16, crc);
    u32(headView, 20, entry.data.length);
    u32(headView, 24, entry.data.length);
    u16(headView, 28, name.length);
    u32(headView, 42, offset);
    central.push(concat([head, name]));
    offset += chunk.length;
  }
  const directory = concat(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 8, entries.length);
  u16(endView, 10, entries.length);
  u32(endView, 12, directory.length);
  u32(endView, 16, offset);
  return concat([...parts, directory, end]);
}

/** Read a zip this app wrote. Compressed entries are refused. */
export function unzipStore(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { name: string; data: Uint8Array }[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (readU32(view, offset) !== 0x04034b50) break;
    const method = readU16(view, offset + 8);
    const size = readU32(view, offset + 18);
    const nameLen = readU16(view, offset + 26);
    const extraLen = readU16(view, offset + 28);
    const start = offset + 30;
    const nameEnd = start + nameLen;
    const dataEnd = nameEnd + extraLen + size;
    if (dataEnd > bytes.length) throw new Error("This zip is incomplete.");
    if (method !== 0) throw new Error("This zip is compressed. HoneyJar exports are stored, not compressed.");
    const name = new TextDecoder().decode(bytes.subarray(start, nameEnd));
    if (name.includes("..") || name.startsWith("/") || name.includes("\\")) throw new Error("This zip has an unsafe file name.");
    out.push({ name, data: bytes.subarray(nameEnd + extraLen, dataEnd) });
    offset = dataEnd;
  }
  if (!out.length) throw new Error("This zip has no files.");
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function decodeBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function fileName(id: string, name: string): string {
  const base = name.replace(/[\\/]/g, "_").replace(/^\.+/, "").slice(0, 120) || "receipt";
  return `files/${id}-${base}`;
}

export type ExportFile = { id: string; fileName: string; dataBase64: string };

/** The books as JSON, plus each receipt that could be read. Missing ones are listed. */
export function exportZip(book: unknown, files: ExportFile[]): Uint8Array {
  const entries: { name: string; data: Uint8Array }[] = [
    { name: "honeyjar.json", data: new TextEncoder().encode(JSON.stringify(book, null, 2)) },
  ];
  const missing: string[] = [];
  for (const file of files) {
    if (!file.dataBase64) {
      missing.push(`${file.fileName || "receipt"} (${file.id})`);
      continue;
    }
    entries.push({ name: fileName(file.id, file.fileName), data: decodeBase64(file.dataBase64) });
  }
  if (missing.length) {
    entries.push({
      name: "files-missing.txt",
      data: new TextEncoder().encode(`These receipts could not be read. The app secret may have changed.\n${missing.join("\n")}\n`),
    });
  }
  return zipStore(entries);
}
