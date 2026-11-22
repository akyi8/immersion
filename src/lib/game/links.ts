import { MentionScanner, pluralOf, singularOf, type Mention, type Term } from '../index/scanner.ts';
import { builtIn, linkingOf, type Labels } from './labels.ts';

/**
 * The names a game's text links. One set of rules covers the three kinds of name
 * (Cerys, November 22), and each kind takes the rule that fits what it is:
 *
 * - A wiki name is a proper noun. It links where it is written with its capitals. An
 *   alias written all in lowercase links in any case, because the writer wrote it so.
 * - An aspect is the name of an ability, which is a proper noun too. It links where it is
 *   written with its capitals.
 * - A mechanic, which is an element labelled `keyword`, is a concept. It links however
 *   it is written, so "burned" in a rule links the keyword Burned.
 *
 * Which rule an element takes is read from its labels, in `labels.ts`.
 *
 * Every kind links in its plural as well. The names of divisions, sections, and rules
 * never link, because a heading's words are ordinary words in the text.
 *
 * Which names link depends on where the text is. The wiki, the stories, and the boards
 * link wiki names alone. A world's game text links all three. The base engine belongs to
 * every world built on it, so its text links the engine's own aspects and mechanics.
 */
export const GAME_LINK = 'game:';

export const isGameLink = (id: string) => id.startsWith(GAME_LINK);

export interface Named {
  key: string;
  name: string;
  kind: string;
  origin: string;
  /** The element's labels, from its `tags:`. */
  tags?: string[];
}

export interface WorldName {
  id: string;
  name: string;
  aliases: string[];
}

/** A name as it is written, with its plural if it is singular and its singular if it is plural. */
export function nameForms(name: string): string[] {
  const term = name.trim();
  if (!term) return [];
  return [term, singularOf(term) ?? pluralOf(term)];
}

export function gameTerms(elements: Named[], world: WorldName[], book: 'world' | 'engine', labels: Labels = builtIn()): Term[] {
  const terms: Term[] = [];
  // The world's names come first, so a person who shares a name with an aspect links to the person.
  if (book === 'world') {
    for (const e of world) {
      terms.push({ text: e.name, id: e.id });
      for (const a of e.aliases) terms.push({ text: a, id: e.id });
    }
    for (const { text, id } of [...terms]) if (!/s$/i.test(text.trim())) terms.push({ text: pluralOf(text.trim()), id });
  }
  for (const p of elements) {
    if (book === 'engine' && p.origin !== 'engine') continue;
    const links = linkingOf(p, labels);
    // Divisions, sections, and rules never link by their names (Cerys, November 21).
    if (links === 'never') continue;
    // A mechanic is a concept, so it links however it is written: the scanner matches a
    // lowercase term in any case. An aspect is a name, so it links as it is named, capitals
    // and all. Both link in the singular and the plural.
    for (const text of nameForms(p.name)) terms.push({ text: links === 'any case' ? text.toLowerCase() : text, id: `${GAME_LINK}${p.key}` });
  }
  return terms;
}

/**
 * The scanner for a game's text. An aspect of one word that opens a sentence is left
 * unlinked, because every sentence opens with a capital and "Tell me who" is not the
 * aspect named Tell. Written in bold or italics there, it links, since that marks it as
 * the term. Aspects of two words or more link wherever they stand, and so do mechanics
 * and the world's names.
 */
class GameScanner extends MentionScanner {
  /** The mechanics, which link wherever they stand. */
  private anyCase: Set<string>;

  constructor(terms: Term[], anyCase: Set<string>) {
    super(terms);
    this.anyCase = anyCase;
  }

  override find(text: string): Mention[] {
    return super.find(text).filter((m) => {
      if (!isGameLink(m.id) || this.anyCase.has(m.id) || /\s/.test(text.slice(m.start, m.end))) return true;
      const before = text.slice(0, m.start);
      if (/[*_]$/.test(before)) return true;
      const lead = before.replace(/[\s"'“‘(\[]+$/u, '');
      return lead !== '' && !/[.!?:;>\-–—#|]$/u.test(lead) && !/^\s*(?:[-+*]|\d+[.)])\s*$/u.test(before.slice(before.lastIndexOf('\n') + 1));
    });
  }
}

export function gameScanner(elements: Named[], world: WorldName[], book: 'world' | 'engine', labels: Labels = builtIn()): MentionScanner {
  const anyCase = elements.filter((p) => linkingOf(p, labels) === 'any case').map((p) => `${GAME_LINK}${p.key}`);
  return new GameScanner(gameTerms(elements, world, book, labels), new Set(anyCase));
}
