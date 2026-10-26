import { account } from '../account.svelte';
import { saveAll } from '../saves';
import { deriveKey, fromBase64, importKey, keyFits, newParams, toBase64 } from './crypto';
import { newEntryName, openEntry, sealEntry, type VaultEntry } from './entries';

/**
 * The vault's lock (Mike, October 26). One passphrase opens every world's vault, and
 * the key stays in memory while it is open. It locks again after a quiet stretch, at a
 * key press, from its button, and whenever the app closes.
 */
const IDLE_MS = 15 * 60 * 1000;

export interface Story {
  /** Its random file name in the vault. */
  name: string;
  entry: VaultEntry;
}

class Vault {
  open = $state(false);
  private key: CryptoKey | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;

  /** True once a passphrase has been chosen for this library. */
  get ready(): boolean {
    return !!account.vaultParams;
  }

  private opened(key: CryptoKey) {
    this.key = key;
    this.open = true;
    this.touch();
  }

  /** Any use of the vault keeps it open a while longer. */
  touch() {
    if (!this.open) return;
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => void this.lock(), IDLE_MS);
  }

  /** Locks, after whatever is waiting to be saved is sealed into the vault. */
  async lock() {
    if (this.open) await saveAll().catch(() => {});
    this.key = null;
    this.open = false;
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
  }

  /** Chooses the passphrase for this library's vaults. */
  async create(passphrase: string, remember: boolean) {
    const { params, raw } = await newParams(passphrase);
    await account.saveVaultParams(params);
    if (remember) await account.library?.vaultRemember(toBase64(raw));
    this.opened(await importKey(raw));
  }

  /** Opens with a passphrase, or says it was not the right one. */
  async unlock(passphrase: string, remember: boolean): Promise<boolean> {
    const params = account.vaultParams;
    if (!params) return false;
    const raw = await deriveKey(passphrase, params);
    if (!(await keyFits(raw, params))) return false;
    if (remember) await account.library?.vaultRemember(toBase64(raw));
    this.opened(await importKey(raw));
    return true;
  }

  /** Opens with the key this computer remembers, when it has one that still fits. */
  async unlockRemembered(): Promise<boolean> {
    const params = account.vaultParams;
    const saved = await account.library?.vaultRecall();
    if (!params || !saved) return false;
    const raw = fromBase64(saved);
    if (!(await keyFits(raw, params))) return false;
    this.opened(await importKey(raw));
    return true;
  }

  async forgetHere() {
    await account.library?.vaultForget();
  }

  private need(): CryptoKey {
    if (!this.key) throw new Error('The vault is locked.');
    this.touch();
    return this.key;
  }

  /** Every story in a world's vault, newest first. One that will not open is skipped. */
  async stories(world: string): Promise<Story[]> {
    const lib = account.library;
    const key = this.need();
    if (!lib) return [];
    const out: Story[] = [];
    for (const name of await lib.vaultList(world)) {
      try {
        out.push({ name, entry: await openEntry(key, await lib.vaultRead(world, name)) });
      } catch {
        // A story sealed with another passphrase, or damaged, stays where it is.
      }
    }
    return out.sort((a, b) => b.entry.modified - a.entry.modified || b.entry.created - a.entry.created);
  }

  async read(world: string, name: string): Promise<VaultEntry> {
    return openEntry(this.need(), await account.library!.vaultRead(world, name));
  }

  async save(world: string, name: string, entry: VaultEntry) {
    await account.library!.vaultWrite(world, name, await sealEntry(this.need(), entry));
  }

  async newStory(world: string, title: string): Promise<Story> {
    const now = Date.now();
    const story = { name: newEntryName(), entry: { title, created: now, modified: now, text: '', picture: null } };
    await this.save(world, story.name, story.entry);
    return story;
  }

  async archive(world: string, name: string) {
    this.need();
    await account.library!.vaultArchive(world, name);
  }
}

export const vault = new Vault();
