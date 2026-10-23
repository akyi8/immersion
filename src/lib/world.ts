import { parse } from 'yaml';
import type { WorldFs } from './fs/types';

/** What `world.md` says about a world, with defaults for anything it leaves out. */
export interface World {
  name: string;
  tagline: string;
  wikiDir: string;
  storiesDir: string;
  /** Path of the loading-screen image, relative to the world folder, if there is one. */
  imagePath: string | null;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

/** Splits a markdown file into its YAML header (if any) and its body. */
export function splitHeader(text: string): { header: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { header: {}, body: text };
  let header: Record<string, unknown> = {};
  try {
    const parsed = parse(match[1]);
    if (parsed && typeof parsed === 'object') header = parsed as Record<string, unknown>;
  } catch {
    // A malformed header is treated as no header rather than blocking the world.
  }
  return { header, body: text.slice(match[0].length) };
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

export async function loadWorld(fs: WorldFs): Promise<World> {
  const { header, body } = splitHeader(await fs.readText('world.md'));
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  let imagePath: string | null = null;
  for (const ext of IMAGE_EXTENSIONS) {
    if (await fs.exists(`world.${ext}`)) {
      imagePath = `world.${ext}`;
      break;
    }
  }
  return {
    name: text(header.name, heading ?? 'Untitled world'),
    tagline: text(header.tagline, ''),
    wikiDir: text(header.wiki, 'wiki'),
    storiesDir: text(header.stories, 'stories'),
    imagePath,
  };
}

/** Counts the markdown files under a folder, at any depth, skipping hidden folders. */
export async function countMarkdown(fs: WorldFs, dir: string): Promise<number> {
  if (!(await fs.exists(dir))) return 0;
  let count = 0;
  for (const entry of await fs.readDir(dir)) {
    if (entry.name.startsWith('.')) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDir) count += await countMarkdown(fs, path);
    else if (entry.name.toLowerCase().endsWith('.md')) count += 1;
  }
  return count;
}
