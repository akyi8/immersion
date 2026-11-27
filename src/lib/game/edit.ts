import { freePath } from '../archive.ts';
import { splitHeader, withHeader } from '../world.ts';
import { newElement, readElement, withChanges, writeElement, type Element } from './elements.ts';
import { isExpansion, keyOf, pathIn, refOf, sourceOf, type Game, type Origin, type Placed, type Source } from './game.ts';

/**
 * Changing a game's files (code review, November 21, item C6). Everything here writes to
 * disk and nothing here draws, so each change can be tested against files alone. The
 * Game screen asks for a change, then reads the game again or swaps in what was saved.
 */

/** Joins a text the page changed with what the file has become meanwhile. */
export type Merge = (base: string, mine: string, theirs: string) => string | null;
/** Saves one element and lets whoever asked show the result. */
export type Save = (p: Placed, next: Element) => Promise<void>;

/** A list field of an element, such as a section's `items`, as written. */
export const listOf = (p: Placed, field: string): string[] => {
  const v = p.element.fields[field];
  return Array.isArray(v) ? [...v] : [];
};
/** The element with one of its list fields replaced. */
export const withList = (p: Placed, field: string, items: string[]): Element => ({ ...p.element, fields: { ...p.element.fields, [field]: items } });

/**
 * Saves an element. The file is read as it stands on disk, and only what differs between
 * `base` and `next` is written onto it, so a page can neither undo a change that reached
 * the file from elsewhere nor drop a key it does not know. Returns the element as the
 * file now holds it, which may be more than was written.
 */
export async function saveElement(game: Game, p: Placed, next: Element, base: Element, merge: Merge): Promise<Element> {
  const src = sourceOf(game, p);
  const file = pathIn(src, next.path);
  const onDisk = (await src.fs.exists(file)) ? await src.fs.readText(file) : null;
  const text = onDisk === null ? writeElement(next, game.kinds.get(next.kind) ?? null) : withChanges(onDisk, base, next, merge);
  if (text !== onDisk) await src.fs.writeText(file, text);
  return { ...readElement(next.path, text), path: next.path };
}

/** Where an origin's files are: the engine's folder, an expansion's, or the world's game folder. */
export const homeOf = (game: Game, origin: Origin): Source => (origin === 'engine' && game.engine ? game.engine : (game.expansions.find((x) => x.origin === origin) ?? game.world));

/**
 * Makes a new element of a kind, in the engine, the world, or an expansion, and returns
 * its key. A core element is tagged `core`, and an expansion's carries the expansion's tag.
 */
export async function addElement(game: Game, origin: Origin, kindId: string, name: string): Promise<string> {
  const kind = game.kinds.get(kindId);
  if (!kind) throw new Error(`This game has no ${kindId} kind yet.`);
  const taken = new Set(game.elements.filter((p) => p.origin === origin).map((p) => refOf(p.element)));
  const e = newElement(name, kind, taken);
  e.tags = origin === 'engine' ? ['core', kind.id] : isExpansion(origin) ? [origin, kind.id] : [kind.id];
  const src = homeOf(game, origin);
  await src.fs.writeText(pathIn(src, e.path), writeElement(e, kind));
  return `${origin}:${refOf(e)}`;
}

/**
 * The world's own file for a part of the base game, made the first time the world adds
 * to that part. Returns its key, or null when the world already has one or the part is
 * not the base game's. The game has to be read again before the new file is used.
 */
export async function makeWorldTwin(game: Game, p: Placed): Promise<string | null> {
  if (p.origin !== 'engine') return null;
  const key = `world:${refOf(p.element)}`;
  const kind = game.kinds.get(p.element.kind);
  if (!kind || game.elements.some((x) => x.key === key)) return null;
  const e: Element = { ...newElement(p.element.name, kind, new Set()), id: p.element.id, path: p.element.path, tags: [kind.id] };
  await game.world.fs.writeText(pathIn(game.world, e.path), writeElement(e, kind));
  return key;
}

/**
 * Puts a rule into a section, before `before` or at the section's end, and takes it out
 * of the section it was in.
 */
