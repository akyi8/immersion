import { splitHeader, withHeader } from './world.ts';
import { slugify } from './slug.ts';

/**
 * What follows the writer to every computer (Mike, October 26), kept in `immersion.md`
 * at the root of the library. It starts with author profiles: a name to write under and
 * who holds the copyright, such as a pen name and a legal name. A title page links to a
 * profile by its id, so a profile renamed later is renamed on every book that uses it.
 */
export interface Profile {
  /** Fixed when the profile is made, so links survive a change of name. */
  id: string;
  author: string;
  copyright: string;
}

/**
 * The writer's layout (Mike, October 27), which is theirs on every world rather than a
 * world's. Classic is the app as it began, ruled with lines. Soft trades the lines for
 * space, rounds the corners, sets the type a step smaller, and lets things settle into
 * place, and its desk can show the open world's picture through frosted glass.
 */
export type Layout = 'classic' | 'soft';

export interface Look {
  layout: Layout;
  /** In Soft, whether the world's picture glows through behind the desk. */
  backdrop: boolean;
  /** Whether a world's loading screen enters the world on its own after a breath (Mike, October 31). */
  autoEnter: boolean;
  /** The face of the text on boards: the world's prose font, or a condensed one (Mike, October 31). */
  boardFont: BoardFont;
  /** The modules the header shows, in header order. */
  modules: ModuleId[];
}

export type BoardFont = 'theme' | 'cabin' | 'plex';

/**
 * The modules the header shows (Mike, November 7). World, Boards, and Story are on from
 * the start. Character, Play, and Game serve fewer writers, so each waits until the
 * writer turns it on in Settings.
 */
export type ModuleId = 'character' | 'play' | 'world' | 'boards' | 'story' | 'game';
export const MODULES: [ModuleId, string, string][] = [
  ['character', 'Character', 'Protagonists for play. Still being designed.'],
  ['play', 'Play', 'Solo sessions with a narrator. Coming after the Game module.'],
  ['world', 'World', "The world's wiki."],
  ['boards', 'Boards', 'The timeline, series boards, and manuscript boards.'],
  ['story', 'Story', 'The desk, the drawer, and the shelf.'],
  ['game', 'Game', "A game's rules, kept as separate elements, for writing a tabletop game."],
];
export const DEFAULT_MODULES: ModuleId[] = ['world', 'boards', 'story'];
export const BOARD_FONTS: [BoardFont, string, string][] = [
  ['theme', "The world's prose font", ''],
  ['cabin', 'Cabin Condensed', "'Cabin Condensed', sans-serif"],
  ['plex', 'IBM Plex Sans Condensed', "'IBM Plex Sans Condensed', sans-serif"],
];

export const DEFAULT_LOOK: Look = { layout: 'classic', backdrop: true, autoEnter: true, boardFont: 'theme', modules: [...DEFAULT_MODULES] };

/** A list of modules in header order, keeping only real ones, or the defaults when none is left. */
export function moduleList(value: unknown): ModuleId[] {
  const wanted = Array.isArray(value) ? value.map(String) : [];
  const list = MODULES.map(([id]) => id).filter((id) => wanted.includes(id));
  return list.length ? list : [...DEFAULT_MODULES];
}

const sameModules = (a: ModuleId[], b: ModuleId[]) => a.length === b.length && a.every((m, i) => m === b[i]);

export interface You {
  profiles: Profile[];
  look: Look;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function readLook(header: Record<string, unknown>): Look {
  return {
    layout: header.layout === 'soft' ? 'soft' : 'classic',
    backdrop: header.backdrop !== false,
    autoEnter: header.enter !== 'wait',
    boardFont: header.board_font === 'cabin' || header.board_font === 'plex' ? header.board_font : 'theme',
    modules: moduleList(header.modules),
  };
}

export function readYou(source: string | null): You {
  if (!source) return { profiles: [], look: { ...DEFAULT_LOOK } };
  const { header } = splitHeader(source);
  const list = Array.isArray(header.profiles) ? header.profiles : [];
  const profiles: Profile[] = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const author = text(r.author);
    const id = text(r.id) || slugify(author);
    if (id && !profiles.some((x) => x.id === id)) profiles.push({ id, author, copyright: text(r.copyright) });
  }
  return { profiles, look: readLook(header) };
}

/** The new text of `immersion.md` with this layout, keeping anything else in it. */
export function withLook(source: string | null, look: Look): string {
  return withHeader(source ?? withProfiles(null, []), {
    layout: look.layout === 'classic' ? undefined : look.layout,
    backdrop: look.backdrop ? undefined : false,
    enter: look.autoEnter ? undefined : 'wait',
    board_font: look.boardFont === 'theme' ? undefined : look.boardFont,
    modules: sameModules(look.modules, DEFAULT_MODULES) ? undefined : look.modules,
  });
}

/** The new text of `immersion.md` with these profiles, keeping anything else in it. */
export function withProfiles(source: string | null, profiles: Profile[]): string {
  const base = source ?? '# Immersion\n\nWhat follows you to every computer: your author profiles. Immersion keeps this file, and it is safe to read.\n';
  return withHeader(base, { profiles: profiles.length ? profiles.map((p) => ({ id: p.id, author: p.author, copyright: p.copyright })) : undefined });
}

/** An id for a new profile that no other profile has. */
export function newProfileId(author: string, taken: Profile[]): string {
  const base = slugify(author) || 'profile';
  let id = base;
  for (let n = 2; taken.some((p) => p.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** How a profile reads in a list: the author, with the copyright holder when it differs. */
export function profileLabel(p: Profile): string {
  return p.copyright && p.copyright !== p.author ? `${p.author} (© ${p.copyright})` : p.author || 'Unnamed profile';
}
