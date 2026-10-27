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
}

export const DEFAULT_LOOK: Look = { layout: 'classic', backdrop: true };

export interface You {
  profiles: Profile[];
  look: Look;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function readLook(header: Record<string, unknown>): Look {
  return {
    layout: header.layout === 'soft' ? 'soft' : 'classic',
    backdrop: header.backdrop !== false,
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
