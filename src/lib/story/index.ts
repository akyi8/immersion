import type { WorldFs } from '../fs/types';
import { splitHeader } from '../world.ts';
import { withoutOutlines } from './outline.ts';

/**
 * The Story module's view of a world's stories folder (Mike, October 25). Where a piece
 * sits says how active it is, so the folders are the whole of the bookkeeping:
 *
 * - the desk is the stories folder itself, and holds the manuscripts being worked on;
 * - the drawer is `ideas/`, and holds what might be worked on later;
 * - the shelf is `finished/`, and holds what is finished or published.
 *
 * A manuscript is a folder. Its `book.md` holds the title page, its files are its
 * chapters in name order, and its `front/` and `back/` folders hold the pages before
 * and after the story, such as a dedication. A folder inside it is a part. A loose file
 * is a note (Mike, October 26): one page, wherever it sits, until the writer chooses to
 * make it a manuscript.
 * `export/` and `archive/` are kept out of the app. Like the wiki index, this can be
 * thrown away and rebuilt from the files at any time.
 */

export type Place = 'desk' | 'drawer' | 'shelf';

/** The folder inside the stories folder that holds each place, '' for the stories folder itself. */
export const PLACE_FOLDERS: Record<Place, string> = { desk: '', drawer: 'ideas', shelf: 'finished' };

/** Folders inside the stories folder that are not manuscripts. */
const RESERVED = /^(ideas|finished|export|archive|old)$/i;

/** The folder inside the stories folder that holds a place. */
export function placeFolder(root: string, place: Place): string {
  return PLACE_FOLDERS[place] ? `${root}/${PLACE_FOLDERS[place]}` : root;
}

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
  /** A note kept as one file, or a manuscript kept as a folder. */
  kind: 'file' | 'folder';
  /** The manuscript's file, or its folder. */
  path: string;
  title: string;
  /** The words of the story itself, without front and back matter. */
  words: number;
  modified: number | null;
  place: Place;
  /** The chapters, including a prologue and an epilogue. */
  sections: Section[];
  /** The pages before the story, from `front/`. */
  front: Section[];
  /** The pages after the story, from `back/`. */
  back: Section[];
  /** The title page, `book.md`, for a folder that has one. */
  book: string | null;
  /** The series its title page names, and its number in that series. */
  series: string | null;
  number: number | null;
}

export interface StoryIndex {
  root: string;
  /** True when the stories folder the world names is not there. */
  missing: boolean;
  /** Every manuscript in every place, by title. */
  manuscripts: Manuscript[];
}

/** Sidecar files belong to another file and never appear on their own. */
const SIDECAR = /\.(outline|notes|summary)\.md$/i;
const ARCHIVE = /^(archive|old)$/i;

/** Every file a manuscript is made of, which panes may show. */
export function filesOf(m: Manuscript): string[] {
  const files = [...m.front, ...m.sections, ...m.back].map((s) => s.path);
  if (m.book) files.unshift(m.book);
  if (m.kind === 'file') files.unshift(m.path);
  return [...new Set(files)];
}

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

/** A name for a file from its file name, such as "the-long-road.md" to "The Long Road". */
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
  const index: StoryIndex = { root, missing: false, manuscripts: [] };
  if (!(await fs.exists(root))) return { ...index, missing: true };

  const list = async (dir: string) => (await fs.readDir(dir)).filter((e) => !e.name.startsWith('.')).sort((a, b) => byName(a.name, b.name));
  const isPiece = (name: string) => /\.md$/i.test(name) && !SIDECAR.test(name);

  async function folderManuscript(dir: string, place: Place): Promise<Manuscript> {
    const m: Manuscript = { kind: 'folder', path: dir, title: titleFromName(dir.split('/').pop()!), words: 0, modified: null, place, sections: [], front: [], back: [], book: null, series: null, number: null };
    async function read(path: string, name: string, modified: number | null | undefined, part: string | null, into: Section[], counts: boolean) {
      const text = await fs.readText(path);
      const words = countWords(text);
      if (counts) m.words += words;
      m.modified = Math.max(m.modified ?? 0, modified ?? 0) || m.modified;
      into.push({ title: titleOf(text, name), path, offset: null, depth: 2, words, part });
    }
    async function walk(folder: string, part: string | null, into: Section[], counts: boolean) {
      for (const e of await list(folder)) {
        const path = `${folder}/${e.name}`;
        if (e.isDir) {
          if (ARCHIVE.test(e.name)) continue;
          if (folder === dir && /^front$/i.test(e.name)) await walk(path, null, m.front, false);
          else if (folder === dir && /^back$/i.test(e.name)) await walk(path, null, m.back, false);
          else await walk(path, titleFromName(e.name), into, counts);
        } else if (folder === dir && /^book\.md$/i.test(e.name)) {
          m.book = path;
          const text = await fs.readText(path);
          m.title = titleOf(text, dir.split('/').pop()!);
          const { header } = splitHeader(text);
          if (typeof header.series === 'string' && header.series.trim()) m.series = header.series.trim();
          if (typeof header.number === 'number') m.number = header.number;
          m.modified = Math.max(m.modified ?? 0, e.modified ?? 0) || m.modified;
        } else if (isPiece(e.name)) {
          await read(path, e.name, e.modified, part, into, counts);
        }
      }
    }
    await walk(dir, null, m.sections, true);
    return m;
  }

  async function place(dir: string, where: Place) {
    if (!(await fs.exists(dir))) return;
    for (const e of await list(dir)) {
      const path = `${dir}/${e.name}`;
      if (e.isDir) {
        if (where === 'desk' ? RESERVED.test(e.name) : ARCHIVE.test(e.name)) continue;
        index.manuscripts.push(await folderManuscript(path, where));
      } else if (isPiece(e.name)) {
        const text = await fs.readText(path);
        index.manuscripts.push({
          kind: 'file',
          path,
          title: titleOf(text, e.name),
          words: countWords(text),
          modified: e.modified ?? null,
          place: where,
          sections: sectionsOfFile(text, path),
          front: [],
          back: [],
          book: null,
          series: null,
          number: null,
        });
      }
    }
  }

  for (const where of ['desk', 'drawer', 'shelf'] as Place[]) await place(placeFolder(root, where), where);
  index.manuscripts.sort((a, b) => byName(a.title, b.title));
  return index;
}
