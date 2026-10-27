import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiDocument, hashRecoveryCode, hitLimit, keyExpired, namesMatch, normalizeRecoveryCode, publicExport } from "./care.ts";
import type { DocumentRow, Workspace } from "./types.ts";

describe("account care", () => {
  it("treats a dashed recovery code as the same code", () => {
    assert.equal(normalizeRecoveryCode("ab-cd ef"), "ABCDEF");
    assert.equal(hashRecoveryCode("abcd-efgh"), hashRecoveryCode("ABCDEFGH"));
  });

  it("requires the household name", () => {
    assert.equal(namesMatch("  Calder ", "calder"), true);
    assert.equal(namesMatch("", "Calder"), false);
    assert.equal(namesMatch("Calder", ""), false);
  });

  it("stops at 60 hits in a minute", () => {
    let stamps: number[] = [];
    for (let i = 0; i < 60; i += 1) stamps = hitLimit(stamps, 1_000 + i, 60_000, 60).next;
    assert.equal(hitLimit(stamps, 1_060, 60_000, 60).limited, true);
    assert.equal(hitLimit(stamps, 62_000, 60_000, 60).limited, false);
  });

  it("treats a past key expiry as expired", () => {
    assert.equal(keyExpired(null), false);
    assert.equal(keyExpired("2000-01-01T00:00:00.000Z", new Date("2026-01-01")), true);
    assert.equal(keyExpired("2999-01-01T00:00:00.000Z", new Date("2026-01-01")), false);
  });

  it("leaves document bodies out of the API shape and keys out of the export", () => {
    const doc: DocumentRow = {
      id: "d",
      title: "Deed",
      kind: "pdf",
      year: 2024,
      relatedType: "",
      relatedId: "",
      notes: "secret note",
      body: "ciphertext",
      encrypted: true,
      fileName: "deed.pdf",
      mime: "",
    };
    assert.equal("body" in apiDocument(doc), false);
    const exported = publicExport({ documents: [doc], keys: [{ id: "k" }], profile: { displayName: "Calder" } } as unknown as Workspace);
    assert.equal("keys" in exported, false);
    assert.equal(exported.documents[0].body, "ciphertext");
  });
});
