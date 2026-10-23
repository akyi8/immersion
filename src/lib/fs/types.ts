/**
 * Everything the app knows comes from the world's files (architecture decision 1).
 * The screens reach those files only through this interface, which has two
 * implementations: the real disk inside the desktop app, and an in-memory sample
 * world for testing in an ordinary browser.
 */
export interface DirEntry {
  name: string;
  isDir: boolean;
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
  /**
   * Calls back with the paths of files that changed, whoever changed them: this app,
   * Obsidian, a text editor, or a git pull. Returns a function that stops listening.
   */
  onChange(callback: (paths: string[]) => void): () => void;
}
