import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { openReceiptWith, sealReceipt } from "./receipt-box.ts";

export const PUBLIC_AUTH_SECRET = "honeyjar-dev-secret-change-me";

export type AuthSecretReport = {
  oldKey: string;
  migrated: number;
  pending: number;
  finished: boolean;
  failed: string[];
};

type Rotation = { oldSecret: string; newSecret: string };
type Disk = { secret: string | null; rotation: Rotation | null };

type Signer = (current: string, previous: string | null) => void;
let signer: Signer | null = null;
let published: { current: string; previous: string | null } | null = null;
let chain: Promise<unknown> = Promise.resolve();

export function bindSigningSecrets(fn: Signer) {
  signer = fn;
  if (published) fn(published.current, published.previous);
}

function publish(current: string, previous: string | null) {
  published = { current, previous };
  signer?.(current, previous);
}

export function authDir(): string {
  return process.env.HONEYJAR_AUTH_DIR || path.join(process.cwd(), "data", "auth");
}

function envSecret(): string | null {
  const value = process.env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (!value || value === PUBLIC_AUTH_SECRET) return null;
  return value;
}

function readDisk(dir = authDir()): Disk {
  let secret: string | null = null;
  try {
    const text = readFileSync(path.join(dir, "secret"), "utf8").trim();
    if (text) secret = text;
  } catch {
    secret = null;
  }
  let rotation: Rotation | null = null;
  try {
    const parsed = JSON.parse(readFileSync(path.join(dir, "rotation.json"), "utf8")) as Rotation;
    if (parsed?.oldSecret && parsed?.newSecret) rotation = { oldSecret: parsed.oldSecret, newSecret: parsed.newSecret };
  } catch {
    rotation = null;
  }
  return { secret, rotation };
}

function writeAtomicSync(file: string, text: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const next = `${file}.next`;
  writeFileSync(next, text, { mode: 0o600 });
  renameSync(next, file);
}

function writeSecretSync(secret: string, dir = authDir()) {
  writeAtomicSync(path.join(dir, "secret"), secret);
}

function writeRotationSync(rotation: Rotation, dir = authDir()) {
  writeAtomicSync(path.join(dir, "rotation.json"), JSON.stringify(rotation));
}

function clearRotationSync(dir = authDir()) {
  rmSync(path.join(dir, "rotation.json"), { force: true });
}

/** The key new receipts are sealed with, and every key that may still open an old file. */
export function activeFileSecrets(): { write: string; read: string[] } {
  const state = ensureAuthSecretSync();
  return { write: state.current, read: state.previous ? [state.current, state.previous] : [state.current] };
}

/** Load or create the server key. A public default starts a rotation and is not stored as the new key. */
export function ensureAuthSecretSync(): { current: string; previous: string | null } {
  const disk = readDisk();
  if (disk.rotation) {
    publish(disk.rotation.newSecret, disk.rotation.oldSecret);
    return { current: disk.rotation.newSecret, previous: disk.rotation.oldSecret };
  }
  if (disk.secret && disk.secret !== PUBLIC_AUTH_SECRET) {
    publish(disk.secret, null);
    return { current: disk.secret, previous: null };
  }
  const fromEnv = envSecret();
  if (fromEnv) {
    writeSecretSync(fromEnv);
    publish(fromEnv, null);
    return { current: fromEnv, previous: null };
  }
  const next = randomBytes(32).toString("base64url");
  const old = disk.secret || PUBLIC_AUTH_SECRET;
  writeRotationSync({ oldSecret: old, newSecret: next });
  publish(next, old);
  console.info("HoneyJar generated a server key. Receipts sealed with the public default move off it before that default is dropped.");
  return { current: next, previous: old };
}

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function listReceipts(root: string): Promise<{ userId: string; id: string }[]> {
  let users: string[];
  try {
    users = await readdir(root);
  } catch {
    return [];
  }
  const out: { userId: string; id: string }[] = [];
  for (const userId of users) {
    let names: string[];
    try {
      names = await readdir(path.join(root, userId));
    } catch {
      continue;
    }
    for (const id of names) {
      if (id.endsWith(".next") || id.startsWith(".")) continue;
      out.push({ userId, id });
    }
  }
  return out;
}

async function rewrite(root: string, userId: string, id: string, secret: string, plain: Buffer) {
  const dir = path.join(root, userId);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, id);
  const next = `${dest}.next`;
  await writeFile(next, sealReceipt(plain, secret), { mode: 0o600 });
  await rename(next, dest);
}

