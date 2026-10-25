import { Document, parse, parseDocument, stringify } from 'yaml';
import type { WorldFs } from './fs/types';
import { themeFrom, type ThemeSpec } from './theme.ts';

/** What `world.md` says about a world, with defaults for anything it leaves out. */
export interface World {
  name: string;
  tagline: string;
  wikiDir: string;
  storiesDir: string;
  /** The world's own colors and fonts, or null for the app's Night theme. */
  theme: ThemeSpec | null;
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

/** What a `world.md` file says, with defaults for anything it leaves out. */
export function describeWorld(worldMd: string): Omit<World, 'imagePath'> {
  const { header, body } = splitHeader(worldMd);
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return {
    name: text(header.name, heading ?? 'Untitled world'),
    tagline: text(header.tagline, ''),
    wikiDir: text(header.wiki, 'wiki'),
    storiesDir: text(header.stories, 'stories'),
    theme: themeFrom(header),
  };
}

/** The `world.md` the app writes for a new or newly added world. */
export function worldFile(world: { name: string; tagline: string; wikiDir: string; storiesDir: string }): string {
  const header = stringify({ name: world.name, tagline: world.tagline, wiki: world.wikiDir, stories: world.storiesDir }).trimEnd();
  return `---
${header}
---

# ${world.name}

This folder is an Immersion world. The header above gives the world's name, the line shown under it on the loading screen, and the folders that hold the wiki and the stories. A picture named \`world.jpg\` or \`world.png\` beside this file becomes the world's cover.
`;
}

/**
 * Changes a world's name and tagline in its `world.md`, keeping every other line of the
 * header, its comments, and the body. A title heading that matched the old name follows
 * the new one.
 */
export function withDetails(worldMd: string, details: { name: string; tagline: string }): string {
  const oldName = describeWorld(worldMd).name;
  const text = withHeader(worldMd, { name: details.name, tagline: details.tagline });
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)!;
  const body = text.slice(match[0].length).replace(/^#\s+(.+)$/m, (line, heading: string) => (heading.trim() === oldName ? `# ${details.name}` : line));
  return match[0] + body;
}

/**
 * Sets or removes keys in a markdown file's YAML header, keeping its other keys, its
 * comments, and the body. A file with no header gains one. A value of `undefined`
 * removes the key, and a header left empty is removed.
 */
export function withHeader(text: string, changes: Record<string, unknown>): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  const doc: Document = match && match[1].trim() ? parseDocument(match[1]) : new Document({});
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) doc.delete(key);
    else doc.set(key, value);
  }
  const body = match ? text.slice(match[0].length) : text;
  const header = doc.toString().trim();
  if (header === '{}' || header === '') return body.replace(/^\r?\n/, '');
  return `---\n${header}\n---\n${match ? '' : '\n'}${body}`;
}

export async function loadWorld(fs: WorldFs): Promise<World> {
  const described = describeWorld(await fs.readText('world.md'));
  let imagePath: string | null = null;
  for (const ext of IMAGE_EXTENSIONS) {
    if (await fs.exists(`world.${ext}`)) {
      imagePath = `world.${ext}`;
      break;
    }
  }
  return { ...described, imagePath };
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
