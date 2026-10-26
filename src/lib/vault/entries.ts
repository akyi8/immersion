import { openText, sealText, type Sealed } from './crypto.ts';

/**
 * A story in a vault (Mike, October 26). Everything about it, its title included, is
 * inside the encrypted file, and the file's own name is random, so a vault folder shows
 * nothing but how many stories it holds.
 */
export interface VaultEntry {
  title: string;
  /** When it was started and last changed, in milliseconds since 1970. */
  created: number;
  modified: number;
  text: string;
  /** One picture, as a data URL, or null. */
  picture: string | null;
}

/** What a vault file holds on disk. */
interface VaultFile {
  immersion: 'vault';
  v: 1;
  sealed: Sealed;
}

export function newEntryName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') + '.locked';
}

export async function sealEntry(key: CryptoKey, entry: VaultEntry): Promise<string> {
  const file: VaultFile = { immersion: 'vault', v: 1, sealed: await sealText(key, JSON.stringify(entry)) };
  return JSON.stringify(file) + '\n';
}

export async function openEntry(key: CryptoKey, text: string): Promise<VaultEntry> {
  const file = JSON.parse(text) as VaultFile;
  if (file.immersion !== 'vault' || file.v !== 1) throw new Error('This is not a vault file Immersion can read.');
  const e = JSON.parse(await openText(key, file.sealed)) as Partial<VaultEntry>;
  return {
    title: typeof e.title === 'string' ? e.title : 'Untitled',
    created: typeof e.created === 'number' ? e.created : 0,
    modified: typeof e.modified === 'number' ? e.modified : 0,
    text: typeof e.text === 'string' ? e.text : '',
    picture: typeof e.picture === 'string' ? e.picture : null,
  };
}
