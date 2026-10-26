import { argon2id } from 'hash-wasm';

/**
 * The vault's encryption (Mike, October 26). One passphrase unlocks every world's vault.
 * It becomes a key through Argon2id, which is slow and memory-hard on purpose so that
 * guessing passphrases is expensive, and the key encrypts with AES-256-GCM, which also
 * detects any tampering. The key lives only in memory, unless the writer asks a computer
 * to remember it in its own keychain.
 */
export interface KeyParams {
  /** Random salt for this library, in base64. */
  salt: string;
  /** Argon2id memory in KiB, passes, and lanes. */
  memory: number;
  passes: number;
  lanes: number;
  /** A known phrase encrypted with the key, which tells a right passphrase from a wrong one. */
  check: Sealed;
}

/** Something encrypted: its nonce and its ciphertext with the tag, both in base64. */
export interface Sealed {
  nonce: string;
  data: string;
}

export const DEFAULTS = { memory: 65536, passes: 3, lanes: 1 };
const CHECK = 'immersion vault';

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** The raw key from a passphrase. */
export async function deriveKey(passphrase: string, params: Pick<KeyParams, 'salt' | 'memory' | 'passes' | 'lanes'>): Promise<Uint8Array<ArrayBuffer>> {
  const raw = await argon2id({
    password: passphrase.normalize('NFC'),
    salt: fromBase64(params.salt),
    memorySize: params.memory,
    iterations: params.passes,
    parallelism: params.lanes,
    hashLength: 32,
    outputType: 'binary',
  });
  return new Uint8Array(raw);
}

export function importKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
  return { nonce: toBase64(nonce), data: toBase64(data) };
}

/** Decrypts, or throws when the key is wrong or the data was changed. */
export async function open(key: CryptoKey, sealed: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.nonce) }, key, fromBase64(sealed.data)));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const sealText = (key: CryptoKey, text: string) => seal(key, encoder.encode(text) as Uint8Array<ArrayBuffer>);
export const openText = async (key: CryptoKey, sealed: Sealed) => decoder.decode(await open(key, sealed));

/** Makes the key settings for a new passphrase, with a fresh salt. */
export async function newParams(passphrase: string): Promise<{ params: KeyParams; raw: Uint8Array<ArrayBuffer> }> {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const raw = await deriveKey(passphrase, { salt, ...DEFAULTS });
  const check = await sealText(await importKey(raw), CHECK);
  return { params: { salt, ...DEFAULTS, check }, raw };
}

/** True when this raw key is the one the settings were made with. */
export async function keyFits(raw: Uint8Array<ArrayBuffer>, params: KeyParams): Promise<boolean> {
  try {
    return (await openText(await importKey(raw), params.check)) === CHECK;
  } catch {
    return false;
  }
}
