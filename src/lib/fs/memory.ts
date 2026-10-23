import type { DirEntry, WorldFs } from './types';

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
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');
}
