/**
 * The mention scanner (architecture decision 5). Every feature that finds names in
 * text asks this one scanner: automatic links, previews, the working set, and later
 * the chronicler and the narrator. It knows every entry's name and aliases.
 *
 * Matching rules:
 * - A term with any capital letter matches only with that exact capitalization, so
 *   "Rook" the nickname does not match "rook" the word.
 * - An all-lowercase term, such as the alias "the basin", matches in any case.
 * - A match must stand alone as a word: letters or digits on either side block it.
 *   A possessive still matches, so "Wren's" links "Wren".
 * - Where two terms overlap, the longer one wins, so "Marta \"Wren\" Okafor" beats "Marta".
 *
 * This module has no imports so its tests can run under plain Node.
 */

export interface Term {
  text: string;
  id: string;
}

export interface Mention {
  start: number;
  end: number;
  id: string;
}

const MIN_LENGTH = 2;

/**
 * One rule for plurals, shared by wiki names and game terms (Cerys, November 22). A name
 * also links in its plural, so "two Storm Lamps" links Storm Lamp and "properties" links
 * Property. Only the last word changes.
 */
export function pluralOf(name: string): string {
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}

/** The singular of a name that is written as a plural, or null when it is not one. */
export function singularOf(name: string): string | null {
  if (name.length > 4 && /[^aeiou]ies$/i.test(name)) return `${name.slice(0, -3)}y`;
  if (/(ss|x|z|ch|sh)es$/i.test(name)) return name.slice(0, -2);
  if (name.length > 3 && /[^s]s$/i.test(name)) return name.slice(0, -1);
  return null;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class MentionScanner {
  private exact: RegExp | null;
  private loose: RegExp | null;
  private exactIds = new Map<string, string>();
  private looseIds = new Map<string, string>();

  constructor(terms: Term[]) {
    for (const { text, id } of terms) {
      const t = text.trim();
      if (t.length < MIN_LENGTH) continue;
      if (t === t.toLowerCase()) {
        if (!this.looseIds.has(t)) this.looseIds.set(t, id);
      } else if (!this.exactIds.has(t)) {
        this.exactIds.set(t, id);
      }
    }
    this.exact = MentionScanner.pattern([...this.exactIds.keys()], 'gu');
    this.loose = MentionScanner.pattern([...this.looseIds.keys()], 'giu');
  }

  private static pattern(terms: string[], flags: string): RegExp | null {
    if (terms.length === 0) return null;
    const sorted = [...terms].sort((a, b) => b.length - a.length).map(escape);
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.join('|')})(?![\\p{L}\\p{N}])`, flags);
  }

  /** Every mention in the text, in order, with overlaps resolved toward longer terms. */
  find(text: string): Mention[] {
    const found: Mention[] = [];
    if (this.exact) {
      for (const m of text.matchAll(this.exact)) {
        found.push({ start: m.index!, end: m.index! + m[0].length, id: this.exactIds.get(m[0])! });
      }
    }
    if (this.loose) {
      for (const m of text.matchAll(this.loose)) {
        found.push({ start: m.index!, end: m.index! + m[0].length, id: this.looseIds.get(m[0].toLowerCase())! });
      }
    }
    found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const kept: Mention[] = [];
    let reach = -1;
    for (const m of found) {
      if (m.start < reach) continue;
      kept.push(m);
      reach = m.end;
    }
    return kept;
  }

  /** The distinct entries mentioned in the text, in order of first mention. */
  idsIn(text: string): string[] {
    const ids: string[] = [];
    for (const m of this.find(text)) if (!ids.includes(m.id)) ids.push(m.id);
    return ids;
  }
}
