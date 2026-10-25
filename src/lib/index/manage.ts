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

/** Adds `alias` to an entry's aliases, in whichever form the entry already keeps them. */
export function withAlias(text: string, alias: string): string {
  const line = /^\*\*Aliases:\*\*[ \t]*(.*)$/im.exec(text);
  if (line) {
    const names = line[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (names.some((n) => n.toLowerCase() === alias.toLowerCase())) return text;
    return text.replace(line[0], `**Aliases:** ${[...names, alias].join(', ')}`);
  }
  const { header } = splitHeader(text);
  const current = Array.isArray(header.aliases) ? header.aliases.map(String) : typeof header.aliases === 'string' ? [header.aliases] : [];
  if (current.some((n) => n.toLowerCase() === alias.toLowerCase())) return text;
  return withHeader(text, { aliases: [...current, alias] });
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
