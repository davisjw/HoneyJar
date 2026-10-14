const MARK = "honeyjar-vault-ok";

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
}

function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBytes(saltB64) as BufferSource, iterations: 120000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  const packed = new Uint8Array(new ArrayBuffer(iv.length + cipher.byteLength));
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return bytesToB64(packed);
}

export async function decryptText(key: CryptoKey, payload: string): Promise<string> {
  const packed = b64ToBytes(payload);
  const ivBytes = new Uint8Array(new ArrayBuffer(12));
  ivBytes.set(packed.subarray(0, 12));
  const data = new Uint8Array(new ArrayBuffer(packed.length - 12));
  data.set(packed.subarray(12));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, data);
  return new TextDecoder().decode(plain);
}

export async function createVault(passphrase: string): Promise<{ salt: string; verifier: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const salt = bytesToB64(saltBytes);
  const key = await derive(passphrase, salt);
  const verifier = await encryptText(key, MARK);
  return { salt, verifier };
}

export async function unlockVault(passphrase: string, salt: string, verifier: string): Promise<CryptoKey> {
  const key = await derive(passphrase, salt);
  const text = await decryptText(key, verifier);
  if (text !== MARK) throw new Error("That passphrase does not open the vault.");
  return key;
}
