import { imageExtension, IMAGE_EXTENSIONS, type DirEntry, type ImageSource, type WorldFs } from './types';

/**
 * An in-memory world for browser testing. Paths use forward slashes and are
 * relative to the world root, for example "wiki/people/wren-okafor.md".
 */
export class MemoryFs implements WorldFs {
  readonly kind = 'sample' as const;

  constructor(private files: Record<string, string>) {}

  async readText(path: string): Promise<string> {
    const text = this.files[normalize(path)];
    if (text === undefined) throw new Error(`No such file: ${path}`);
    return text;
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const prefix = normalize(path) === '' ? '' : normalize(path) + '/';
    const seen = new Map<string, boolean>();
    for (const file of Object.keys(this.files)) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) seen.set(rest, false);
      else seen.set(rest.slice(0, slash), true);
    }
    return [...seen].map(([name, isDir]) => ({ name, isDir }));
  }

  async exists(path: string): Promise<boolean> {
    const p = normalize(path);
    return p in this.files || Object.keys(this.files).some((f) => f.startsWith(p + '/'));
  }

  imageUrl(path: string): string {
    return this.files[normalize(path)] ?? '';
  }

  private listeners = new Set<(paths: string[]) => void>();
  private dirs = new Set<string>();

  async writeText(path: string, content: string): Promise<void> {
    this.files[normalize(path)] = content;
    this.notify([normalize(path)]);
  }

  async createDir(path: string): Promise<void> {
    // An empty folder has no files, so a placeholder keeps it listable in memory.
    this.files[normalize(path) + '/.keep'] = '';
    this.dirs.add(normalize(path));
    this.notify([normalize(path)]);
  }

  async setImage(stem: string, image: ImageSource): Promise<string> {
    if (image.kind !== 'file') throw new Error('A browser takes pictures as files.');
    const ext = imageExtension(image.file.name);
    if (!ext) throw new Error('Pictures can be JPEG, PNG, or WebP files.');
    const base = normalize(stem);
    for (const other of IMAGE_EXTENSIONS) delete this.files[`${base}.${other}`];
    const path = `${base}.${ext}`;
    this.files[path] = URL.createObjectURL(image.file);
    this.notify([path]);
    return path;
  }

  onChange(callback: (paths: string[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(paths: string[]) {
    // Like the disk watcher, report changes after the write has finished.
    setTimeout(() => this.listeners.forEach((l) => l(paths)), 0);
  }
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');
}
