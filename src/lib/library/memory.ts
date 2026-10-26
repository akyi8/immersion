import { MemoryFs } from '../fs/memory';
import { imageExtension, type ImageSource, type WorldFs } from '../fs/types';
import { describeWorld } from '../world';
import { pickImage } from '../pickImage';
import type { FolderShape, Library, LibraryInfo, ShelfWorld } from './types';

/**
 * A shelf held in memory for browser testing. It starts with the sample world, and the
 * folder picker always offers one invented folder of notes with no world.md, so the
 * add-a-world steps can be tried without a disk.
 */
export class MemoryLibrary implements Library {
  private worlds = new Map<string, MemoryFs>();
  private shelf: string[] = [];
  private folders = new Map<string, MemoryFs>();
  private lastOpen: string | null;
  // The browser's library is the invented folder that holds the sample world.
  private library: LibraryInfo = { path: null, asked: false, gitSync: true, isGit: true };
  private you: string | null = null;

  constructor(sample: MemoryFs) {
    this.worlds.set('/worlds/sample', sample);
    this.shelf.push('/worlds/sample');
    this.lastOpen = '/worlds/sample';
    this.folders.set(
      '/notes/old-campaign',
      new MemoryFs({
        'lore/people/ada-quill.md': '# Ada Quill\n\nA lamplighter who knows every roof in the old quarter.\n',
        'lore/people/bram-hollis.md': '# Bram Hollis\n\nAda Quill owes him a debt she will not name.\n',
        'lore/places/the-old-quarter.md': '# The Old Quarter\n\nNarrow streets where Ada Quill works the lamps.\n',
        'drafts/opening.md': '# Opening\n\nThe lamps went out one street at a time.\n',
        // An archive with more files than the wiki, as real projects often have.
        ...Object.fromEntries([1, 2, 3, 4].map((n) => [`archive/old-${n}.md`, `# Old note ${n}\n`])),
      }),
    );
  }

  async list(): Promise<ShelfWorld[]> {
    const out: ShelfWorld[] = [];
    for (const path of this.shelf) {
      const fs = this.worlds.get(path)!;
      const worldMd = await fs.readText('world.md');
      const about = describeWorld(worldMd);
      let cover: string | null = null;
      for (const ext of ['jpg', 'jpeg', 'png', 'webp']) if (await fs.exists(`world.${ext}`)) cover ??= fs.imageUrl(`world.${ext}`);
      const local = !this.library.path || !path.startsWith(this.library.path + '/');
      out.push({ path, name: about.name, tagline: about.tagline, cover, missing: false, worldMd, local, journal: about.journal });
    }
    return out;
  }

  async last(): Promise<string | null> {
    return this.lastOpen;
  }

  async open(path: string): Promise<WorldFs> {
    this.lastOpen = path;
    return this.worlds.get(path)!;
  }

  async close(): Promise<void> {
    this.lastOpen = null;
  }

  async forget(path: string): Promise<void> {
    this.shelf = this.shelf.filter((p) => p !== path);
  }

  async pickFolder(title: string): Promise<string | null> {
    return /library/i.test(title) ? '/worlds' : '/notes/old-campaign';
  }

  pickImage(): Promise<ImageSource | null> {
    return pickImage();
  }

  async inspect(path: string): Promise<FolderShape> {
    const fs = this.worlds.get(path) ?? this.folders.get(path);
    if (!fs) throw new Error(`No folder at ${path}`);
    const folders: FolderShape['folders'] = [];
    for (const entry of await fs.readDir('')) {
      if (!entry.isDir || entry.name.startsWith('.')) continue;
      folders.push({ name: entry.name, markdown: await countIn(fs, entry.name) });
    }
    folders.sort((a, b) => b.markdown - a.markdown || a.name.localeCompare(b.name));
    return { hasWorld: await fs.exists('world.md'), folders };
  }

  async add(path: string, worldMd: string | null): Promise<void> {
    const fs = this.worlds.get(path) ?? this.folders.get(path)!;
    if (!(await fs.exists('world.md'))) {
      if (!worldMd) throw new Error(`${path} has no world.md`);
      await fs.writeText('world.md', worldMd);
    }
    this.worlds.set(path, fs);
    if (!this.shelf.includes(path)) this.shelf.push(path);
  }

  async defaultLocation(): Promise<string> {
    return '/Documents/Immersion';
  }

  async create(parent: string, folder: string, worldMd: string, dirs: string[]): Promise<string> {
    const path = `${parent}/${folder}`;
    if (this.worlds.has(path)) throw new Error(`${path} already exists and is not empty`);
    const files: Record<string, string> = { 'world.md': worldMd };
    for (const dir of dirs) files[`${dir}/.gitkeep`] = '';
    this.worlds.set(path, new MemoryFs(files));
    this.shelf.push(path);
    return path;
  }

  async writeWorldMd(path: string, text: string): Promise<void> {
    await this.worlds.get(path)!.writeText('world.md', text);
  }

  async info(): Promise<LibraryInfo> {
    return { ...this.library };
  }

  async setLibrary(path: string | null): Promise<void> {
    this.library = { ...this.library, path, asked: true };
  }

  async skipLibrary(): Promise<void> {
    this.library = { ...this.library, asked: true };
  }

  async setGitSync(on: boolean): Promise<void> {
    this.library = { ...this.library, gitSync: on };
  }

  async readYou(): Promise<string | null> {
    return this.library.path ? this.you : null;
  }

  async writeYou(text: string): Promise<void> {
    if (!this.library.path) throw new Error('There is no library on this computer yet.');
    this.you = text;
  }

  // Vaults held in memory: world path to file name to encrypted text.
  private vaults = new Map<string, Map<string, string>>();
  private remembered: string | null = null;

  private vault(world: string): Map<string, string> {
    if (!this.vaults.has(world)) this.vaults.set(world, new Map());
    return this.vaults.get(world)!;
  }

  async vaultList(world: string): Promise<string[]> {
    return [...this.vault(world).keys()].sort();
  }

  async vaultRead(world: string, name: string): Promise<string> {
    const text = this.vault(world).get(name);
    if (text === undefined) throw new Error('No such story in the vault.');
    return text;
  }

  async vaultWrite(world: string, name: string, text: string): Promise<void> {
    this.vault(world).set(name, text);
  }

  async vaultArchive(world: string, name: string): Promise<void> {
    this.vault(world).delete(name);
  }

  async vaultRemember(key: string): Promise<void> {
    this.remembered = key;
  }

  async vaultRecall(): Promise<string | null> {
    return this.remembered;
  }

  async vaultForget(): Promise<void> {
    this.remembered = null;
  }

  async readPicture(image: ImageSource): Promise<Uint8Array> {
    if (image.kind !== 'file') throw new Error('The browser test takes pictures from a file.');
    return new Uint8Array(await image.file.arrayBuffer());
  }

  async setCover(path: string, image: ImageSource): Promise<void> {
    if (image.kind === 'file' && !imageExtension(image.file.name)) throw new Error('Pictures can be JPEG, PNG, or WebP files.');
    await this.worlds.get(path)!.setImage('world', image);
  }
}

async function countIn(fs: MemoryFs, dir: string): Promise<number> {
  let count = 0;
  for (const entry of await fs.readDir(dir)) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDir) count += await countIn(fs, `${dir}/${entry.name}`);
    else if (entry.name.toLowerCase().endsWith('.md')) count += 1;
  }
  return count;
}
