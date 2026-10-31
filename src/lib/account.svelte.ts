import type { Library, LibraryInfo } from './library/types';
import { DEFAULT_LOOK, readYou, withLook, withProfiles, type Look, type Profile } from './you.ts';
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
    if (saved) return { ...DEFAULT_LOOK, ...saved, layout: saved.layout === 'soft' ? 'soft' : 'classic', backdrop: saved.backdrop !== false, autoEnter: saved.autoEnter !== false };
  } catch {
    // Nothing kept, or nothing readable.
  }
  return { ...DEFAULT_LOOK };
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
    this.source = this.info.path ? await this.library.readYou() : null;
    this.profiles = readYou(this.source).profiles;
    this.vaultParams = vaultParamsFrom(this.source);
    this.look = this.info.path ? readYou(this.source).look : localLook();
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
    const text = withLook(this.source, look);
    await this.library.writeYou(text);
    this.source = text;
  }

  /** Saves the vault's key settings into `immersion.md`, keeping everything else in it. */
  async saveVaultParams(params: KeyParams) {
    if (!this.library) return;
    const text = withHeader(this.source ?? withProfiles(null, []), { vault: params });
    await this.library.writeYou(text);
    this.source = text;
    this.vaultParams = vaultParamsFrom(text);
  }

  /** Saves the profiles into `immersion.md`, keeping anything else the file holds. */
  async saveProfiles(profiles: Profile[]) {
    if (!this.library) return;
    const text = withProfiles(this.source, profiles);
    await this.library.writeYou(text);
    this.source = text;
    this.profiles = readYou(text).profiles;
  }

  profile(id: string | null | undefined): Profile | null {
    return id ? (this.profiles.find((p) => p.id === id) ?? null) : null;
  }
}

export const account = new Account();
