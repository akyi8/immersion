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
}
