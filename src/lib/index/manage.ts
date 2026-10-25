import type { WorldFs } from '../fs/types.ts';
import { IMAGE_EXTENSIONS } from '../fs/types.ts';
import { slugify } from '../slug.ts';
import { splitHeader, withHeader } from '../world.ts';
import type { Entry } from './wiki.ts';

/**
 * Renaming, moving, and archiving wiki entries (Mike, October 25). Each one moves the
 * entry's file together with its picture, so nobody has to think about either.
 */

function stem(path: string): string {
  return path.replace(/\.md$/i, '');
}

/** Moves an entry's markdown file and its picture to a new stem. Returns the new path. */
async function moveEntryFiles(fs: WorldFs, from: string, toStem: string): Promise<string> {
  const to = `${toStem}.md`;
  if (to === from) return from;
  if (await fs.exists(to)) throw new Error('There is already an entry with that name there.');
  await fs.move(from, to);
  for (const ext of IMAGE_EXTENSIONS) {
    const picture = `${stem(from)}.${ext}`;
    if (await fs.exists(picture)) await fs.move(picture, `${toStem}.${ext}`);
  }
  return to;
}

/** The bold aliases line some entries use, as the wiki's parser reads it. */
const ALIASES_LINE = /^[ \t]*\*\*\s*aliases\s*:?\s*\*\*\s*:?[ \t]*(.*)$/im;

/** An entry's other names, from its aliases line or its YAML header. */
export function aliasesOf(text: string): string[] {
  const line = ALIASES_LINE.exec(text);
  if (line) return line[1].split(',').map((s) => s.trim()).filter(Boolean);
  const { header } = splitHeader(text);
  if (Array.isArray(header.aliases)) return header.aliases.map(String);
  return typeof header.aliases === 'string' ? header.aliases.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Sets an entry's other names (Mike, October 25), in whichever form the entry already
 * keeps them: the bold aliases line when it has one, and otherwise the YAML header.
 * An empty list removes them.
 */
export function withAliases(text: string, names: string[]): string {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const line = ALIASES_LINE.exec(text);
  if (line) {
    if (list.length) return text.replace(line[0], `**Aliases:** ${list.join(', ')}`);
    // The line goes, with one blank line after it, so no gap is left behind.
    return text.replace(new RegExp(`${line[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n(\\s*\\n)?`), '');
  }
  return withHeader(text, { aliases: list.length ? list : undefined });
}

/** Adds `alias` to an entry's other names, unless it is already one of them. */
export function withAlias(text: string, alias: string): string {
  const current = aliasesOf(text);
  if (current.some((n) => n.toLowerCase() === alias.toLowerCase())) return text;
  return withAliases(text, [...current, alias]);
}

/** The entry's text with its title heading changed, or a title heading added. */
export function withTitle(text: string, oldName: string, newName: string): string {
  const { body } = splitHeader(text);
  const offset = text.length - body.length;
  const h1 = /^#\s+(.+)$/m.exec(body);
  if (h1 && h1[1].trim() === oldName) return text.slice(0, offset) + body.replace(h1[0], `# ${newName}`);
  return text.slice(0, offset) + `# ${newName}\n\n` + body;
}

/**
 * Renames an entry. Its title changes, its old name becomes an alias so every name
 * already written still links to it, and its file follows the new name. Returns the
 * entry's new path.
 */
export async function renameEntry(fs: WorldFs, entry: Entry, newName: string): Promise<string> {
  const name = newName.trim();
  const slug = slugify(name);
  if (!slug) throw new Error('That name has no letters or numbers to make a file name from.');
  const text = await fs.readText(entry.id);
  const changed = name === entry.name ? text : withAlias(withTitle(text, entry.name, name), entry.name);
  const folder = entry.id.slice(0, entry.id.lastIndexOf('/'));
  const path = await moveEntryFiles(fs, entry.id, `${folder}/${slug}`);
  await fs.writeText(path, changed);
  return path;
}

/** Moves an entry into another category. Returns its new path. */
export async function moveEntry(fs: WorldFs, entry: Entry, folder: string): Promise<string> {
  const file = entry.id.slice(entry.id.lastIndexOf('/') + 1);
  return moveEntryFiles(fs, entry.id, `${folder}/${stem(file)}`);
}

/**
 * Archives an entry: it moves into the wiki's archive folder, keeping its category, and
 * stops appearing in the app. Its file stays, so nothing is lost.
 */
export async function archiveEntry(fs: WorldFs, entry: Entry, wikiRoot: string): Promise<string> {
  const rel = entry.id.startsWith(wikiRoot + '/') ? entry.id.slice(wikiRoot.length + 1) : entry.id;
  let target = `${wikiRoot}/archive/${stem(rel)}`;
  for (let n = 2; await fs.exists(`${target}.md`); n++) target = `${wikiRoot}/archive/${stem(rel)}-${n}`;
  return moveEntryFiles(fs, entry.id, target);
}

/** Renames a category, which is a folder in the wiki, and returns its new path. */
export async function renameCategory(fs: WorldFs, path: string, newName: string): Promise<string> {
  const slug = slugify(newName);
  if (!slug) throw new Error('That name has no letters or numbers to make a folder name from.');
  const target = `${path.slice(0, path.lastIndexOf('/'))}/${slug}`;
  if (target === path) return path;
  if (await fs.exists(target)) throw new Error('There is already a category with that name there.');
  await fs.move(path, target);
  return target;
}

/** Archives a category with everything in it, into the wiki's archive folder. */
export async function archiveCategory(fs: WorldFs, path: string, wikiRoot: string): Promise<string> {
  const rel = path.startsWith(wikiRoot + '/') ? path.slice(wikiRoot.length + 1) : path;
  let target = `${wikiRoot}/archive/${rel}`;
  for (let n = 2; await fs.exists(target); n++) target = `${wikiRoot}/archive/${rel}-${n}`;
  await fs.move(path, target);
  return target;
}

/** Takes an entry's picture away by moving it into the wiki's archive, where it is kept. */
export async function removePicture(fs: WorldFs, picture: string, wikiRoot: string): Promise<string> {
  const rel = picture.startsWith(wikiRoot + '/') ? picture.slice(wikiRoot.length + 1) : picture.slice(picture.lastIndexOf('/') + 1);
  const dot = rel.lastIndexOf('.');
  let target = `${wikiRoot}/archive/${rel}`;
  for (let n = 2; await fs.exists(target); n++) target = `${wikiRoot}/archive/${rel.slice(0, dot)}-${n}${rel.slice(dot)}`;
  await fs.move(picture, target);
  return target;
}
