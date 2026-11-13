import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openReceiptWith, sealReceipt } from "./receipt-box.ts";
import { PUBLIC_AUTH_SECRET, migrateReceiptsWithOldKey, resumeAuthSecret } from "./auth-secret.server.ts";

async function lay(root: string, name: string, secret: string, text: string) {
  await mkdir(path.join(root, "user"), { recursive: true });
  await writeFile(path.join(root, "user", name), sealReceipt(Buffer.from(text), secret));
}

describe("server key rotation", () => {
  it("moves receipts off the public default, resumes after a stop, then refuses the old key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-auth-"));
    const files = path.join(root, "files");
    process.env.HONEYJAR_AUTH_DIR = path.join(root, "auth");
    delete process.env.BETTER_AUTH_SECRET;
    await lay(files, "one", PUBLIC_AUTH_SECRET, "one");
    await lay(files, "two", PUBLIC_AUTH_SECRET, "two");

    const stopped = await resumeAuthSecret({ filesRoot: files, stopAfter: 1 });
    assert.equal(stopped.finished, false);
    assert.equal(stopped.pending, 1);
    assert.ok(stopped.oldKey === PUBLIC_AUTH_SECRET);

    const done = await resumeAuthSecret({ filesRoot: files });
    assert.equal(done.finished, true);
    assert.equal(done.pending, 0);
    const saved = (await readFile(path.join(root, "auth", "secret"), "utf8")).trim();
    const one = await readFile(path.join(files, "user", "one"));
    const two = await readFile(path.join(files, "user", "two"));
    assert.equal(openReceiptWith(one, saved).toString(), "one");
    assert.equal(openReceiptWith(two, saved).toString(), "two");
    assert.throws(() => openReceiptWith(one, PUBLIC_AUTH_SECRET));
  });

  it("checks a pasted old key and rewrites only the receipts that match it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-auth-"));
    const files = path.join(root, "files");
    process.env.HONEYJAR_AUTH_DIR = path.join(root, "auth");
    delete process.env.BETTER_AUTH_SECRET;
    await lay(files, "kept", PUBLIC_AUTH_SECRET, "kept");
    await resumeAuthSecret({ filesRoot: files });
    const saved = (await readFile(path.join(root, "auth", "secret"), "utf8")).trim();
    await lay(files, "stuck", PUBLIC_AUTH_SECRET, "stuck");

    const report = await migrateReceiptsWithOldKey(PUBLIC_AUTH_SECRET, { filesRoot: files });
    assert.equal(report.failed.length, 0);
    assert.equal(report.finished, true);
    const stuck = await readFile(path.join(files, "user", "stuck"));
    assert.equal(openReceiptWith(stuck, saved).toString(), "stuck");
    assert.throws(() => openReceiptWith(stuck, PUBLIC_AUTH_SECRET));
  });
});