async function moveReceipts(
  root: string,
  target: string,
  previous: string[],
  stopAfter?: number,
): Promise<{ migrated: number; pending: number; failed: string[] }> {
  const files = await listReceipts(root);
  let migrated = 0;
  let pending = 0;
  let rewritten = 0;
  const failed: string[] = [];
  for (const file of files) {
    const packed = await readFile(path.join(root, file.userId, file.id));
    try {
      openReceiptWith(packed, target);
      migrated += 1;
      continue;
    } catch {
      // still on an older key, or not a receipt
    }
    let plain: Buffer | null = null;
    for (const secret of previous) {
      try {
        plain = openReceiptWith(packed, secret);
        break;
      } catch {
        plain = null;
      }
    }
    if (!plain) {
      failed.push(`${file.userId}/${file.id}`);
      continue;
    }
    if (stopAfter != null && rewritten >= stopAfter) {
      pending += 1;
      continue;
    }
    await rewrite(root, file.userId, file.id, target, plain);
    rewritten += 1;
    migrated += 1;
  }
  return { migrated, pending, failed };
}

function finish(rotation: Rotation, migrated: number): AuthSecretReport {
  writeSecretSync(rotation.newSecret);
  clearRotationSync();
  publish(rotation.newSecret, null);
  return { oldKey: rotation.oldSecret, migrated, pending: 0, finished: true, failed: [] };
}

async function resumeUnlocked(opts?: { filesRoot?: string; stopAfter?: number }): Promise<AuthSecretReport> {
  const root = opts?.filesRoot || process.env.HONEYJAR_FILES_DIR || path.join(process.cwd(), "data", "files");
  let disk = readDisk();
  if (!disk.rotation) {
    ensureAuthSecretSync();
    disk = readDisk();
  }
  if (!disk.rotation) return { oldKey: "", migrated: 0, pending: 0, finished: true, failed: [] };
  const moved = await moveReceipts(root, disk.rotation.newSecret, [disk.rotation.oldSecret], opts?.stopAfter);
  if (moved.failed.length === 0 && moved.pending === 0) return finish(disk.rotation, moved.migrated);
  return { oldKey: disk.rotation.oldSecret, ...moved, finished: false };
}

export function resumeAuthSecret(opts?: { filesRoot?: string; stopAfter?: number }): Promise<AuthSecretReport> {
  return exclusive(() => resumeUnlocked(opts));
}

export function rotateAuthSecret(nextSecret?: string, opts?: { filesRoot?: string; stopAfter?: number }): Promise<AuthSecretReport> {
  return exclusive(async () => {
    if (readDisk().rotation) return resumeUnlocked(opts);
    ensureAuthSecretSync();
    if (readDisk().rotation) return resumeUnlocked(opts);
    const old = readDisk().secret;
    if (!old) throw new Error("HoneyJar has no server key to replace.");
    const next = nextSecret?.trim() || randomBytes(32).toString("base64url");
    if (next.length < 32) throw new Error("The new server key has to be at least 32 characters.");
    if (next === old || next === PUBLIC_AUTH_SECRET) throw new Error("The new server key has to be different from the current one.");
    writeRotationSync({ oldSecret: old, newSecret: next });
    publish(next, old);
    return resumeUnlocked(opts);
  });
}

export function migrateReceiptsWithOldKey(oldKey: string, opts?: { filesRoot?: string }): Promise<AuthSecretReport> {
  const pasted = oldKey.trim();
  if (pasted.length < 16) throw new Error("Paste the old server key.");
  const root = opts?.filesRoot || process.env.HONEYJAR_FILES_DIR || path.join(process.cwd(), "data", "files");
  return exclusive(async () => {
    const disk = readDisk();
    const target = disk.rotation?.newSecret ?? (disk.secret && disk.secret !== PUBLIC_AUTH_SECRET ? disk.secret : null);
    if (!target) throw new Error("HoneyJar has no current server key to move receipts onto.");
    const moved = await moveReceipts(root, target, [pasted]);
    if (disk.rotation && moved.failed.length === 0 && moved.pending === 0) return finish(disk.rotation, moved.migrated);
    return {
      oldKey: disk.rotation?.oldSecret ?? pasted,
      migrated: moved.migrated,
      pending: moved.pending,
      finished: disk.rotation ? false : moved.failed.length === 0,
      failed: moved.failed,
    };
  });
}

export function authSecretStatus(): { rotating: boolean; pendingHint: boolean; oldKey: string } {
  const disk = readDisk();
  if (!disk.rotation) return { rotating: false, pendingHint: false, oldKey: "" };
  return { rotating: true, pendingHint: true, oldKey: disk.rotation.oldSecret };
}
