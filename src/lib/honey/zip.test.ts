import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportZip, zipStore } from "./zip.ts";

describe("export zip", () => {
  it("stores a file without compressing it", () => {
    const zip = zipStore([{ name: "files/a.txt", data: new TextEncoder().encode("receipt") }]);
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.ok(new TextDecoder().decode(zip).includes("receipt"));
    assert.ok(new TextDecoder().decode(zip).includes("files/a.txt"));
  });

  it("keeps the books and skips a receipt that did not come back", () => {
    const zip = exportZip({ profile: { displayName: "Calder" } }, [{ id: "d1", fileName: "scan.pdf", dataBase64: "" }]);
    const text = new TextDecoder().decode(zip);
    assert.ok(text.includes("honeyjar.json"));
    assert.ok(text.includes("files-missing.txt"));
    assert.ok(text.includes("Calder"));
  });
});
