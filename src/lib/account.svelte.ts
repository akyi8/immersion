import type { Library, LibraryInfo } from './library/types';
import { noteTrouble } from './trouble.ts';
import { withWords, DEFAULT_LOOK, moduleList, readYou, withLook, withProfiles, type Look, type Profile } from './you.ts';
import { splitHeader, withHeader } from './world.ts';
import type { KeyParams } from './vault/crypto.ts';

function vaultParamsFrom(source: string | null): KeyParams | null {
  if (!source) return null;
  const v = splitHeader(source).header.vault as Partial<KeyParams> | undefined;
  return v && typeof v.salt === 'string' && v.check && typeof v.check.nonce === 'string' && typeof v.check.data === 'string'
    ? { salt: v.salt, memory: Number(v.memory), passes: Number(v.passes), lanes: Number(v.lanes), check: { nonce: v.check.nonce, data: v.check.data } }
    : null;
}

const LOOK_KEY = 'immersion.look';

function localLook(): Look {
  try {
    const saved = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null') as Partial<Look> | null;
    if (saved) return { ...DEFAULT_LOOK, ...saved, layout: saved.layout === 'soft' || saved.layout === 'radiance' ? saved.layout : 'classic', backdrop: saved.backdrop !== false, autoEnter: saved.autoEnter !== false, modules: moduleList(saved.modules) };
  } catch {
    // Nothing kept, or nothing readable.
  }
  return { ...DEFAULT_LOOK };
}

const WORDS_KEY = 'immersion.dictionary';
function localWords(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(WORDS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The library and what it holds for the writer (Mike, October 26), shared by the
 * screens that need it: the Worlds page, Settings, and the title page. The app hands it
 * the library once at launch.
 */
class Account {
  library = $state.raw<Library | null>(null);
  info = $state.raw<LibraryInfo | null>(null);
  profiles = $state.raw<Profile[]>([]);
  /** The writer's own spelling dictionary, which follows them to every computer. */
  words = $state.raw<string[]>([]);
  /** The vault's key settings from `immersion.md`, or null before a passphrase is chosen. */
  vaultParams = $state.raw<KeyParams | null>(null);
  /** The writer's layout. Without a library it is kept by this computer alone. */
  look = $state.raw<Look>({ ...DEFAULT_LOOK });
  /** Counts the pulls that may have brought in worlds from other computers. */
  pulled = $state(0);
  private source: string | null = null;

  async attach(library: Library) {
    this.library = library;
    await this.refresh();
  }

  async refresh() {
    if (!this.library) return;
    this.info = await this.library.info();
    try {
      this.source = this.info.path ? await this.library.readYou() : null;
    } catch (e) {
      // A file that cannot be read keeps whatever was read before, and is written down.
      noteTrouble('settings', e);
    }
    this.profiles = readYou(this.source).profiles;
    this.words = this.info.path ? readYou(this.source).words : localWords();
    this.vaultParams = vaultParamsFrom(this.source);
    this.look = this.info.path ? readYou(this.source).look : localLook();
  }

  /**
   * The file as it is on disk now. Every write starts from this, because a sync may have
   * merged another computer's changes into the file since it was last read here. A write
   * built from the older text would remove them, the vault's key settings included.
   */
  private async fresh(): Promise<string | null> {
    if (!this.library) return this.source;
    try {
      let now = await this.library.readYou();
      // A file that was here and is suddenly gone is most likely in the middle of being
      // replaced by a sync (code review, November 21). Writing a fresh file over that
      // moment would drop the vault's key settings on every computer, so it is read once
      // more, and failing that the copy already held is the base for the write.
      if (now === null && this.source !== null) {
        await new Promise((done) => setTimeout(done, 400));
        now = await this.library.readYou();
        if (now === null) return this.source;
      }
      this.source = now;
    } catch {
      // The file could not be read. The copy already held is the best there is.
    }
    return this.source;
  }

  /** Saves the layout into `immersion.md`, or on this computer when there is no library. */
  async saveLook(look: Look) {
    this.look = look;
    if (!this.library || !this.info?.path) {
      try {
        localStorage.setItem(LOOK_KEY, JSON.stringify(look));
      } catch {
        // A browser that keeps nothing still shows the layout until the app closes.
      }
      return;
    }
    const text = withLook(await this.fresh(), look);
    await this.library.writeYou(text);
    this.source = text;
  }

  /** Saves the vault's key settings into `immersion.md`, keeping everything else in it. */
  async saveVaultParams(params: KeyParams) {
    if (!this.library) return;
    const text = withHeader((await this.fresh()) ?? withProfiles(null, []), { vault: params });
    await this.library.writeYou(text);
    this.source = text;
    this.vaultParams = vaultParamsFrom(text);
  }

  /** Saves the profiles into `immersion.md`, keeping anything else the file holds. */
  async saveProfiles(profiles: Profile[]) {
    if (!this.library) return;
    const text = withProfiles(await this.fresh(), profiles);
    await this.library.writeYou(text);
    this.source = text;
    this.profiles = readYou(text).profiles;
  }

  /** Adds a word to the writer's spelling dictionary, in `immersion.md`, or on this computer when there is no library. */
  async addWord(word: string) {
    const w = word.trim().toLowerCase();
    if (!w || this.words.includes(w)) return;
    this.words = [...this.words, w];
    if (!this.library || !this.info?.path) {
      try {
        localStorage.setItem(WORDS_KEY, JSON.stringify(this.words));
      } catch {
        // Kept until the app closes.
      }
      return;
    }
    const text = withWords(await this.fresh(), [...readYou(await this.fresh()).words, w]);
    await this.library.writeYou(text);
    this.source = text;
    this.words = readYou(text).words;
  }

  profile(id: string | null | undefined): Profile | null {
    return id ? (this.profiles.find((p) => p.id === id) ?? null) : null;
  }
}

export const account = new Account();
