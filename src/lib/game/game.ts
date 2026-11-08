import { readElement, readGameFile, readKind, type Element, type Kind } from './elements.ts';
import { splitHeader, withHeader } from '../world.ts';
import type { DirEntry } from '../fs/types';

/**
 * A game as the Game module shows it (Mike, November 7): the engine's elements and the
 * world's own, put together. Core elements appear in every game, except the ones a world
 * sets aside or reskins. A world records those choices in its own folder, never on the
 * core element, so the engine stays the same for every game built on it.
 */

/** The few file operations a game needs, which a world's files and an engine's both offer. */
export interface GameFs {
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  writeText(path: string, content: string): Promise<void>;
}

export type Origin = 'engine' | 'world';

export interface Source {
  origin: Origin;
  name: string;
  fs: GameFs;
  /** The folder inside `fs` that holds `kinds/` and `elements/`: '' for an engine, `game` for a world. */
  dir: string;
}

export interface Placed {
  /** Unique across the game: origin, kind, and file id, such as `engine:technique/public-exposure`. */
  key: string;
  origin: Origin;
  element: Element;
  /** A core element this world sets aside, which stays visible but leaves the game. */
  setAside: boolean;
  /** For a core element: the world's reskin that takes its place. */
  reskinnedBy: Placed | null;
  /** For a reskin: the core element whose mechanics it uses. */
  base: Placed | null;
}

/** A book's chapters in order, by reference, such as `engine:chapter/3-rolling-for-trouble`. */
export interface Book {
  name: string;
  chapters: string[];
}

export interface Game {
  engine: Source | null;
  world: Source;
  kinds: Map<string, Kind & { origin: Origin }>;
  elements: Placed[];
  setAside: Set<string>;
  /** The engine's book, which is the base game, and the world's own book (Mike, November 8). */
  books: { engine: Book | null; world: Book | null };
  /** The world's piece of each core module, by the module it extends, such as `module/the-edge`. */
  addOns: Map<string, Placed>;
}

/** One item of a chapter, as the book view shows it. */
export type BookItem =
  | { type: 'heading'; text: string }
  | { type: 'module'; placed: Placed; hasWorldPiece: boolean }
  | { type: 'element'; placed: Placed; kindName: string }
  | { type: 'missing'; ref: string };

/** A chapter's items, resolved: modules, catalog elements, and `heading:` lines. */
export function chapterItems(game: Game, chapter: Placed, byKey: Map<string, Placed>): BookItem[] {
  const list = chapter.element.fields.items;
  return (Array.isArray(list) ? list : []).map((ref): BookItem => {
    if (ref.startsWith('heading:')) return { type: 'heading', text: ref.slice(8).trim() };
    // A reference without engine: or world: points into the chapter's own folder.
    const key = /^(engine|world):/.test(ref) ? ref : `${chapter.origin}:${ref}`;
    const p = byKey.get(key);
    if (!p) return { type: 'missing', ref };
    if (p.element.kind === 'module') return { type: 'module', placed: p, hasWorldPiece: game.addOns.has(refOf(p.element)) };
    return { type: 'element', placed: p, kindName: game.kinds.get(p.element.kind)?.name ?? p.element.kind };
  });
}

/** Reads a `book.md`: its name and its chapters in order. */
export function readBook(source: string | null): Book | null {
  if (!source) return null;
  const { header } = splitHeader(source);
  const chapters = Array.isArray(header.chapters) ? header.chapters.map((c) => String(c).trim()).filter(Boolean) : [];
  return { name: typeof header.name === 'string' ? header.name : 'Book', chapters };
}

/** An element's reference within its folder, as `game.md` and `reskins:` write it: `kind/id`. */
export const refOf = (e: Element) => `${e.kind}/${e.id}`;

const join = (dir: string, path: string) => (dir ? `${dir}/${path}` : path);

async function listMd(fs: GameFs, dir: string): Promise<string[]> {
  if (!(await fs.exists(dir))) return [];
  return (await fs.readDir(dir)).filter((d) => !d.isDir && /\.md$/i.test(d.name) && !d.name.startsWith('.')).map((d) => d.name);
}

