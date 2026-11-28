import { hasPage, type Element, type Kind } from './elements.ts';

/**
 * An aspect as a card (Cerys, November 27). An aspect's header is its card: the lit face
 * holds its prerequisite, flavor, rules, and consequences, and the darkened face holds the
 * darkened ones and how it recovers. The card is the shape of a tarot card, and its text
 * is one fixed size, so a face that holds too much says so in place of shrinking.
 */
export interface CardFace {
  flavor: string;
  rules: string[];
  consequences: string[];
}

export interface AspectCard {
  name: string;
  /** The kind's name, such as "Gear", and its id, which chooses the icon. */
  kind: string;
  kindId: string;
  /** The tags, without the kind's own, which the card already says at its top. */
  tags: string[];
  prerequisite: string;
  lit: CardFace;
  dark: CardFace;
  recovery: string;
  /** Whether anything is written for the darkened face. */
  hasDark: boolean;
}

const lines = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : (v ?? '').split('\n')).map((l) => l.trim()).filter(Boolean);
const text = (v: string | string[] | undefined): string => (Array.isArray(v) ? v.join('\n') : (v ?? '')).trim();

/** The card of an aspect, or null for an element that is not one: a keyword, a rule, a section. */
export function cardOf(el: Element, kind: Kind | null | undefined): AspectCard | null {
  if (!kind || !hasPage(kind)) return null;
  const f = el.fields;
  const dark = { flavor: text(f.darkened_flavor), rules: lines(f.darkened_rules), consequences: lines(f.darkened_consequences) };
  const recovery = text(f.recovery);
  return {
    name: el.name,
    kind: kind.name,
    kindId: kind.id,
    tags: el.tags.filter((t) => t.toLowerCase() !== kind.id.toLowerCase()),
    prerequisite: text(f.prerequisite),
    lit: { flavor: text(f.flavor), rules: lines(f.rules), consequences: lines(f.consequences) },
    dark,
    recovery,
    hasDark: !!(dark.flavor || dark.rules.length || dark.consequences.length || recovery),
  };
}
