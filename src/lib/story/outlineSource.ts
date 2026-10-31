import type { WorldFs } from '../fs/types';
import { slugify } from '../slug.ts';
import { countWords, type Manuscript } from './index.ts';
import { addChapter, fileTitle, moveChapter, nextChapterTitle, readOutline, removeThreadIn, renameChapter, renameThreadIn, setBeat, setOutline, type Beat } from './outline.ts';
import { MAIN_THREAD, threadsFromNames, listedThreads, withThreads, type Thread } from './threads.ts';
import { splitHeader, withHeader } from '../world.ts';
import { buildStoryIndex } from './index.ts';
import { readTitlePage, withTitlePage } from './book.ts';
import { newManuscript, renamePiece } from './manage.ts';
import { namesIn } from './threads.ts';
import { readStages, STRUCTURE_IDS, withStage } from './structures.ts';

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
  /** The part it holds in each story structure, by structure id. */
  stages: Record<string, string>;
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
  /** The board's story structure (Mike, October 28), on boards that can carry one. */
  structure?(): Promise<string | null>;
  setStructure?(id: string | null): Promise<void>;
  /** Records the part card `i` holds in a structure, or clears it with null. */
  setStage?(i: number, structure: string, part: string | null): Promise<void>;
  /** Puts the cards in this reading order, given as their current positions. */
  reorder?(order: number[]): Promise<void>;
  /**
   * On a series board: the words the books use for their parts, one when they agree and
   * several when they do not, and changing it on every book.
   */
  partWords?(): Promise<string[]>;
  setPartWord?(word: string): Promise<void>;
  /** On a series board: the words for one book of the series, such as Episode, and changing it on every book. */
  seriesWords?(): Promise<string[]>;
  setSeriesWord?(word: string): Promise<void>;
}

const beatMap = (beats: Beat[]) => Object.fromEntries(beats.map((b) => [b.thread, b.text]));

/** Where a board keeps the order and names of its threads. */
interface ThreadList {
  read(): Promise<string[]>;
  write(threads: Thread[]): Promise<void>;
}

/** A thread list kept as `threads:` in the header of one file. */
function headerList(fs: WorldFs, header: () => Promise<{ path: string; text: string }>): ThreadList {
  return {
    async read() {
      return listedThreads((await header()).text);
    },
    async write(threads) {
      const h = await header();
      await fs.writeText(h.path, withThreads(h.text, threads));
    },
  };
}

/**
 * The thread operations every board shares. `store` keeps the thread list, `texts`
 * lists the files that hold beats, and `found` reads the thread keys used in them.
 */
function threadOps(fs: WorldFs, store: ThreadList, texts: () => string[] | Promise<string[]>, found: () => Promise<string[]>) {
  async function list(): Promise<Thread[]> {
    return threadsFromNames(await store.read(), await found());
  }
  async function save(threads: Thread[]) {
    await store.write(threads);
  }
  function clean(name: string): string {
    const n = name.replace(/\s+/g, ' ').trim();
    if (!n) throw new Error('A thread needs a name.');
    return n;
  }
  async function rewrite(change: (text: string) => string) {
    for (const path of await texts()) {
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
        return { title: c.title, outline: c.outline, beats: beatMap(c.beats), words: countWords(text.slice(c.offset, end)) - countWords(c.title), path, offset: c.offset, stages: {} };
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
      headerList(fs, async () => ({ path, text: await fs.readText(path) })),
      () => [path],
      async () => readOutline(await fs.readText(path)).flatMap((c) => c.beats.map((b) => b.thread)),
    ),
  };
}

const EPILOGUE = /^epilogue\b/i;

