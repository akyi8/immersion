import { readElement, readGameFile, readKind, type Element, type Kind } from './elements.ts';
import { splitHeader, withHeader } from '../world.ts';
import { IMAGE_EXTENSIONS, type DirEntry, type ImageSource } from '../fs/types.ts';

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
  /** A URL the webview can show a picture from. */
  imageUrl(path: string): string;
  /** Copies a picture in as the image for `stem`, a file's path without its extension. */
  setImage(stem: string, image: ImageSource): Promise<string>;
  /** Moves a file, such as a picture taken away into the archive. */
  move(from: string, to: string): Promise<void>;
}

/**
 * Where an element comes from: `engine`, `world`, or an expansion's id, such as
 * `harborpunk` (Mike, November 9). An expansion adds to its world and changes nothing
 * in it, so any mix of expansions makes a sound game.
 */
export type Origin = string;

/** Whose book it is: the engine's base game or the world's. Expansions have no book yet. */
export type BookOrigin = 'engine' | 'world';

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
  /** The element's picture, a file beside it with the same name, as a path inside its folder. */
  image: string | null;
}

/** A book's chapters in order, by reference, such as `engine:chapter/3-rolling-for-trouble`. */
export interface Book {
  name: string;
  /** The book's divisions in order, by reference, such as `world:division/the-protagonist` (Mike, November 9). */
  divisions: string[];
  /** Sections listed outside any division, from before books had divisions. */
  chapters: string[];
  /** The front matter and back matter (Mike, November 9): sections before and after the divisions, such as the license and the safety page. */
  frontMatter: string[];
  backMatter: string[];
  /** The book's front page: the body of `book.md`. */
  body: string;
  /** The front page's picture, `book.jpg` or the like beside `book.md`. */
  image: string | null;
  /** How the front page's picture is framed, as `banner_frame:` in `book.md` writes it. */
  frame: string;
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
  /** The world's expansions, each a folder in the game folder's `expansions/`, in name order. */
  expansions: Expansion[];
  /** Each expansion's pieces of an element, by the element's key, such as `engine:module/the-edge`. */
  pieces: Map<string, Placed[]>;
}

/** An expansion: its own folder of elements inside the world's game folder. */
export interface Expansion extends Source {
  /** What the expansion is: the body of its `expansion.md`. */
  about: string;
}

/** Origins an expansion's folder name cannot take. */
const TAKEN_ORIGINS = new Set(['engine', 'world', 'heading']);

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
  const { header, body } = splitHeader(source);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((c) => String(c).trim()).filter(Boolean) : []);
  return {
    name: typeof header.name === 'string' ? header.name : 'Book',
    divisions: list(header.divisions),
    chapters: list(header.chapters),
    frontMatter: list(header.front_matter),
    backMatter: list(header.back_matter),
    body: body.replace(/^\n+/, '').replace(/\n+$/, ''),
    image: null,
    frame: typeof header.banner_frame === 'string' || typeof header.banner_frame === 'number' ? String(header.banner_frame) : '',
  };
}

/** A file's new text with this body, keeping its header exactly as it was. */
export function withBody(source: string, body: string): string {
  const head = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source)?.[0] ?? '';
  if (!head) return body.trim() ? `${body.replace(/\n+$/, '')}\n` : '';
  return `${head.replace(/\n?$/, '\n')}${body.trim() ? `\n${body.replace(/\n+$/, '')}\n` : ''}`;
}

/** An element's reference within its folder, as `game.md` and `reskins:` write it: `kind/id`. */
export const refOf = (e: Element) => `${e.kind}/${e.id}`;

const join = (dir: string, path: string) => (dir ? `${dir}/${path}` : path);

async function listMd(fs: GameFs, dir: string): Promise<string[]> {
  if (!(await fs.exists(dir))) return [];
  return (await fs.readDir(dir)).filter((d) => !d.isDir && /\.md$/i.test(d.name) && !d.name.startsWith('.')).map((d) => d.name);
}

/** The picture beside a file, by the file's path without `.md`, among a folder's entries. */
function imageBeside(entries: DirEntry[], stem: string): string | null {
  for (const ext of IMAGE_EXTENSIONS) {
    const hit = entries.find((d) => !d.isDir && d.name.toLowerCase() === `${stem.toLowerCase()}.${ext}`);
    if (hit) return hit.name;
  }
  return null;
}

