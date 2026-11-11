import { MentionScanner, type Term } from '../index/scanner.ts';

/**
 * The names a game's text links (Mike, November 10). A world with a game has two kinds
 * of names: the world's own, such as its people and places, and the game's terms, which
 * are its rules, sections, and aspects. Game text links both, and links a game term every
 * time it appears. The wiki and the stories
 * link only the world's names, because a game's terms are often ordinary words, and a
 * chapter would light up at every "story" and "action".
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

export function gameTerms(elements: Named[], world: WorldName[], book: 'world' | 'engine'): Term[] {
  const terms: Term[] = [];
  // The world's names come first, so a person who shares a name with a rule links to the person.
  if (book === 'world') {
    for (const e of world) {
      terms.push({ text: e.name, id: e.id });
      for (const a of e.aliases) terms.push({ text: a, id: e.id });
    }
  }
  for (const p of elements) {
    // An add-on is a world's piece of another rule and carries that rule's name.
    if (p.kind === 'add-on') continue;
    if (book === 'engine' && p.origin !== 'engine') continue;
    // A game's terms link every time they are used (Mike, November 11), whether or not
    // they are capitalized, and in the singular or the plural. A term written in lowercase
    // matches in any case, which is how the scanner reads an all-lowercase term.
    for (const text of termForms(p.name)) terms.push({ text, id: `${GAME_LINK}${p.key}` });
  }
  return terms;
}

export function gameScanner(elements: Named[], world: WorldName[], book: 'world' | 'engine'): MentionScanner {
  return new MentionScanner(gameTerms(elements, world, book));
}
