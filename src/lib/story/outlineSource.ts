import type { WorldFs } from '../fs/types';
import { slugify } from '../slug';
import { countWords, type Manuscript } from './index';
import { addChapter, fileTitle, nextChapterTitle, readOutline, renameChapter, setOutline } from './outline';

/** One card in outline view: a chapter, its outline, and where it is written. */
export interface Card {
  title: string;
  outline: string;
  words: number;
  /** The file that holds the chapter. */
  path: string;
  /** Where its heading starts in that file, or null when the chapter is the whole file. */
  offset: number | null;
}

/**
 * Reads and changes a manuscript's chapters for outline view. Every change reads the
 * file fresh and writes it back at once, so edits made elsewhere are never lost.
 */
export interface OutlineSource {
  load(): Promise<Card[]>;
  setOutline(i: number, outline: string): Promise<void>;
  rename(i: number, title: string): Promise<void>;
  /** Adds the next chapter and returns where it starts. */
  add(): Promise<{ path: string; offset: number | null }>;
}

/** A manuscript kept as one file, whose chapters are headings. */
export function fileSource(fs: WorldFs, path: string): OutlineSource {
  async function chapters() {
    const text = await fs.readText(path);
    return { text, chapters: readOutline(text) };
  }
  return {
    async load() {
      const { text, chapters: list } = await chapters();
      return list.map((c, i) => {
        const end = list[i + 1]?.offset ?? text.length;
        return { title: c.title, outline: c.outline, words: countWords(text.slice(c.offset, end)) - countWords(c.title), path, offset: c.offset };
      });
    },
    async setOutline(i, outline) {
      const { text, chapters: list } = await chapters();
      if (!list[i]) throw new Error('That chapter is gone. The outline has been reloaded.');
      await fs.writeText(path, setOutline(text, list[i].offset, outline));
    },
    async rename(i, title) {
      const { text, chapters: list } = await chapters();
      if (!list[i]) throw new Error('That chapter is gone. The outline has been reloaded.');
      await fs.writeText(path, renameChapter(text, list[i].offset, title));
    },
    async add() {
      const { text, chapters: list } = await chapters();
      const added = addChapter(text, nextChapterTitle(list));
      await fs.writeText(path, added.text);
      return { path, offset: added.offset };
    },
  };
}

/** A manuscript kept as a folder, whose chapters are its files in name order. */
export function folderSource(fs: WorldFs, manuscript: Manuscript): OutlineSource {
  const files = manuscript.sections.map((s) => s.path);
  async function chapter(i: number) {
    const path = files[i];
    if (!path) throw new Error('That chapter is gone. The outline has been reloaded.');
    let text = await fs.readText(path);
    let head = fileTitle(text);
    if (!head) {
      // A chapter file with no title heading gains one, so it has a place for its outline.
      text = `# ${manuscript.sections[i].title}\n\n${text}`;
      head = fileTitle(text)!;
    }
    return { path, text, head };
  }
  return {
    async load() {
      const cards: Card[] = [];
      for (let i = 0; i < files.length; i++) {
        const text = await fs.readText(files[i]);
        const head = fileTitle(text);
        cards.push({ title: head?.title ?? manuscript.sections[i].title, outline: head?.outline ?? '', words: countWords(text) - countWords(head?.title ?? ''), path: files[i], offset: null });
      }
      return cards;
    },
    async setOutline(i, outline) {
      const { path, text, head } = await chapter(i);
      await fs.writeText(path, setOutline(text, head.offset, outline));
    },
    async rename(i, title) {
      const { path, text, head } = await chapter(i);
      await fs.writeText(path, renameChapter(text, head.offset, title));
    },
    async add() {
      const title = nextChapterTitle(manuscript.sections);
      const n = String(files.length + 1).padStart(2, '0');
      let path = `${manuscript.path}/${n}-${slugify(title)}.md`;
      for (let k = 2; await fs.exists(path); k++) path = `${manuscript.path}/${n}-${slugify(title)}-${k}.md`;
      await fs.writeText(path, `# ${title}\n\n`);
      return { path, offset: null };
    },
  };
}
