import { MentionScanner, type Mention, type Term } from '../index/scanner.ts';

/**
 * The names a game's text links (Cerys, November 10). A world with a game has two kinds
 * of names: the world's own, such as its people and places, and the game's terms, which
 * are its aspects and keywords. Game text links both. A game term links where it is
 * written with its capital, and the names of divisions, sections, and rules never link,
 * because a game's terms are often ordinary words (Cerys, November 21). The wiki and the
 * stories link only the world's names.
 *
 * The base engine belongs to every world built on it, so its text links game terms
 * alone, and only the engine's own.
 */
export const GAME_LINK = 'game:';

export const isGameLink = (id: string) => id.startsWith(GAME_LINK);

export interface Named {
  key: string;
  name: string;
  kind: string;
  origin: string;
}

export interface WorldName {
  id: string;
  name: string;
  aliases: string[];
}

/** A term in lowercase, with its plural if it is singular and its singular if it is plural. */
export function termForms(name: string): string[] {
  const term = name.trim().toLowerCase();
  if (!term) return [];
  if (/[^s]s$/.test(term) && term.length > 3) return [term, term.slice(0, -1)];
  if (/(s|x|z|ch|sh)$/.test(term)) return [term, `${term}es`];
  return [term, `${term}s`];
}

/** A name as it is written, with its plural if it is singular and its singular if it is plural. */
export function nameForms(name: string): string[] {
  const term = name.trim();
  if (!term) return [];
  if (/[^sS]s$/.test(term) && term.length > 3) return [term, term.slice(0, -1)];
  if (/(s|x|z|ch|sh)$/i.test(term)) return [term, `${term}es`];
  return [term, `${term}s`];
}

/** The parts of a book. Their names are headings, and a heading's words are ordinary words in the text. */
const STRUCTURE = new Set(['division', 'chapter', 'module', 'add-on']);

export function gameTerms(elements: Named[], world: WorldName[], book: 'world' | 'engine'): Term[] {
  const terms: Term[] = [];
  // The world's names come first, so a person who shares a name with an aspect links to the person.
  if (book === 'world') {
    for (const e of world) {
      terms.push({ text: e.name, id: e.id });
      for (const a of e.aliases) terms.push({ text: a, id: e.id });
    }
  }
  for (const p of elements) {
    // Divisions, sections, and rules never link by their names (Cerys, November 21).
    if (STRUCTURE.has(p.kind)) continue;
    if (book === 'engine' && p.origin !== 'engine') continue;
    // An aspect or a keyword links where it is written as it is named, capitals and all,
    // in the singular or the plural. The same word in lowercase is an ordinary word.
    for (const text of nameForms(p.name)) terms.push({ text, id: `${GAME_LINK}${p.key}` });
  }
  return terms;
}

/**
 * The scanner for a game's text. A game term of one word that opens a sentence is left
 * unlinked, because every sentence opens with a capital and "Tell me who" is not the
 * aspect named Tell. Written in bold or italics there, it links, since that marks it as
 * the term. Terms of two words or more link wherever they stand, and so do the world's
 * names.
 */
class GameScanner extends MentionScanner {
  override find(text: string): Mention[] {
    return super.find(text).filter((m) => {
      if (!isGameLink(m.id) || /\s/.test(text.slice(m.start, m.end))) return true;
      const before = text.slice(0, m.start);
      if (/[*_]$/.test(before)) return true;
      const lead = before.replace(/[\s"'“‘(\[]+$/u, '');
      return lead !== '' && !/[.!?:;>\-–—#|]$/u.test(lead) && !/^\s*(?:[-+*]|\d+[.)])\s*$/u.test(before.slice(before.lastIndexOf('\n') + 1));
    });
  }
}

export function gameScanner(elements: Named[], world: WorldName[], book: 'world' | 'engine'): MentionScanner {
  return new GameScanner(gameTerms(elements, world, book));
}