async function readSource(src: Source): Promise<{ kinds: Kind[]; elements: Element[]; images: Map<string, string> }> {
  const kinds: Kind[] = [];
  for (const name of await listMd(src.fs, join(src.dir, 'kinds'))) {
    kinds.push(readKind(name.replace(/\.md$/i, ''), await src.fs.readText(join(src.dir, `kinds/${name}`))));
  }
  const elements: Element[] = [];
  // Each element's picture, by the element's path: a file beside it with the same name.
  const images = new Map<string, string>();
  const root = join(src.dir, 'elements');
  if (await src.fs.exists(root)) {
    for (const folder of (await src.fs.readDir(root)).filter((d) => d.isDir && !d.name.startsWith('.'))) {
      const entries = await src.fs.readDir(`${root}/${folder.name}`);
      for (const d of entries) {
        if (d.isDir || !/\.md$/i.test(d.name) || d.name.startsWith('.')) continue;
        const rel = `elements/${folder.name}/${d.name}`;
        elements.push(readElement(rel, await src.fs.readText(join(src.dir, rel))));
        const image = imageBeside(entries, d.name.replace(/\.md$/i, ''));
        if (image) images.set(rel, `elements/${folder.name}/${image}`);
      }
    }
  }
  return { kinds, elements, images };
}

