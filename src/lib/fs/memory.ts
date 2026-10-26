import { imageExtension, IMAGE_EXTENSIONS, type DirEntry, type ImageSource, type WorldFs, type SyncReport } from './types.ts';

/**
 * An in-memory world for browser testing. Paths use forward slashes and are
 * relative to the world root, for example "wiki/people/wren-okafor.md".
 */
export class MemoryFs implements WorldFs {
  readonly kind = 'sample' as const;

  private files: Record<string, string>;

  constructor(files: Record<string, string>) {
    this.files = files;
  }

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
    return [...seen].map(([name, isDir]) => ({ name, isDir, modified: this.modified[prefix + name] ?? null }));
  }

  async exists(path: string): Promise<boolean> {
    const p = normalize(path);
    return p in this.files || Object.keys(this.files).some((f) => f.startsWith(p + '/'));
  }

  imageUrl(path: string): string {
    return this.files[normalize(path)] ?? '';
  }

  private listeners = new Set<(paths: string[]) => void>();
  private modified: Record<string, number> = {};
  // Words added during this session, for the heatmap. A browser test has no history.
  private writtenToday = 0;
  private dirs = new Set<string>();

  async writeText(path: string, content: string): Promise<void> {
    const words = (text: string | undefined) => (text ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    this.writtenToday += Math.max(0, words(content) - words(this.files[normalize(path)]));
    this.files[normalize(path)] = content;
    this.modified[normalize(path)] = Date.now();
    this.notify([normalize(path)]);
  }

  async createDir(path: string): Promise<void> {
    // An empty folder has no files, so a placeholder keeps it listable in memory.
    this.files[normalize(path) + '/.keep'] = '';
    this.dirs.add(normalize(path));
    this.notify([normalize(path)]);
  }

  async move(from: string, to: string): Promise<void> {
    const a = normalize(from);
    const b = normalize(to);
    if (await this.exists(b)) throw new Error(`${to} already exists`);
    for (const key of Object.keys(this.files)) {
      if (key === a || key.startsWith(a + '/')) {
        this.files[b + key.slice(a.length)] = this.files[key];
        delete this.files[key];
      }
    }
    this.notify([a, b]);
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

  async writingActivity(): Promise<{ days: [string, number][]; uncommitted: number } | null> {
    return { days: [], uncommitted: this.writtenToday };
  }

  // The browser test world pretends to sync, so the status can be seen.
  async sync(): Promise<SyncReport> {
    return { state: 'synced', message: '' };
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
