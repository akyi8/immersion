import { openText, sealText, type Sealed } from './crypto.ts';

/**
 * A story in a vault (Cerys, October 26). Everything about it, its title included, is
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
  /**
   * 2 since November 22: the story is sealed to its own file name, so one story's file
   * copied over another's refuses to open. 1 is the older form, sealed to nothing, which
   * is still read, and is written in the newer form the next time the story is saved.
   */
  v: 1 | 2;
  sealed: Sealed;
}

export function newEntryName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') + '.locked';
}

/** Seals a story to the file name it will be saved under. */
export async function sealEntry(key: CryptoKey, name: string, entry: VaultEntry): Promise<string> {
  const file: VaultFile = { immersion: 'vault', v: 2, sealed: await sealText(key, JSON.stringify(entry), name) };
  return JSON.stringify(file) + '\n';
}

/** Opens the story in the file by this name. A story sealed to another name refuses to open. */
export async function openEntry(key: CryptoKey, name: string, text: string): Promise<VaultEntry> {
  const file = JSON.parse(text) as VaultFile;
  if (file.immersion !== 'vault' || (file.v !== 1 && file.v !== 2)) throw new Error('This is not a vault file Immersion can read.');
  const e = JSON.parse(await openText(key, file.sealed, file.v === 2 ? name : undefined)) as Partial<VaultEntry>;
  return {
    title: typeof e.title === 'string' ? e.title : 'Untitled',
    created: typeof e.created === 'number' ? e.created : 0,
    modified: typeof e.modified === 'number' ? e.modified : 0,
    text: typeof e.text === 'string' ? e.text : '',
    picture: typeof e.picture === 'string' ? e.picture : null,
  };
}
