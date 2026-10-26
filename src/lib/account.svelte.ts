import type { Library, LibraryInfo } from './library/types';
import { readYou, withProfiles, type Profile } from './you.ts';

/**
 * The library and what it holds for the writer (Mike, October 26), shared by the
 * screens that need it: the Worlds page, Settings, and the title page. The app hands it
 * the library once at launch.
 */
class Account {
  library = $state.raw<Library | null>(null);
  info = $state.raw<LibraryInfo | null>(null);
  profiles = $state.raw<Profile[]>([]);
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
