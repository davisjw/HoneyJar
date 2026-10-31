import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { readReceipt } from "./files.server.ts";
import { DEV_AUTH_SECRET } from "./production-secret.server.ts";
import { rekeyReceipts } from "./rekey.server.ts";
import { deriveFileKey } from "./secret-box.server.ts";

const CURRENT = "0123456789abcdef0123456789abcdef";
const OLD = "fedcba9876543210fedcba9876543210";

const saved = {
  secret: process.env.BETTER_AUTH_SECRET,
  old: process.env.HONEYJAR_OLD_SECRETS,
  mode: process.env.HONEYJAR_ENV,
};

afterEach(() => {
  restore("BETTER_AUTH_SECRET", saved.secret);
  restore("HONEYJAR_OLD_SECRETS", saved.old);
  restore("HONEYJAR_ENV", saved.mode);
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function useSecret(secret: string, old?: string): void {
  process.env.BETTER_AUTH_SECRET = secret;
  if (old === undefined) delete process.env.HONEYJAR_OLD_SECRETS;
  else process.env.HONEYJAR_OLD_SECRETS = old;
  delete process.env.HONEYJAR_ENV;
}

function sha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function legacyPacked(secret: string, bytes: Buffer): Buffer {
  const key = createHash("sha256").update(`honeyjar-files:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

async function putLegacy(root: string, user: string, id: string, bytes: Buffer, secret: string) {
  const dir = path.join(root, user);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id), legacyPacked(secret, bytes));
}

describe("files:rekey", () => {
  it("rekeys 100 legacy dev-key files, then changes nothing on the second run", async () => {
    useSecret(CURRENT);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-rekey-"));
    const originals = new Map<string, Buffer>();
    for (let i = 0; i < 100; i += 1) {
      const id = `r${String(i).padStart(3, "0")}`;
      const bytes = Buffer.from(`receipt-${i}`);
      originals.set(id, bytes);
      await putLegacy(root, "household", id, bytes, DEV_AUTH_SECRET);
    }
    const lines: string[] = [];
    const first = await rekeyReceipts({ root, log: (line) => lines.push(line) });
    assert.deepEqual(first, { examined: 100, rewritten: 100, unchanged: 0, failed: 0 });
    assert.equal(lines[0], "files:rekey examined=100 rewritten=100 unchanged=0 failed=0");
    assert.equal(lines.join("\n").includes("household"), false);
    assert.equal(lines.join("\n").includes("r000"), false);
    for (const [id, bytes] of originals) {
      const back = await readReceipt("household", id, root);
      assert.equal(sha(back), sha(bytes));
      const stored = await readFile(path.join(root, "household", id));
      assert.equal(stored.subarray(0, 4).toString(), "HJF1");
      assert.equal(stored[4], deriveFileKey(CURRENT).kidByte);
    }
    const before = await readFile(path.join(root, "household", "r000"));
    lines.length = 0;
    const second = await rekeyReceipts({ root, log: (line) => lines.push(line) });
    assert.deepEqual(second, { examined: 100, rewritten: 0, unchanged: 100, failed: 0 });
    const after = await readFile(path.join(root, "household", "r000"));
    assert.equal(sha(after), sha(before));
  });

  it("rewrites an old kid and leaves a dry run untouched", async () => {
    useSecret(OLD);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-rekey-old-"));
    const { writeReceipt } = await import("./files.server.ts");
    await writeReceipt("household", "old-kid", Buffer.from("rotated"), root);
    const legacyBefore = await readFile(path.join(root, "household", "old-kid"));
    useSecret(CURRENT, OLD);
    const preview: string[] = [];
    const dry = await rekeyReceipts({ root, dryRun: true, log: (line) => preview.push(line) });
    assert.equal(dry.rewritten, 1);
    assert.match(preview[0] ?? "", /^files:rekey dry-run /);
    assert.equal(sha(await readFile(path.join(root, "household", "old-kid"))), sha(legacyBefore));
    await rekeyReceipts({ root, log: () => {} });
    delete process.env.HONEYJAR_OLD_SECRETS;
    assert.equal((await readReceipt("household", "old-kid", root)).toString(), "rotated");
    const stored = await readFile(path.join(root, "household", "old-kid"));
    assert.equal(stored[4], deriveFileKey(CURRENT).kidByte);
  });

  it("survives an interrupt before rename and finishes on the next run", async () => {
    useSecret(CURRENT);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-rekey-stop-"));
    await putLegacy(root, "household", "a", Buffer.from("one"), DEV_AUTH_SECRET);
    await putLegacy(root, "household", "b", Buffer.from("two"), DEV_AUTH_SECRET);
    await putLegacy(root, "household", "c", Buffer.from("three"), DEV_AUTH_SECRET);
    const originalB = await readFile(path.join(root, "household", "b"));
    let calls = 0;
    await assert.rejects(
      () =>
        rekeyReceipts({
          root,
          log: () => {},
          beforeRename() {
            calls += 1;
            if (calls === 2) throw new Error("interrupt");
          },
        }),
      /interrupt/,
    );
    assert.equal(sha(await readFile(path.join(root, "household", "b"))), sha(originalB));
    assert.equal((await readReceipt("household", "a", root)).toString(), "one");
    assert.equal((await readReceipt("household", "b", root)).toString(), "two");
    assert.equal((await readReceipt("household", "c", root)).toString(), "three");
    const done = await rekeyReceipts({ root, log: () => {} });
    assert.equal(done.failed, 0);
    assert.equal(done.rewritten, 2);
    for (const [id, text] of [
      ["a", "one"],
      ["b", "two"],
      ["c", "three"],
    ] as const) {
      const stored = await readFile(path.join(root, "household", id));
      assert.equal(stored.subarray(0, 4).toString(), "HJF1");
      assert.equal((await readReceipt("household", id, root)).toString(), text);
    }
    const again = await rekeyReceipts({ root, log: () => {} });
    assert.equal(again.rewritten, 0);
    assert.equal(again.unchanged, 3);
  });

  it("runs the npm script entry and counts a failure without naming the file", async () => {
    useSecret(CURRENT);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-rekey-cli-"));
    await mkdir(path.join(root, "household"), { recursive: true });
    await writeFile(path.join(root, "household", "garbage"), Buffer.from("not-a-receipt"));
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "scripts/files-rekey.ts"],
      {
        cwd: path.resolve(import.meta.dirname, "../../.."),
        env: {
          ...process.env,
          HONEYJAR_FILES_DIR: root,
          BETTER_AUTH_SECRET: CURRENT,
          HONEYJAR_ENV: "development",
        },
      },
    );
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      out += chunk;
    });
    const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));
    assert.equal(code, 1);
    assert.match(out, /files:rekey examined=1 rewritten=0 unchanged=0 failed=1/);
    assert.equal(out.includes("garbage"), false);
    assert.equal(out.includes("household"), false);
  });
});
