import { account } from '../account.svelte';
import { saveAll } from '../saves';
import { deriveKey, fromBase64, importKey, keyFits, newParams, toBase64 } from './crypto';
import { newEntryName, openEntry, sealEntry, sealedIn, type VaultEntry } from './entries';
import { newWorldId, worldIdOf, withHeader } from '../world';

/**
 * The vault's lock (Cerys, October 26). One passphrase opens every world's vault, and
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
  /** Why the vault did not lock when asked, shown on its page. */
  problem = $state('');
  private lockedByHand = false;
  /** Each world's id, read once while the app runs. An id never changes. */
  private ids = new Map<string, string>();

  /** True once a passphrase has been chosen for this library. */
  get ready(): boolean {
    return !!account.vaultParams;
  }

  private opened(key: CryptoKey) {
    this.lockedByHand = false;
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

  /**
   * Locks, after whatever is waiting to be saved is sealed into the vault. Sealing needs
   * the key, so when a save fails the vault stays open and says why, and a story is never
   * left unsaved behind a lock. Returns whether it locked.
   *
   * `byHand` is the writer locking it on purpose, from the button or the keys. This
   * computer's remembered key then stays unused until the passphrase is typed again, so
   * locking by hand means locked.
   */
  async lock(byHand = false): Promise<boolean> {
    if (this.open && !(await saveAll().catch(() => false))) {
      this.problem = 'A story could not be saved, so the vault is still open. It locks once the story is saved.';
      this.touch();
      return false;
    }
    this.problem = '';
    if (byHand) this.lockedByHand = true;
    this.key = null;
    this.open = false;
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    return true;
  }

  /**
   * Chooses the passphrase for this library's vaults. Another computer may have chosen
   * one already that has not arrived here yet, and two passphrases would split the vault
   * in two, so `immersion.md` is synced and read again first (Cerys, October 27).
   */
  async create(passphrase: string, remember: boolean) {
    await account.library?.syncYou().catch(() => null);
    await account.refresh();
    if (account.vaultParams) throw new Error('This library already has a passphrase, chosen on another computer. Unlock the vault with that one.');
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
    if (this.lockedByHand) return false;
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
        out.push({ name, entry: await this.openHere(world, name, key) });
      } catch {
        // A story sealed with another passphrase, or damaged, stays where it is.
      }
    }
    return out.sort((a, b) => b.entry.modified - a.entry.modified || b.entry.created - a.entry.created);
  }

  async read(world: string, name: string): Promise<VaultEntry> {
    return this.openHere(world, name, this.need());
  }

  /** The text of a shelf world's `world.md`. */
  private async worldMd(world: string): Promise<string> {
    const found = (await account.library!.list()).find((w) => w.path === world);
    if (!found || found.worldMd === null) throw new Error('That world is not on this computer.');
    return found.worldMd;
  }

  /**
   * The world's id, which its stories are sealed to. A world made before ids has none, so
   * it takes `given` or a new one, written into its `world.md` once.
   */
  private async worldId(world: string, given?: string): Promise<string> {
    const known = this.ids.get(world);
    if (known) return known;
    const md = await this.worldMd(world);
    let id = worldIdOf(md);
    if (!id) {
      id = given ?? newWorldId();
      await account.library!.writeWorldMd(world, withHeader(md, { id }));
    }
    this.ids.set(world, id);
    return id;
  }

  /**
   * Opens one story, and checks it belongs here. A story names the world it was sealed
   * in, and the seal proves that name was not changed. When this world has lost its id,
   * it takes the story's back, so a deleted line never locks the vault.
   */
  private async openHere(world: string, name: string, key: CryptoKey): Promise<VaultEntry> {
    const text = await account.library!.vaultRead(world, name);
    const entry = await openEntry(key, name, text);
    const from = sealedIn(text);
    if (from && (await this.worldId(world, from)) !== from) throw new Error('This story was sealed in another world, so it does not open in this one.');
    return entry;
  }

  async save(world: string, name: string, entry: VaultEntry) {
    await account.library!.vaultWrite(world, name, await sealEntry(this.need(), await this.worldId(world), name, entry));
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