async function readSource(src: Source): Promise<{ kinds: Kind[]; elements: Element[] }> {
  const kinds: Kind[] = [];
  for (const name of await listMd(src.fs, join(src.dir, 'kinds'))) {
    kinds.push(readKind(name.replace(/\.md$/i, ''), await src.fs.readText(join(src.dir, `kinds/${name}`))));
  }
  const elements: Element[] = [];
  const root = join(src.dir, 'elements');
  if (await src.fs.exists(root)) {
    for (const folder of (await src.fs.readDir(root)).filter((d) => d.isDir && !d.name.startsWith('.'))) {
      for (const name of await listMd(src.fs, `${root}/${folder.name}`)) {
        const rel = `elements/${folder.name}/${name}`;
        elements.push(readElement(rel, await src.fs.readText(join(src.dir, rel))));
      }
    }
  }
  return { kinds, elements };
}

export async function loadGame(engine: Source | null, world: Source): Promise<Game> {
  const e = engine ? await readSource(engine) : { kinds: [], elements: [] };
  const w = await readSource(world);
  const gameFile = (await world.fs.exists(join(world.dir, 'game.md'))) ? await world.fs.readText(join(world.dir, 'game.md')) : null;
  const setAside = new Set(readGameFile(gameFile).setAside);

  // The engine's kinds come first. A world adds kinds of its own but never redefines one.
  const kinds = new Map<string, Kind & { origin: Origin }>();
  for (const k of e.kinds) kinds.set(k.id, { ...k, origin: 'engine' });
  for (const k of w.kinds) if (!kinds.has(k.id)) kinds.set(k.id, { ...k, origin: 'world' });

  const placed: Placed[] = [
    ...e.elements.map((el): Placed => ({ key: `engine:${refOf(el)}`, origin: 'engine', element: el, setAside: setAside.has(refOf(el)), reskinnedBy: null, base: null })),
    ...w.elements.map((el): Placed => ({ key: `world:${refOf(el)}`, origin: 'world', element: el, setAside: false, reskinnedBy: null, base: null })),
  ];
  const core = new Map(placed.filter((p) => p.origin === 'engine').map((p) => [refOf(p.element), p]));
  for (const p of placed) {
    if (p.origin !== 'world' || !p.element.reskins) continue;
    const base = core.get(p.element.reskins);
    if (base) {
      p.base = base;
      base.reskinnedBy = p;
    }
  }
  placed.sort((a, b) => a.element.name.localeCompare(b.element.name));
  const addOns = new Map<string, Placed>();
  for (const p of placed) {
    const extendsRef = p.origin === 'world' && p.element.kind === 'add-on' ? p.element.fields.extends : undefined;
    if (typeof extendsRef === 'string' && extendsRef) addOns.set(extendsRef, p);
  }
  const bookOf = async (src: Source | null) => (src && (await src.fs.exists(join(src.dir, 'book.md'))) ? readBook(await src.fs.readText(join(src.dir, 'book.md'))) : null);
  return { engine, world, kinds, elements: placed, setAside, books: { engine: await bookOf(engine), world: await bookOf(world) }, addOns };
}

/**
 * What an element says in this game. A reskin takes its name and flavor from the world
 * and every mechanic from the core element, so a fix to the core reaches every reskin.
 */
export function effective(p: Placed): Element {
  if (!p.base) return p.element;
  const core = p.base.element;
  return { ...core, path: p.element.path, id: p.element.id, name: p.element.name, flavor: p.element.flavor, reskins: p.element.reskins };
}

/** Whether an element is part of the game being played, rather than set aside or replaced. */
export const inPlay = (p: Placed) => !p.setAside && !p.reskinnedBy;

/** The source an element is written to. */
export const sourceOf = (game: Game, p: Placed): Source => (p.origin === 'engine' && game.engine ? game.engine : game.world);

export function pathIn(src: Source, path: string): string {
  return join(src.dir, path);
}

/** The new text of `game.md` with this set-aside list, keeping anything else in it. */
export function gameFileWith(source: string | null, setAside: string[]): string {
  const base = source ?? "# Game\n\nThis world's choices about its engine's core elements. Immersion keeps this file.\n";
  return withHeader(base, { set_aside: setAside.length ? setAside : undefined });
}
