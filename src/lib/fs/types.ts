/**
 * Everything the app knows comes from the world's files (architecture decision 1).
 * The screens reach those files only through this interface, which has two
 * implementations: the real disk inside the desktop app, and an in-memory sample
 * world for testing in an ordinary browser.
 */
export interface DirEntry {
  name: string;
  isDir: boolean;
  /** When the file last changed, in milliseconds since 1970, when known. */
  modified?: number | null;
}

/**
 * A picture the player chose or dropped. Inside the desktop app it is a path on disk.
 * In a browser it is the dropped or picked file itself.
 */
export type ImageSource = { kind: 'path'; path: string } | { kind: 'file'; file: File };

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/** The lowercase extension of a picture's name, if it is a picture the app accepts. */
export function imageExtension(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(ext) && name.includes('.') ? ext : null;
}

export interface WorldFs {
  /** A short label for where the files come from, shown in diagnostics. */
  readonly kind: 'disk' | 'sample';
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  /** A URL the webview can load an image from. */
  imageUrl(path: string): string;
  /** Saves a file, creating its folder if needed. The save is all-or-nothing. */
  writeText(path: string, content: string): Promise<void>;
  /** Creates a folder, and any missing folders above it. */
  createDir(path: string): Promise<void>;
  /** Moves or renames a file or folder. Refuses to replace anything already there. */
  move(from: string, to: string): Promise<void>;
  /**
   * Copies a picture in as the image for `stem`, a file's path without its extension,
   * replacing any earlier picture for that stem. Returns the picture's new path.
   */
  setImage(stem: string, image: ImageSource): Promise<string>;
  /**
   * Calls back with the paths of files that changed, whoever changed them: this app,
   * Obsidian, a text editor, or a git pull. Returns a function that stops listening.
   */
  onChange(callback: (paths: string[]) => void): () => void;
  /**
   * Words written per day in a folder over the last `days` days, for the activity
   * heatmap. Null when there is no history to read, such as a world outside git.
   */
  writingActivity(dir: string, days: number): Promise<{ days: [string, number][]; uncommitted: number } | null>;
  /**
   * Syncs the world through Git (Mike, October 26): commits its own folder, brings in
   * what other computers pushed, and pushes.
   */
  sync(name: string): Promise<SyncReport>;
  /** What waits to sync for this world and `immersion.md`, from Git on this computer. */
  pending(fetch: boolean): Promise<Pending>;
}

/**
 * What waits to sync (Mike, October 28): files that would go out to other computers, and
 * files that would come in. `local` means Git with nowhere to push to.
 */
export interface Pending {
  state: 'git' | 'local' | 'not-git' | 'off';
  out: number;
  incoming: number;
}

export interface SyncReport {
  state: 'synced' | 'local' | 'waiting' | 'off' | 'not-git' | 'problem';
  message: string;
}