export async function placeRule(from: Placed, to: Placed, ruleKey: string, before: string | null, save: Save): Promise<void> {
  const without = (p: Placed) => listOf(p, 'items').filter((r) => keyOf(r, p.origin) !== ruleKey);
  const target = without(to);
  const at = before ? target.findIndex((r) => keyOf(r, to.origin) === before) : -1;
  if (at < 0) target.push(ruleKey);
  else target.splice(at, 0, ruleKey);
  if (from.key !== to.key) await save(from, withList(from, 'items', without(from)));
  await save(to, withList(to, 'items', target));
}

/**
 * Puts a section into a division, before `before` or at the division's end. `shown` is
 * the division's sections as the book shows them now, the base game's included, which is
 * the list the change starts from, so the section keeps the number the writer gave it.
 * The section leaves `from` when that is another division of the same book.
 */
export async function placeSection(from: Placed | null, to: Placed, sec: Placed, before: string | null, shown: string[] | null, save: Save): Promise<void> {
  const target = (shown ?? listOf(to, 'sections')).filter((r) => keyOf(r, to.origin) !== sec.key);
  const at = before ? target.findIndex((r) => keyOf(r, to.origin) === before) : -1;
  if (at < 0) target.push(sec.key);
  else target.splice(at, 0, sec.key);
  if (from && from.key !== to.key && from.origin === sec.origin) await save(from, withList(from, 'sections', listOf(from, 'sections').filter((r) => keyOf(r, from.origin) !== sec.key)));
  await save(to, withList(to, 'sections', target));
}

/** Takes a section out of a book's own list of sections outside any division. */
export async function dropLooseSection(src: Source, origin: Origin, chapters: string[], secKey: string): Promise<void> {
  const file = pathIn(src, 'book.md');
  const rest = chapters.filter((r) => keyOf(r, origin) !== secKey);
  await src.fs.writeText(file, withHeader(await src.fs.readText(file), { chapters: rest.length ? rest : undefined }));
}

/**
 * Archives an element. Nothing is deleted: its file, and its picture, move to the
 * `archive` folder beside `elements`. Every list that named it lets it go: a section's
 * rules, a division's sections, and a book's own lists. The file keeps a note of where
 * it stood, as `archived_from`, so it can be put back.
 */
export async function archiveElement(game: Game, p: Placed, save: Save): Promise<void> {
  const stood: { in: string; list: string; before: string | null }[] = [];
  for (const other of game.elements) {
    if (other.key === p.key) continue;
    for (const field of ['items', 'sections']) {
      const refs = listOf(other, field);
      const at = refs.findIndex((r) => keyOf(r, other.origin) === p.key);
      if (at < 0) continue;
      stood.push({ in: other.key, list: field, before: refs[at + 1] ? keyOf(refs[at + 1], other.origin) : null });
      await save(other, withList(other, field, refs.filter((_, i) => i !== at)));
    }
  }
  // The books name sections and matter too.
  for (const src of [game.engine, game.world]) {
    if (!src) continue;
    const file = pathIn(src, 'book.md');
    if (!(await src.fs.exists(file))) continue;
    const text = await src.fs.readText(file);
    const { header } = splitHeader(text);
    const changes: Record<string, unknown> = {};
    for (const field of ['front_matter', 'back_matter', 'divisions', 'chapters']) {
      const refs = Array.isArray(header[field]) ? (header[field] as unknown[]).map(String) : [];
      const at = refs.findIndex((r) => keyOf(r, src.origin) === p.key);
      if (at < 0) continue;
      stood.push({ in: `${src.origin}:book`, list: field, before: refs[at + 1] ? keyOf(refs[at + 1], src.origin) : null });
      const rest = refs.filter((_, i) => i !== at);
      changes[field] = rest.length ? rest : undefined;
    }
    if (Object.keys(changes).length) await src.fs.writeText(file, withHeader(text, changes));
  }
  const src = sourceOf(game, p);
  const file = pathIn(src, p.element.path);
  await src.fs.writeText(file, withHeader(await src.fs.readText(file), { archived_from: stood.length ? stood : undefined }));
  const free = (path: string) => freePath((x) => src.fs.exists(x), pathIn(src, `archive/${path}`));
  await src.fs.move(file, await free(p.element.path));
  if (p.image) await src.fs.move(pathIn(src, p.image), await free(p.image));
}
