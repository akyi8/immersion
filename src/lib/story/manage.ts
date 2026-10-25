import type { WorldFs } from '../fs/types.ts';
import { slugify } from '../slug.ts';
import { splitHeader, withHeader } from '../world.ts';
import { placeFolder, titleOf, titleFromName, type Manuscript, type Place } from './index.ts';
import { blankPage, fileToFolder, newBook, readTitlePage, withTitlePage } from './book.ts';

/**
 * Renaming, archiving, and moving pieces of writing between the desk, the drawer, and
 * the shelf (Mike, October 25). The files follow the titles, so nobody has to.
 */

const isFile = (path: string) => /\.md$/i.test(path);
const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Renames a piece: its title changes, and its file or folder follows. Returns its new path. */
export async function renamePiece(fs: WorldFs, path: string, newTitle: string): Promise<string> {
  const title = newTitle.trim();
  const slug = slugify(title);
  if (!slug) throw new Error('That title has no letters or numbers to make a file name from.');
  if (!isFile(path)) {
    // A manuscript folder: its title page takes the new title, and the folder its name.
    const book = `${path}/book.md`;
    const page = (await fs.exists(book)) ? readTitlePage(await fs.readText(book), titleFromName(nameOf(path))) : blankPage(title);
    await fs.writeText(book, (await fs.exists(book)) ? withTitlePage(await fs.readText(book), { ...page, title }) : newBook({ ...page, title }));
    const target = `${parentOf(path)}/${slug}`;
    if (target !== path) {
      if (await fs.exists(target)) throw new Error('There is already a manuscript with that title there.');
      await fs.move(path, target);
    }
    return target;
  }
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
  const ext = isFile(path) ? '.md' : '';
  let target = `${root}/archive/${stem}${ext}`;
  for (let n = 2; await fs.exists(target); n++) target = `${root}/archive/${stem}-${n}${ext}`;
  await fs.move(path, target);
  return target;
}

/** A folder name not yet taken in `dir`. */
async function freeName(fs: WorldFs, dir: string, slug: string): Promise<string> {
  let target = `${dir}/${slug}`;
  for (let n = 2; await fs.exists(target) || (await fs.exists(`${target}.md`)); n++) target = `${dir}/${slug}-${n}`;
  return target;
}

/**
 * Turns a manuscript kept as one file into a folder in `dir`, with its chapters as
 * files. The original file is kept in the archive. Returns the new folder.
 */
export async function makeFolder(fs: WorldFs, path: string, dir: string, root: string): Promise<string> {
  const { title, files } = fileToFolder(await fs.readText(path), nameOf(path));
  const target = await freeName(fs, dir, slugify(title) || 'manuscript');
  for (const [rel, content] of Object.entries(files)) await fs.writeText(`${target}/${rel}`, content);
  await archivePiece(fs, path, root);
  return target;
}

/**
 * Moves a manuscript to the desk, the drawer, or the shelf. The desk and the shelf hold
 * folders, so a single file becomes a folder on its way there. Returns its new path.
 */
export async function moveToPlace(fs: WorldFs, m: Manuscript, root: string, place: Place): Promise<string> {
  const dir = placeFolder(root, place);
  if (m.kind === 'file' && place !== 'drawer') return makeFolder(fs, m.path, dir, root);
  const target = `${dir}/${nameOf(m.path)}`;
  if (target === m.path) return m.path;
  if (await fs.exists(target)) throw new Error(`There is already something called ${nameOf(m.path)} there.`);
  await fs.move(m.path, target);
  if (m.kind === 'folder' && place !== 'drawer' && !(await fs.exists(`${target}/book.md`))) await fs.writeText(`${target}/book.md`, newBook(blankPage(m.title)));
  return target;
}

/** Starts a manuscript on the desk: a folder with its title page and a first chapter. */
export async function newManuscript(fs: WorldFs, root: string, title: string, defaults: { author?: string; copyright?: string }): Promise<{ folder: string; chapter: string }> {
  const slug = slugify(title);
  if (!slug) throw new Error('That title has no letters or numbers to make a folder name from.');
  const folder = `${root}/${slug}`;
  if (await fs.exists(folder)) throw new Error(`Something called ${slug} is already on the desk.`);
  await fs.writeText(`${folder}/book.md`, newBook(blankPage(title.trim(), defaults)));
  const chapter = `${folder}/01-chapter-1.md`;
  await fs.writeText(chapter, '# Chapter 1\n\n');
  return { folder, chapter };
}
