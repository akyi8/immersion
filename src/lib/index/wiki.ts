import type { WorldFs } from '../fs/types';
import { splitHeader, type World } from '../world';
import { parseEntry, plainText } from './parse';
import { MentionScanner, type Term } from './scanner';
import { parseWhen, type When } from '../time/when';

/**
 * The index of a world's wiki (architecture decision 1). It is built from the files
 * every time the world opens and is never treated as the source of truth.
 */
export interface Entry {
  /** The file's path inside the world folder, which is also the entry's identity. */
  id: string;
  name: string;
  aliases: string[];
  /** The top-level wiki folder the entry sits in, such as "people". */
  category: string;
  body: string;
  summary: string;
  imagePath: string | null;
  /** When it happened, from its `when:` line, which puts it on the timeline. */
  when: When | null;
  /** An era: a span of time whose events belong to it (Mike, October 25). */
  era: boolean;
}

export interface Folder {
  name: string;
  path: string;
  folders: Folder[];
  /** Entry ids directly in this folder, sorted by name. */
  entries: string[];
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
/** Sidecar roles that belong to another file rather than being entries themselves. */
const SIDECAR = /\.(notes|outline|summary)\.md$/i;

export class WikiIndex {
  readonly scanner: MentionScanner;
  private mentionsOf = new Map<string, string[]>();
  private pairCounts = new Map<string, Map<string, number>>();

  constructor(
    readonly entries: Map<string, Entry>,
    readonly root: Folder,
  ) {
    const terms: Term[] = [];
    for (const e of entries.values()) {
      terms.push({ text: e.name, id: e.id });
      for (const a of e.aliases) terms.push({ text: a, id: e.id });
    }
    this.scanner = new MentionScanner(terms);

    for (const e of entries.values()) {
      const mentioned = this.scanner.idsIn(plainText(e.body)).filter((id) => id !== e.id);
      this.mentionsOf.set(e.id, mentioned);
      const together = [e.id, ...mentioned];
      for (const a of together) {
        for (const b of together) {
          if (a === b) continue;
          const row = this.pairCounts.get(a) ?? new Map<string, number>();
          row.set(b, (row.get(b) ?? 0) + 1);
          this.pairCounts.set(a, row);
        }
      }
    }
  }

  get(id: string): Entry | undefined {
    return this.entries.get(id);
  }

  /** Entries this entry mentions, in the order it first mentions them. */
  mentionedIn(id: string): string[] {
    return this.mentionsOf.get(id) ?? [];
  }

  /**
   * Entries that most often appear on the same pages as this one, excluding the ones
   * this entry already mentions itself (feature 40, appears-with lists).
   */
  appearsWith(id: string, limit = 8): string[] {
    const own = new Set(this.mentionedIn(id));
    const row = this.pairCounts.get(id);
    if (!row) return [];
    return [...row]
      .filter(([other]) => !own.has(other) && this.entries.has(other))
      .sort((a, b) => b[1] - a[1] || this.entries.get(a[0])!.name.localeCompare(this.entries.get(b[0])!.name))
      .slice(0, limit)
      .map(([other]) => other);
  }

  /** Every entry, sorted by name. */
  all(): Entry[] {
    return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export async function buildWikiIndex(fs: WorldFs, world: World): Promise<WikiIndex> {
  const entries = new Map<string, Entry>();

  async function walk(path: string, name: string, category: string | null): Promise<Folder> {
    const folder: Folder = { name, path, folders: [], entries: [] };
    if (!(await fs.exists(path))) return folder;
    const listing = await fs.readDir(path);
    const fileNames = new Set(listing.filter((d) => !d.isDir).map((d) => d.name));

    for (const item of listing) {
      if (item.name.startsWith('.')) continue;
      const childPath = `${path}/${item.name}`;
      if (item.isDir) {
        // Archived entries stay on disk but out of the app, as the repository's archive convention asks.
        if (!/^archive$/i.test(item.name)) folder.folders.push(await walk(childPath, item.name, category ?? item.name));
        continue;
      }
      if (!/\.md$/i.test(item.name) || SIDECAR.test(item.name) || /^readme\.md$/i.test(item.name)) continue;

      const { header, body } = splitHeader(await fs.readText(childPath));
      const parsed = parseEntry(header, body, item.name);
      const stem = item.name.replace(/\.md$/i, '');
      const image = IMAGE_EXTENSIONS.map((ext) => `${stem}.${ext}`).find((f) => fileNames.has(f));
      entries.set(childPath, {
        id: childPath,
        name: parsed.name,
        aliases: parsed.aliases,
        category: category ?? 'Uncategorized',
        body: parsed.body,
        summary: parsed.summary,
        imagePath: image ? `${path}/${image}` : null,
        when: parseWhen(header.when),
        era: header.era === true && !!parseWhen(header.when),
      });
      folder.entries.push(childPath);
    }

    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.entries.sort((a, b) => entries.get(a)!.name.localeCompare(entries.get(b)!.name));
    return folder;
  }

  const root = await walk(world.wikiDir, world.wikiDir, null);
  return new WikiIndex(entries, root);
}

/** Turns a folder name like "people" into a heading like "People". */
export function folderLabel(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
