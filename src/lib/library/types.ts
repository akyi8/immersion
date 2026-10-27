import type { ImageSource, SyncReport, WorldFs } from '../fs/types';

/**
 * The shelf of worlds this machine knows (design: the world shelf). Like the world's
 * files, it has two implementations: the desktop app's, kept by the Rust backend, and
 * an in-memory one for testing in an ordinary browser.
 */
export interface ShelfWorld {
  /** The world's folder, which also identifies it on the shelf. */
  path: string;
  name: string;
  tagline: string;
  /** A URL for the cover picture, or null when the world has none yet. */
  cover: string | null;
  /** True when the folder is not on this computer, for example before a sync. */
  missing: boolean;
  /** The text of the world's `world.md`, or null when the folder is missing. */
  worldMd: string | null;
  /** True for a world outside the library, which only this computer shows. */
  local: boolean;
  /** True for Real World, the writer's journal. */
  journal: boolean;
}

/** Where the library is on this computer, and how it syncs (Mike, October 26). */
export interface LibraryInfo {
  path: string | null;
  /** True once the writer has said where the library is, or chosen "Not now". */
  asked: boolean;
  gitSync: boolean;
  isGit: boolean;
}

/** What is inside a folder the player wants to add, to help describe it as a world. */
export interface FolderShape {
  hasWorld: boolean;
  /** Top-level subfolders with the number of markdown files in each, most first. */
  folders: { name: string; markdown: number }[];
}

export interface Library {
  list(): Promise<ShelfWorld[]>;
  /** The world opened last, if it still exists, so the app can open it at launch. */
  last(): Promise<string | null>;
  /** Opens a world on the shelf and returns its files. */
  open(path: string): Promise<WorldFs>;
  /** Closes the open world. It stays on the shelf. */
  close(): Promise<void>;
  /** Takes a world off the shelf. Its files are untouched. */
  forget(path: string): Promise<void>;

  /** Asks for a folder, starting in `start` when given, such as the library. */
  pickFolder(title: string, start?: string | null): Promise<string | null>;
  pickImage(): Promise<ImageSource | null>;
  inspect(path: string): Promise<FolderShape>;
  /** Puts a folder on the shelf, writing `worldMd` into it when it has no world.md. */
  add(path: string, worldMd: string | null): Promise<void>;

  /** Where new worlds go unless the player picks another place. */
  defaultLocation(): Promise<string>;
  /** Creates a world folder inside `parent` and returns its path. */
  create(parent: string, folder: string, worldMd: string, dirs: string[]): Promise<string>;
  setCover(path: string, image: ImageSource): Promise<void>;
  /** Saves a shelf world's `world.md`, for example after its name changes. */
  writeWorldMd(path: string, text: string): Promise<void>;

  info(): Promise<LibraryInfo>;
  /** Sets where the library is on this computer, or clears it with null. */
  setLibrary(path: string | null): Promise<void>;
  /** Leaves the library for later, so the question is not asked again here. */
  skipLibrary(): Promise<void>;
  setGitSync(on: boolean): Promise<void>;
  /** The library's `immersion.md`, which holds what follows the writer everywhere. */
  readYou(): Promise<string | null>;
  writeYou(text: string): Promise<void>;
  /** Syncs `immersion.md` through Git now, bringing in what other computers saved there. */
  syncYou(): Promise<SyncReport>;

  /** The encrypted stories in a world's vault, by their random file names (Mike, October 26). */
  vaultList(world: string): Promise<string[]>;
  vaultRead(world: string, name: string): Promise<string>;
  vaultWrite(world: string, name: string, text: string): Promise<void>;
  /** Moves a story into the vault's own archive, still encrypted. */
  vaultArchive(world: string, name: string): Promise<void>;
  /** Keeps the vault key in this computer's keychain, or gives it back, or forgets it. */
  vaultRemember(key: string): Promise<void>;
  vaultRecall(): Promise<string | null>;
  vaultForget(): Promise<void>;
  /** The bytes of a picture the writer chose. */
  readPicture(image: ImageSource): Promise<Uint8Array>;
}
