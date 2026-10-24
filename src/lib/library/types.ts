import type { ImageSource, WorldFs } from '../fs/types';

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

  pickFolder(title: string): Promise<string | null>;
  pickImage(): Promise<ImageSource | null>;
  inspect(path: string): Promise<FolderShape>;
  /** Puts a folder on the shelf, writing `worldMd` into it when it has no world.md. */
  add(path: string, worldMd: string | null): Promise<void>;

  /** Where new worlds go unless the player picks another place. */
  defaultLocation(): Promise<string>;
  /** Creates a world folder inside `parent` and returns its path. */
  create(parent: string, folder: string, worldMd: string, dirs: string[]): Promise<string>;
  setCover(path: string, image: ImageSource): Promise<void>;
}