export async function loadGame(engine: Source | null, world: Source): Promise<Game> {
  const e = engine ? await readSource(engine) : { kinds: [], elements: [], images: new Map<string, string>() };
  const w = await readSource(world);
  const expansions: Expansion[] = [];
  const shelf = join(world.dir, 'expansions');
  if (await world.fs.exists(shelf)) {
    for (const d of (await world.fs.readDir(shelf)).filter((d) => d.isDir && !d.name.startsWith('.'))) {
      const id = d.name.toLowerCase();
      if (TAKEN_ORIGINS.has(id) || !(await world.fs.exists(`${shelf}/${d.name}/expansion.md`))) continue;
      const { header, body } = splitHeader(await world.fs.readText(`${shelf}/${d.name}/expansion.md`));
      const name = (typeof header.name === 'string' && header.name.trim()) || d.name;
      expansions.push({ origin: id, name, fs: world.fs, dir: `${shelf}/${d.name}`, about: body.replace(/^\n+/, '').replace(/\n+$/, '') });
    }
  }
  expansions.sort((a, b) => a.name.localeCompare(b.name));
  const x = await Promise.all(expansions.map((src) => readSource(src)));
  const gameFile = (await world.fs.exists(join(world.dir, 'game.md'))) ? await world.fs.readText(join(world.dir, 'game.md')) : null;
  const setAside = new Set(readGameFile(gameFile).setAside);

  // The engine's kinds come first. A world adds kinds of its own but never redefines one.
  const kinds = new Map<string, Kind & { origin: Origin }>();
  for (const k of e.kinds) kinds.set(k.id, { ...k, origin: 'engine' });
  for (const k of w.kinds) if (!kinds.has(k.id)) kinds.set(k.id, { ...k, origin: 'world' });
  x.forEach((src, i) => src.kinds.forEach((k) => kinds.has(k.id) || kinds.set(k.id, { ...k, origin: expansions[i].origin })));

  const placed: Placed[] = [
    ...e.elements.map((el): Placed => ({ key: `engine:${refOf(el)}`, origin: 'engine', element: el, setAside: setAside.has(refOf(el)), reskinnedBy: null, base: null, image: e.images.get(el.path) ?? null })),
    ...w.elements.map((el): Placed => ({ key: `world:${refOf(el)}`, origin: 'world', element: el, setAside: false, reskinnedBy: null, base: null, image: w.images.get(el.path) ?? null })),
    ...x.flatMap((src, i) =>
      src.elements.map((el): Placed => {
        const origin = expansions[i].origin;
        return { key: `${origin}:${refOf(el)}`, origin, element: el, setAside: false, reskinnedBy: null, base: null, image: src.images.get(el.path) ?? null };
      }),
    ),
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
  // An expansion's piece extends a core element, written `module/x`, or a world's, written `world:module/x`.
  const pieces = new Map<string, Placed[]>();
  for (const p of placed) {
    const ext = p.origin !== 'engine' && p.origin !== 'world' && p.element.kind === 'add-on' ? p.element.fields.extends : undefined;
    if (typeof ext !== 'string' || !ext) continue;
    const key = keyOf(ext, 'engine');
    pieces.set(key, [...(pieces.get(key) ?? []), p]);
  }
  const bookOf = async (src: Source | null): Promise<Book | null> => {
    if (!src || !(await src.fs.exists(join(src.dir, 'book.md')))) return null;
    const book = readBook(await src.fs.readText(join(src.dir, 'book.md')));
    if (book) book.image = imageBeside(await src.fs.readDir(src.dir), 'book');
    return book;
  };
  return { engine, world, kinds, elements: placed, setAside, books: { engine: await bookOf(engine), world: await bookOf(world) }, addOns, expansions, pieces };
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
export const sourceOf = (game: Game, p: Placed): Source =>
  p.origin === 'engine' && game.engine ? game.engine : (game.expansions.find((x) => x.origin === p.origin) ?? game.world);

/** Whether an origin is one of the world's expansions. */
export const isExpansion = (origin: Origin) => origin !== 'engine' && origin !== 'world';

export function pathIn(src: Source, path: string): string {
  return join(src.dir, path);
}

/** The new text of `game.md` with this set-aside list, keeping anything else in it. */
export function gameFileWith(source: string | null, setAside: string[]): string {
  const base = source ?? "# Game\n\nThis world's choices about its engine's core elements. Immersion keeps this file.\n";
  return withHeader(base, { set_aside: setAside.length ? setAside : undefined });
}

/**
 * The book as a tree (Mike, November 9): divisions, each with a front page, hold rule
 * sections, and each section holds its rules. A core rule carries the world's piece
 * beside it when the book is a world's. A division with a `catalog` lists every element
 * of those kinds instead of sections, so the aspects print as lists.
 */
export interface RuleNode {
  type: 'rule';
  placed: Placed;
  /** This world's piece of a core rule, in a world's book. */
  worldPiece: Placed | null;
  /** Each expansion's piece of the rule, in a world's book. */
  expansionPieces: Placed[];
}
export interface HeadingNode {
  type: 'heading';
  text: string;
}
export interface SectionNode {
  placed: Placed;
  items: (RuleNode | HeadingNode)[];
  /** Elements the section lists among its rules, from before the aspects had a division. */
  elements: Placed[];
}
export interface CatalogNode {
  kind: Kind;
  elements: Placed[];
}
export interface DivisionNode {
  placed: Placed;
  sections: SectionNode[];
  catalog: CatalogNode[];
}
export interface BookTree {
  /** Whose book it is: the engine's base game or the world's. */
  origin: BookOrigin;
  book: Book;
  divisions: DivisionNode[];
  /** Sections the book lists outside any division. */
  loose: SectionNode[];
  /** The front matter's sections, before the divisions, and the back matter's, after them. */
  front: SectionNode[];
  back: SectionNode[];
}

/** A reference's key in the game: one without `engine:` or `world:` points into `origin`. */
export const keyOf = (ref: string, origin: Origin) => (/^[a-z0-9_-]+:/i.test(ref) ? ref : `${origin}:${ref}`);

const listField = (p: Placed, key: string): string[] => {
  const v = p.element.fields[key];
  return Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v.trim()] : [];
};

export function bookTree(game: Game, origin: BookOrigin): BookTree | null {
  const book = game.books[origin];
  if (!book) return null;
  const inWorld = origin === 'world';
  const byKey = new Map(game.elements.map((p) => [p.key, p]));
  // The base game shows only the engine's own elements.
  const visible = (p: Placed | undefined): p is Placed => !!p && (inWorld || p.origin === 'engine');
  const section = (p: Placed): SectionNode => {
    const items: (RuleNode | HeadingNode)[] = [];
    const elements: Placed[] = [];
    for (const ref of listField(p, 'items')) {
      if (ref.startsWith('heading:')) {
        items.push({ type: 'heading', text: ref.slice(8).trim() });
        continue;
      }
      const hit = byKey.get(keyOf(ref, p.origin));
      if (!visible(hit)) continue;
      if (hit.element.kind === 'module')
        items.push({
          type: 'rule',
          placed: hit,
          worldPiece: inWorld && hit.origin === 'engine' ? (game.addOns.get(refOf(hit.element)) ?? null) : null,
          expansionPieces: inWorld ? (game.pieces.get(hit.key) ?? []) : [],
        });
      else elements.push(hit);
    }
    return { placed: p, items, elements };
  };
  const sections = (refs: string[], from: Origin) =>
    refs
      .map((r) => byKey.get(keyOf(r, from)))
      .filter(visible)
      .map(section);
  const divisions = book.divisions
    .map((r) => byKey.get(keyOf(r, origin)))
    .filter(visible)
    .map((d): DivisionNode => ({
      placed: d,
      sections: sections(listField(d, 'sections'), d.origin),
      catalog: listField(d, 'catalog')
        .map((id) => game.kinds.get(id))
        .filter((k): k is Kind & { origin: Origin } => !!k)
        .map((kind) => ({
          kind,
          elements: game.elements.filter((p) => p.element.kind === kind.id && (inWorld ? inPlay(p) : p.origin === 'engine')),
        }))
        .filter((c) => c.elements.length > 0),
    }));
  return { origin, book, divisions, loose: sections(book.chapters, origin), front: sections(book.frontMatter, origin), back: sections(book.backMatter, origin) };
}

/**
 * The picture at the top of an element's page. In a world's book, the world's piece of a
 * core element can carry a picture of its own, which shows instead of the core one.
 */
export function pictureOf(game: Game, p: Placed, inWorld: boolean): { src: Source; path: string; owner: Placed } | null {
  const piece = inWorld && p.origin === 'engine' ? game.addOns.get(refOf(p.element)) : undefined;
  if (piece?.image) return { src: game.world, path: piece.image, owner: piece };
  if (p.image) return { src: sourceOf(game, p), path: p.image, owner: p };
  return null;
}