/** A manuscript kept as a folder, whose chapters are its files in name order. */
export function folderSource(fs: WorldFs, manuscript: Manuscript): OutlineSource {
  const files = manuscript.sections.map((s) => s.path);
  const bookPath = `${manuscript.path}/book.md`;
  const bookText = async () => ((await fs.exists(bookPath)) ? await fs.readText(bookPath) : `# ${manuscript.title}\n`);

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
    // The board reads the chapters again at once, so this source follows them to their new names.
    files.splice(0, files.length, ...named.map((f) => f.target));
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
          stages: readStages(text),
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
      const title = nextChapterTitle(manuscript.sections, manuscript.partWord);
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
      files.push(path);
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
    async structure() {
      return knownStructure(splitHeader(await bookText()).header.structure);
    },
    async setStructure(id) {
      await fs.writeText(bookPath, withHeader(await bookText(), { structure: id ?? undefined }));
    },
    async setStage(i, structure, part) {
      const path = files[i];
      if (!path) throw new Error('That chapter is gone. The board has been reloaded.');
      await fs.writeText(path, withStage(await fs.readText(path), structure, part));
    },
    async reorder(order) {
      if (order.length !== files.length || order.some((i) => !files[i])) throw new Error('The chapters have changed. The board has been reloaded.');
      await renumber(order.map((i) => files[i]));
    },
    ...threadOps(
      fs,
      headerList(fs, async () => {
        const path = `${manuscript.path}/book.md`;
        return { path, text: (await fs.exists(path)) ? await fs.readText(path) : `# ${manuscript.title}\n` };
      }),
      () => files,
      async () => {
        const keys: string[] = [];
        for (const f of files) keys.push(...(fileTitle(await fs.readText(f))?.beats.map((b) => b.thread) ?? []));
        return keys;
      },
    ),
  };
}

/**
 * A series board (Mike, October 25): the books of one series along When, in the order
 * their title pages number them, with series threads alongside. A book's beat on a
 * series thread is kept in its `book.md`, under the book's title, the way a chapter's
 * beats sit under its heading. The world's `world.md` keeps each series' thread order.
 */
