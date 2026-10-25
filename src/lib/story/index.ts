import type { WorldFs } from '../fs/types';
import { splitHeader } from '../world.ts';
import { withoutOutlines } from './outline.ts';

/**
 * The Story module's view of a world's stories folder (design: the binder and the
 * drawer). Manuscripts are the pieces the writer declared, with `manuscript: true` in a
 * file's header, or in a folder's `book.md`. Every other markdown file is in the drawer.
 * Like the wiki index, this can be thrown away and rebuilt from the files at any time.
 */

/** A chapter or scene. In a one-file manuscript it is a heading; in a folder, a file. */
export interface Section {
  title: string;
  /** The file that holds it. */
  path: string;
  /** Where its heading starts in that file, or null when the section is the whole file. */
  offset: number | null;
  /** 2 for a chapter, 3 for a scene, by heading depth below the title. */
  depth: number;
  words: number;
  /** The part it belongs to, for a manuscript folder with part folders. */
  part: string | null;
}

export interface Manuscript {
  kind: 'file' | 'folder';
  /** The manuscript's file, or its folder. */
  path: string;
  title: string;
  words: number;
  modified: number | null;
  sections: Section[];
}

export interface DrawerItem {
  path: string;
  title: string;
  words: number;
  modified: number | null;
  /** The folder it sits in, relative to the stories folder, or '' at the top. */
  group: string;
}

export interface StoryIndex {
  root: string;
  manuscripts: Manuscript[];
  drawer: DrawerItem[];
}

/** Sidecar files belong to another file and never appear on their own. */
const SIDECAR = /\.(outline|notes|summary)\.md$/i;
const ARCHIVE = /^(archive|old)$/i;

/** Counts the words a reader would see, leaving out markdown marks, headers, and link addresses. */
export function countWords(markdown: string): number {
  const { body } = splitHeader(markdown);
  const text = withoutOutlines(body)
    .replace(/\[!\w+\]/g, ' ')
    .replace(/\]\([^)]*\)/g, ' ')
    .replace(/[#>*_`~[\]|]/g, ' ');
  let count = 0;
  for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) count += 1;
  return count;
}

interface Heading {
  level: number;
  title: string;
  offset: number;
}

/** The ATX headings in a markdown body, skipping fenced code. Offsets are into `text`. */
export function headingsOf(text: string): Heading[] {
  const out: Heading[] = [];
  let fenced = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const m = !fenced && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, title: m[2].trim(), offset });
    offset += line.length + 1;
  }
  return out;
}

/** A name for a file from its file name, such as "the-road-south.md" to "The Road South". */
export function titleFromName(name: string): string {
  const stem = name.replace(/\.md$/i, '').replace(/^\d+[-_ ]+/, '');
  return stem
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** A file's title: its header's `title`, else its first top heading, else its file name. */
export function titleOf(text: string, fileName: string): string {
  const { header, body } = splitHeader(text);
  if (typeof header.title === 'string' && header.title.trim()) return header.title.trim();
  const first = headingsOf(body).find((h) => h.level === 1);
  return first?.title ?? titleFromName(fileName);
}

export function isManuscript(text: string): boolean {
  return splitHeader(text).header.manuscript === true;
}

/**
 * The chapters and scenes of a one-file manuscript. A single top heading is the title,
 * so its second-level headings are chapters and third-level headings are scenes. When
 * there are several top headings, they are the chapters.
 */
export function sectionsOfFile(text: string, path: string): Section[] {
  const headings = headingsOf(text);
  const tops = headings.filter((h) => h.level === 1);
  const chapterLevel = tops.length > 1 ? 1 : 2;
  const kept = headings.filter((h) => h.level === chapterLevel || h.level === chapterLevel + 1);
  return kept.map((h, i) => {
    // A section runs to the next heading at its own level or above.
    const end = kept.slice(i + 1).find((k) => k.level <= h.level)?.offset ?? text.length;
    return {
      title: h.title,
      path,
      offset: h.offset,
      depth: h.level - chapterLevel + 2,
      words: countWords(text.slice(h.offset, end)) - countWords(h.title),
      part: null,
    };
  });
}

/** Sorts file names the way a person counts: "2-x" before "10-x". */
export function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export async function buildStoryIndex(fs: WorldFs, root: string): Promise<StoryIndex> {
  const index: StoryIndex = { root, manuscripts: [], drawer: [] };
  if (!(await fs.exists(root))) return index;

  async function folderManuscript(dir: string, bookText: string): Promise<Manuscript> {
    const sections: Section[] = [];
    let words = 0;
    let modified: number | null = null;
    async function walk(folder: string, part: string | null) {
      const entries = (await fs.readDir(folder)).filter((e) => !e.name.startsWith('.')).sort((a, b) => byName(a.name, b.name));
      for (const e of entries) {
        const path = `${folder}/${e.name}`;
        if (e.isDir) {
          if (!ARCHIVE.test(e.name)) await walk(path, titleFromName(e.name));
        } else if (/\.md$/i.test(e.name) && !SIDECAR.test(e.name) && !(folder === dir && /^book\.md$/i.test(e.name))) {
          const text = await fs.readText(path);
          const count = countWords(text);
          words += count;
          modified = Math.max(modified ?? 0, e.modified ?? 0) || modified;
          sections.push({ title: titleOf(text, e.name), path, offset: null, depth: 2, words: count, part });
        }
      }
    }
    await walk(dir, null);
    const name = dir.split('/').pop()!;
    return { kind: 'folder', path: dir, title: titleOf(bookText, name), words, modified, sections };
  }

  async function walk(dir: string, group: string) {
    const entries = (await fs.readDir(dir)).filter((e) => !e.name.startsWith('.')).sort((a, b) => byName(a.name, b.name));
    for (const e of entries) {
      const path = `${dir}/${e.name}`;
      if (e.isDir) {
        if (ARCHIVE.test(e.name)) continue;
        const book = `${path}/book.md`;
        if ((await fs.exists(book)) && isManuscript(await fs.readText(book))) {
          index.manuscripts.push(await folderManuscript(path, await fs.readText(book)));
        } else {
          await walk(path, group ? `${group}/${e.name}` : e.name);
        }
      } else if (/\.md$/i.test(e.name) && !SIDECAR.test(e.name)) {
        const text = await fs.readText(path);
        if (isManuscript(text)) {
          index.manuscripts.push({
            kind: 'file',
            path,
            title: titleOf(text, e.name),
            words: countWords(text),
            modified: e.modified ?? null,
            sections: sectionsOfFile(text, path),
          });
        } else {
          index.drawer.push({ path, title: titleOf(text, e.name), words: countWords(text), modified: e.modified ?? null, group });
        }
      }
    }
  }

  await walk(root, '');
  index.manuscripts.sort((a, b) => byName(a.title, b.title));
  // The drawer shows what was touched most recently first.
  index.drawer.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0) || byName(a.title, b.title));
  return index;
}
