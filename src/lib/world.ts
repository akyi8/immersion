import { Document, parse, parseDocument, stringify } from 'yaml';
import { readFrame, readShape, type Frame, type Shape } from './index/frame.ts';
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
  /** True for Real World, the writer's journal (Cerys, October 26). */
  journal: boolean;
  /** True when the journal keeps a page for each day. Off unless the writer turns it on. */
  daily: boolean;
  /** The engine this world's game is built on, as a path from the library's top, or ''. */
  engine: string;
  /** The folder that holds this world's own game elements (Cerys, November 7). */
  gameDir: string;
  /** How every entry's picture shows unless the entry says otherwise, or null to let the category decide. */
  pictures: Shape | null;
  /** How the world's own picture is framed in the Radiance layout's room, or null for centered. */
  roomFrame: Frame | null;
  /** Which English the world is spelled in. American unless its `world.md` says `spelling: british`. */
  spelling: 'american' | 'british';
  /** True when Spanish words are well spelled in this world too, which its `world.md` says as `spelling_also: spanish`. */
  spanish: boolean;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

/** Splits a markdown file into its YAML header (if any) and its body. */
/**
 * A file's YAML header: the lines between a first line of `---` and the next line of
 * `---`. Two such lines with nothing between them are an empty header, not body text.
 */
const HEADER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function splitHeader(text: string): { header: Record<string, unknown>; body: string } {
  const match = HEADER.exec(text);
  if (!match) return { header: {}, body: text };
  let header: Record<string, unknown> = {};
  try {
    const parsed = parse(match[1] ?? '');
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
    journal: header.journal === true,
    daily: header.daily === true,
    engine: text(header.engine, ''),
    gameDir: text(header.game, 'game'),
    pictures: readShape(header.pictures),
    roomFrame: readFrame(header.room_frame),
    spelling: header.spelling === 'british' ? 'british' : 'american',
    spanish: header.spelling_also === 'spanish',
  };
}

/** The folder in the library that holds Real World, the writer's journal (Cerys, October 26). */
export const JOURNAL_FOLDER = 'immersion-journal';

/** The `world.md` of a new Real World. */
export function journalFile(): string {
  return `---
name: Real World
tagline: Your journal
wiki: wiki
stories: stories
journal: true
---

# Real World

This folder is Immersion's journal. Its stories are kept in the vault, encrypted, and the vault of every other world can be read from here.
`;
}

/** The `world.md` the app writes for a new or newly added world. */
/**
 * A world's own id (Cerys, November 22): random, written once into `world.md` as `id:`,
 * and never changed. The world's folder can be renamed or sit at a different path on
 * each computer, and the id still names the same world. The vault seals stories to it.
 */
export function newWorldId(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The id in a `world.md`, or null when it has none yet. */
export function worldIdOf(worldMd: string): string | null {
  const id = splitHeader(worldMd).header.id;
  return typeof id === 'string' && id.trim() ? id.trim() : typeof id === 'number' ? String(id) : null;
}

export function worldFile(world: { name: string; tagline: string; wikiDir: string; storiesDir: string }): string {
  const header = stringify({ id: newWorldId(), name: world.name, tagline: world.tagline, wiki: world.wikiDir, stories: world.storiesDir }).trimEnd();
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
  const match = HEADER.exec(text)!;
  const body = text.slice(match[0].length).replace(/^#\s+(.+)$/m, (line, heading: string) => (heading.trim() === oldName ? `# ${details.name}` : line));
  return match[0] + body;
}

/**
 * Sets or removes keys in a markdown file's YAML header, keeping its other keys, its
 * comments, and the body. A file with no header gains one. A value of `undefined`
 * removes the key, and a header left empty is removed.
 */
export function withHeader(text: string, changes: Record<string, unknown>): string {
  const match = HEADER.exec(text);
  const doc: Document = match && match[1]?.trim() ? parseDocument(match[1]) : new Document({});
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