export function seriesSource(fs: WorldFs, root: string, series: string): OutlineSource {
  async function books() {
    const index = await buildStoryIndex(fs, root);
    const found: { m: Manuscript; book: string; text: string; page: ReturnType<typeof readTitlePage> }[] = [];
    for (const m of index.manuscripts) {
      if (!m.book) continue;
      const text = await fs.readText(m.book);
      const page = readTitlePage(text, m.title);
      if (page.series.trim().toLowerCase() === series.trim().toLowerCase()) found.push({ m, book: m.book, text, page });
    }
    return found.sort((a, b) => (a.page.number ?? 1e9) - (b.page.number ?? 1e9) || a.page.title.localeCompare(b.page.title));
  }
  async function at(i: number) {
    const list = await books();
    if (!list[i]) throw new Error('That book is gone. The board has been reloaded.');
    return { list, b: list[i] };
  }
  /** Writes the series order into each book's number. */
  async function renumber(order: { book: string; text: string; page: ReturnType<typeof readTitlePage> }[]) {
    for (const [n, b] of order.entries()) if (b.page.number !== n + 1) await fs.writeText(b.book, withTitlePage(b.text, { ...b.page, number: n + 1 }));
  }
  const store: ThreadList = {
    async read() {
      const { header } = splitHeader(await fs.readText('world.md'));
      const all = header.series_threads && typeof header.series_threads === 'object' ? (header.series_threads as Record<string, unknown>) : {};
      return namesIn(all[series]);
    },
    async write(threads) {
      const text = await fs.readText('world.md');
      const { header } = splitHeader(text);
      const all = { ...(header.series_threads && typeof header.series_threads === 'object' ? (header.series_threads as Record<string, unknown>) : {}) };
      if (threads.length === 1 && threads[0].name === MAIN_THREAD) delete all[series];
      else all[series] = threads.map((t) => t.name);
      await fs.writeText('world.md', withHeader(text, { series_threads: Object.keys(all).length ? all : undefined }));
    },
  };
  return {
    async load() {
      return (await books()).map(({ m, text, page }) => {
        const head = fileTitle(splitHeader(text).body);
        return { title: page.title, outline: head?.outline ?? '', beats: beatMap(head?.beats ?? []), words: m.words, path: m.book!, offset: null, stages: readStages(text, 'series_stages') };
      });
    },
    async setOutline(i, outline) {
      const { b } = await at(i);
      await fs.writeText(b.book, setBeatUnderTitle(b.text, '', outline));
    },
    async setBeat(i, thread, beat) {
      const { b } = await at(i);
      await fs.writeText(b.book, setBeatUnderTitle(b.text, thread, beat));
    },
    async rename(i, title) {
      const { b } = await at(i);
      await renamePiece(fs, b.m.path, title);
    },
    async add() {
      const list = await books();
      // A new book takes its author profile, or its author and copyright, from the latest book that has them.
      const last = [...list].reverse().find((b) => b.page.profile || b.page.author || b.page.copyright)?.page ?? list[list.length - 1]?.page;
      const word = list[list.length - 1]?.page.seriesWord || 'Story';
      let n = list.length + 1;
      let title = `${word} ${n}`;
      while (await fs.exists(`${root}/${slugify(title)}`)) title = `${word} ${++n}`;
      const made = await newManuscript(fs, root, title, { profile: last?.profile, author: last?.author, copyright: last?.copyright });
      const book = `${made.folder}/book.md`;
      const page = readTitlePage(await fs.readText(book), title);
      const parts = list[list.length - 1]?.page.partWord ?? 'Chapter';
      await fs.writeText(book, withTitlePage(await fs.readText(book), { ...page, series, number: list.length + 1, seriesWord: word, partWord: parts, year: last?.year ?? page.year }));
      return { path: book, offset: null };
    },
    async move(from, to) {
      const list = await books();
      if (from === to || !list[from] || to < 0 || to >= list.length) return;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      await renumber(list);
    },
    // A series' structure is kept in world.md beside its threads, and each book's part
    // in its own book.md, apart from the structure of its chapters.
    async structure() {
      const all = splitHeader(await fs.readText('world.md')).header.series_structures;
      return knownStructure(all && typeof all === 'object' ? (all as Record<string, unknown>)[series] : null);
    },
    async setStructure(id) {
      const text = await fs.readText('world.md');
      const { header } = splitHeader(text);
      const all = { ...(header.series_structures && typeof header.series_structures === 'object' ? (header.series_structures as Record<string, unknown>) : {}) };
      if (id) all[series] = id;
      else delete all[series];
      await fs.writeText('world.md', withHeader(text, { series_structures: Object.keys(all).length ? all : undefined }));
    },
    // What a series' books call their parts lives in each book's title page, so a book
    // read on its own still knows. The series board sets it on all of them at once.
    // Books written by hand can disagree, so every word in use is reported, not just the
    // first book's, and setting one word reaches every book that differs (Mike, October 31).
    async partWords() {
      return [...new Set((await books()).map((b) => b.page.partWord))];
    },
    async setPartWord(word) {
      const clean = word.replace(/\s+/g, ' ').trim() || 'Chapter';
      for (const b of await books()) if (b.page.partWord !== clean) await fs.writeText(b.book, withTitlePage(b.text, { ...b.page, partWord: clean }));
    },
    async seriesWords() {
      return [...new Set((await books()).map((b) => b.page.seriesWord))];
    },
    async setSeriesWord(word) {
      const clean = word.replace(/\s+/g, ' ').trim() || 'Story';
      for (const b of await books()) if (b.page.seriesWord !== clean) await fs.writeText(b.book, withTitlePage(b.text, { ...b.page, seriesWord: clean }));
    },
    async setStage(i, structure, part) {
      const { b } = await at(i);
      await fs.writeText(b.book, withStage(b.text, structure, part, 'series_stages'));
    },
    async reorder(order) {
      const list = await books();
      if (order.length !== list.length || order.some((i) => !list[i])) throw new Error('The books have changed. The board has been reloaded.');
      await renumber(order.map((i) => list[i]));
    },
    ...threadOps(
      fs,
      store,
      async () => (await books()).map((b) => b.book),
      async () => {
        const keys: string[] = [];
        for (const b of await books()) keys.push(...(fileTitle(splitHeader(b.text).body)?.beats.map((x) => x.thread) ?? []));
        return keys;
      },
    ),
  };
}

/** A structure's id, when it is one Immersion knows. */
function knownStructure(id: unknown): string | null {
  return typeof id === 'string' && STRUCTURE_IDS.includes(id) ? id : null;
}

/** Sets a beat under a `book.md`'s title heading, keeping its header. */
function setBeatUnderTitle(text: string, thread: string, beat: string): string {
  const { body } = splitHeader(text);
  const head = text.slice(0, text.length - body.length);
  const title = fileTitle(body);
  if (!title) throw new Error('This book has no title heading to keep its series beats under.');
  return head + setBeat(body, title.offset, thread, beat);
}
