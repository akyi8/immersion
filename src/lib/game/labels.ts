import { splitHeader } from '../world.ts';

/**
 * A game's labels (Cerys, November 22). A label is a lowercase word on an element, and an
 * element's labels are its kind and everything in its `tags:`, read as one set. The kind
 * `gear` and the tag `gear` are the same label.
 *
 * Most labels are plain tags that only the writer reads. A few mean something to the app,
 * and `labels.md` says what. The engine can have one, and a world's game folder can have
 * one, which adds labels and can change what an engine label means in that world. Its
 * header maps each label to its meaning, and its body is the writer's own notes:
 *
 *     ---
 *     keyword:
 *       links: any case
 *       plural: Keywords
 *     gear:
 *       is: aspect
 *     ---
 *
 * A game with no labels file behaves as the built-in meanings below say, so the file is
 * needed only to change them.
 */
export type Linking = 'any case' | 'capitals' | 'never';

export interface Meaning {
  /** How an element's name links in game text. */
  links?: Linking;
  /** Other labels every element with this label also has, such as `aspect` for `gear`. */
  is?: string[];
  /** The heading a list of these elements goes under, such as "Keywords". */
  plural?: string;
  /** ICONS TRIAL: the icon elements with this label wear, by its name in the icon set, or `none`. */
  icon?: string;
}

export type Labels = Map<string, Meaning>;

/**
 * What the app knows with no labels file. A keyword is a concept and links however it is
 * written. An aspect is a name and links with its capitals. The parts of a book never link
 * by their names, because a heading's words are ordinary words in the text.
 */
export const BUILT_IN: [string, Meaning][] = [
  ['keyword', { links: 'any case' }],
  ['aspect', { links: 'capitals' }],
  ['division', { links: 'never' }],
  ['chapter', { links: 'never' }],
  ['module', { links: 'never' }],
  ['add-on', { links: 'never' }],
];

export const builtIn = (): Labels => new Map(BUILT_IN.map(([k, m]) => [k, { ...m }]));

const norm = (label: unknown) => String(label ?? '').trim().toLowerCase();
const LINKINGS = new Set<string>(['any case', 'capitals', 'never']);

/**
 * Reads a `labels.md` over the meanings already known. An entry the app cannot read is
 * left out and named in `skipped`, with the reason, so one bad line never costs the rest.
 */
export function readLabels(text: string | null, over: Labels = builtIn()): { labels: Labels; skipped: string[] } {
  const labels: Labels = new Map([...over].map(([k, m]) => [k, { ...m }]));
  const skipped: string[] = [];
  if (!text) return { labels, skipped };
  for (const [key, value] of Object.entries(splitHeader(text.replace(/\r\n?/g, '\n')).header)) {
    const label = norm(key);
    if (!label) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      skipped.push(`${key}: its meaning must be a set of lines such as "links: any case".`);
      continue;
    }
    const given = value as Record<string, unknown>;
    const next: Meaning = { ...labels.get(label) };
    if (given.links !== undefined) {
      const links = norm(given.links);
      if (!LINKINGS.has(links)) {
        skipped.push(`${key}: links is "${String(given.links)}", and it can be "any case", "capitals", or "never".`);
        continue;
      }
      next.links = links as Linking;
    }
    if (given.is !== undefined) next.is = (Array.isArray(given.is) ? given.is : [given.is]).map(norm).filter(Boolean);
    if (typeof given.plural === 'string' && given.plural.trim()) next.plural = given.plural.trim();
    // ICONS TRIAL
    if (typeof given.icon === 'string' && given.icon.trim()) next.icon = given.icon.trim();
    labels.set(label, next);
  }
  return { labels, skipped };
}

/** An element's labels: its kind, its tags, and every label those say it also has. */
export function labelsOf(el: { kind: string; tags?: string[] }, labels: Labels): Set<string> {
  const out = new Set<string>();
  const take = (label: string) => {
    if (!label || out.has(label)) return;
    out.add(label);
    for (const more of labels.get(label)?.is ?? []) take(more);
  };
  take(norm(el.kind));
  for (const t of el.tags ?? []) take(norm(t));
  return out;
}

const STRICTNESS: Record<Linking, number> = { 'any case': 0, capitals: 1, never: 2 };

/**
 * How an element's name links. When its labels disagree, the strictest wins, so an
 * element that is both an aspect and a keyword links with its capitals. An element with
 * no label that says is a name, and links with its capitals.
 */
export function linkingOf(el: { kind: string; tags?: string[] }, labels: Labels): Linking {
  let found: Linking | null = null;
  for (const label of labelsOf(el, labels)) {
    const links = labels.get(label)?.links;
    if (links && (found === null || STRICTNESS[links] > STRICTNESS[found])) found = links;
  }
  return found ?? 'capitals';
}

/** Whether an element carries a label, for a list that gathers by label. */
export const hasLabel = (el: { kind: string; tags?: string[] }, label: string, labels: Labels) => labelsOf(el, labels).has(norm(label));
