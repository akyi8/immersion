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
  v: 1 | 2 | 3;
  /**
   * Since form 3: the id of the world the story was sealed in, from that world's
   * `world.md`. It is not secret. The story is sealed to it and to the file name, so a
   * file moved into another world's vault, or with this line changed, refuses to open.
   */
  world?: string;
  sealed: Sealed;
}

export function newEntryName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') + '.locked';
}

const bound = (world: string, name: string) => `${world}/${name}`;

/** Seals a story to its world's id and to the file name it will be saved under. */
export async function sealEntry(key: CryptoKey, world: string, name: string, entry: VaultEntry): Promise<string> {
  const file: VaultFile = { immersion: 'vault', v: 3, world, sealed: await sealText(key, JSON.stringify(entry), bound(world, name)) };
  return JSON.stringify(file) + '\n';
}

/** The id of the world a vault file says it was sealed in, or null for the older forms. */
export function sealedIn(text: string): string | null {
  const file = JSON.parse(text) as VaultFile;
  return file.v === 3 && typeof file.world === 'string' ? file.world : null;
}

/**
 * Opens the story in the file by this name. A story sealed to another name refuses to
 * open, and so does one whose world line was changed. Whether the world it names is the
 * one it sits in is the caller's check, through `sealedIn`.
 */
export async function openEntry(key: CryptoKey, name: string, text: string): Promise<VaultEntry> {
  const file = JSON.parse(text) as VaultFile;
  if (file.immersion !== 'vault' || ![1, 2, 3].includes(file.v)) throw new Error('This is not a vault file Immersion can read.');
  const to = file.v === 3 ? bound(String(file.world ?? ''), name) : file.v === 2 ? name : undefined;
  const e = JSON.parse(await openText(key, file.sealed, to)) as Partial<VaultEntry>;
  return {
    title: typeof e.title === 'string' ? e.title : 'Untitled',
    created: typeof e.created === 'number' ? e.created : 0,
    modified: typeof e.modified === 'number' ? e.modified : 0,
    text: typeof e.text === 'string' ? e.text : '',
    picture: typeof e.picture === 'string' ? e.picture : null,
  };
}
