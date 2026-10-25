import type { WorldFs } from '../fs/types';
import { slugify } from '../slug';
import type { WikiIndex } from './wiki';

/** Creates a wiki entry titled `name` in `folder` and returns its path. Throws a readable message. */
export async function createEntry(fs: WorldFs, name: string, folder: string): Promise<string> {
  const slug = slugify(name);
  if (!slug) throw new Error('That name has no letters or numbers to make a file name from.');
  const path = `${folder}/${slug}.md`;
  if (await fs.exists(path)) throw new Error(`There is already an entry called ${name} there.`);
  await fs.writeText(path, `# ${name}\n\n`);
  return path;
}

/** Creates a category, which is a folder in the wiki, and returns its path. */
export async function createCategory(fs: WorldFs, name: string, parent: string): Promise<string> {
  const slug = slugify(name);
  if (!slug) throw new Error('That name has no letters or numbers to make a folder name from.');
  const path = `${parent}/${slug}`;
  if (await fs.exists(path)) throw new Error(`There is already a category called ${name} there.`);
  await fs.createDir(path);
  return path;
}

/** The category a new entry made from a selected name most likely belongs in: people. */
export function likelyCategory(index: WikiIndex): string {
  return index.root.folders.find((f) => /^(people|characters|cast|npcs?)$/i.test(f.name))?.path ?? index.root.path;
}
