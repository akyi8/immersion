import type { WorldFs } from '../fs/types.ts';
import { slugify } from '../slug.ts';
import { splitHeader, withHeader } from '../world.ts';
import { titleOf } from './index.ts';

/**
 * Renaming and archiving pieces of writing: manuscripts kept as one file, and pieces in
 * the drawer (Mike, October 25). The file follows the new title, so nobody has to.
 */

/** Renames a piece: its title changes, and its file follows. Returns its new path. */
export async function renamePiece(fs: WorldFs, path: string, newTitle: string): Promise<string> {
  const title = newTitle.trim();
  const slug = slugify(title);
  if (!slug) throw new Error('That title has no letters or numbers to make a file name from.');
  const text = await fs.readText(path);
  const name = path.slice(path.lastIndexOf('/') + 1);
  const old = titleOf(text, name);
  const { header, body } = splitHeader(text);
  const offset = text.length - body.length;
  const h1 = /^#\s+(.+)$/m.exec(body);
  let changed = h1 && h1[1].trim() === old ? text.slice(0, offset) + body.replace(h1[0], `# ${title}`) : text;
  if (typeof header.title === 'string') changed = withHeader(changed, { title });
  const target = `${path.slice(0, path.lastIndexOf('/'))}/${slug}.md`;
  if (target !== path) {
    if (await fs.exists(target)) throw new Error('There is already a piece with that title there.');
    await fs.move(path, target);
  }
  await fs.writeText(target, changed);
  return target;
}

/** Moves a piece into the stories folder's archive, out of the app but kept on disk. */
export async function archivePiece(fs: WorldFs, path: string, root: string): Promise<string> {
  const rel = path.startsWith(root + '/') ? path.slice(root.length + 1) : path.slice(path.lastIndexOf('/') + 1);
  const stem = rel.replace(/\.md$/i, '');
  let target = `${root}/archive/${stem}.md`;
  for (let n = 2; await fs.exists(target); n++) target = `${root}/archive/${stem}-${n}.md`;
  await fs.move(path, target);
  return target;
}
