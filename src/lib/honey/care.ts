import { createHash } from "node:crypto";
import type { DocumentRow, Workspace } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function makeRecoveryCode(bytes: Uint8Array): string {
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  const groups = [0, 1, 2, 3].map((i) => chars.slice(i * 4, i * 4 + 4).join(""));
  return groups.join("-");
}

export function hashRecoveryCode(raw: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(raw)).digest("hex");
}

export function namesMatch(given: string, household: string): boolean {
  const left = given.trim().toLowerCase();
  const right = household.trim().toLowerCase();
  return right.length > 0 && left === right;
}

export function hitLimit(stamps: number[], now: number, windowMs: number, max: number): { limited: boolean; next: number[] } {
  const next = stamps.filter((t) => now - t < windowMs);
  if (next.length >= max) return { limited: true, next };
  next.push(now);
  return { limited: false, next };
}

export function keyExpired(expiresAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Number.isFinite(at.getTime()) && at.getTime() <= now.getTime();
}

export function apiDocument(doc: DocumentRow) {
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    year: doc.year,
    fileName: doc.fileName,
    encrypted: doc.encrypted,
    relatedType: doc.relatedType,
    relatedId: doc.relatedId,
  };
}

/** Full household download. API keys stay out. Document bodies stay as stored, including ciphertext. */
export function publicExport(ws: Workspace) {
  const { keys: _keys, ...rest } = ws;
  return {
    exportedAt: new Date().toISOString(),
    ...rest,
    profile: { ...ws.profile, openaiKeySet: ws.profile.openaiKeySet },
  };
}
