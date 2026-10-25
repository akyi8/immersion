import type { WorldFs } from '../fs/types';
import { slugify } from '../slug.ts';
import { countWords, type Manuscript } from './index.ts';
import { addChapter, fileTitle, moveChapter, nextChapterTitle, readOutline, removeThreadIn, renameChapter, renameThreadIn, setBeat, setOutline, type Beat } from './outline.ts';
import { threadsFrom, withThreads, type Thread } from './threads.ts';

/** One card in outline view: a chapter, its outline, and where it is written. */
export interface Card {
  title: string;
  /** The main thread's beat. */
  outline: string;
  /** Each thread's beat, by thread key; the main thread's key is ''. */
  beats: Record<string, string>;
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
  /** Moves the chapter at `from` to position `to`, with everything in it. */
  move(from: number, to: number): Promise<void>;
  /** The manuscript's threads, main thread first. */
  threads(): Promise<Thread[]>;
  setBeat(i: number, thread: string, text: string): Promise<void>;
  addThread(name: string): Promise<void>;
  renameThread(key: string, name: string): Promise<void>;
  /** Moves a thread one place earlier (-1) or later (1). The main thread stays first. */
  moveThread(key: string, by: -1 | 1): Promise<void>;
  /** Removes a thread and every beat on it. The main thread cannot be removed. */
  removeThread(key: string): Promise<void>;
}

const beatMap = (beats: Beat[]) => Object.fromEntries(beats.map((b) => [b.thread, b.text]));

/**
 * The thread operations every manuscript shares. `header` is the file whose header keeps
 * the thread list, `texts` lists the files that hold chapters, and `found` reads the
 * thread keys used in those files.
 */
function threadOps(fs: WorldFs, header: () => Promise<{ path: string; text: string }>, texts: () => string[], found: () => Promise<string[]>) {
  async function list(): Promise<Thread[]> {
    return threadsFrom((await header()).text, await found());
  }
  async function save(threads: Thread[]) {
    const h = await header();
    await fs.writeText(h.path, withThreads(h.text, threads));
  }
  function clean(name: string): string {
    const n = name.replace(/\s+/g, ' ').trim();
    if (!n) throw new Error('A thread needs a name.');
    return n;
  }
  async function rewrite(change: (text: string) => string) {
    for (const path of texts()) {
      const text = await fs.readText(path);
      const next = change(text);
      if (next !== text) await fs.writeText(path, next);
    }
  }
  return {
    threads: list,
    async addThread(name: string) {
      const n = clean(name);
      const threads = await list();
      if (threads.some((t) => t.name.toLowerCase() === n.toLowerCase())) throw new Error(`There is already a thread called ${n}.`);
      await save([...threads, { key: n, name: n }]);
    },
    async renameThread(key: string, name: string) {
      const n = clean(name);
      const threads = await list();
      if (threads.some((t) => t.key !== key && t.name.toLowerCase() === n.toLowerCase())) throw new Error(`There is already a thread called ${n}.`);
      // The main thread's beats carry no label, so renaming it changes only the list.
      if (key) await rewrite((text) => renameThreadIn(text, key, n));
      await save(threads.map((t) => (t.key === key ? { key: key ? n : '', name: n } : t)));
    },
    async moveThread(key: string, by: -1 | 1) {
      const threads = await list();
      const i = threads.findIndex((t) => t.key === key);
      if (i <= 0 || i + by <= 0 || i + by >= threads.length) return;
      const [t] = threads.splice(i, 1);
      threads.splice(i + by, 0, t);
      await save(threads);
    },
    async removeThread(key: string) {
      if (!key) throw new Error('The main thread stays.');
      await rewrite((text) => removeThreadIn(text, key));
      await save((await list()).filter((t) => t.key !== key));
    },
  };
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
        return { title: c.title, outline: c.outline, beats: beatMap(c.beats), words: countWords(text.slice(c.offset, end)) - countWords(c.title), path, offset: c.offset };
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
    async move(from, to) {
      const text = await fs.readText(path);
      await fs.writeText(path, moveChapter(text, from, to));
    },
    async setBeat(i, thread, beat) {
      const { text, chapters: list } = await chapters();
      if (!list[i]) throw new Error('That chapter is gone. The outline has been reloaded.');
      await fs.writeText(path, setBeat(text, list[i].offset, thread, beat));
    },
    ...threadOps(
      fs,
      async () => ({ path, text: await fs.readText(path) }),
      () => [path],
      async () => readOutline(await fs.readText(path)).flatMap((c) => c.beats.map((b) => b.thread)),
    ),
  };
}

const EPILOGUE = /^epilogue\b/i;

/** A manuscript kept as a folder, whose chapters are its files in name order. */
export function folderSource(fs: WorldFs, manuscript: Manuscript): OutlineSource {
  const files = manuscript.sections.map((s) => s.path);

  /**
   * Renumbers chapter files in the given order. Each moves to a temporary name first, so
   * no two files ever want the same name at once. Returns where each file went.
   */
  async function renumber(order: string[]): Promise<Map<string, string>> {
    const named = order.map((path, i) => {
      const folder = path.slice(0, path.lastIndexOf('/'));
      const name = path.slice(path.lastIndexOf('/') + 1).replace(/^\d+[-_ ]*/, '');
      return { path, temp: `${path}.reordering`, target: `${folder}/${String(i + 1).padStart(2, '0')}-${name}` };
    });
    for (const f of named) if (f.path !== f.target) await fs.move(f.path, f.temp);
    for (const f of named) if (f.path !== f.target) await fs.move(f.temp, f.target);
    return new Map(named.map((f) => [f.path, f.target]));
  }
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
        cards.push({
          title: head?.title ?? manuscript.sections[i].title,
          outline: head?.outline ?? '',
          beats: beatMap(head?.beats ?? []),
          words: countWords(text) - countWords(head?.title ?? ''),
          path: files[i],
          offset: null,
        });
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
      // A new chapter goes before an epilogue, which stays last (Mike, October 25).
      if (files.length && EPILOGUE.test(manuscript.sections[files.length - 1].title)) {
        const order = [...files.slice(0, -1), path, files[files.length - 1]];
        const moved = await renumber(order);
        return { path: moved.get(path) ?? path, offset: null };
      }
      return { path, offset: null };
    },
    async move(from, to) {
      if (from === to || !files[from] || to < 0 || to >= files.length) return;
      const order = [...files];
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      await renumber(order);
    },
    async setBeat(i, thread, beat) {
      const { path, text, head } = await chapter(i);
      await fs.writeText(path, setBeat(text, head.offset, thread, beat));
    },
    ...threadOps(
      fs,
      async () => {
        const path = `${manuscript.path}/book.md`;
        return { path, text: (await fs.exists(path)) ? await fs.readText(path) : `# ${manuscript.title}\n` };
      },
      () => files,
      async () => {
        const keys: string[] = [];
        for (const f of files) keys.push(...(fileTitle(await fs.readText(f))?.beats.map((b) => b.thread) ?? []));
        return keys;
      },
    ),
  };
}
