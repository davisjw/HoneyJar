import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readReceipt, writeReceipt } from "./files.server.ts";

describe("receipt files", () => {
  it("round-trips bytes without writing them in the clear", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-files-"));
    const raw = Buffer.from("receipt-bytes");
    await writeReceipt("user", "doc", raw, root);
    const back = await readReceipt("user", "doc", root);
    assert.equal(back.toString(), "receipt-bytes");
  });
});
