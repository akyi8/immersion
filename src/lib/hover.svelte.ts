/**
 * Hover cards (Cerys, November 24). Resting the pointer on a linked name shows a small
 * card saying who or what it is, so a writer never has to leave the sentence to remember.
 * The card is the entry page's card made small: the name up the spine, a summary beside
 * it, and the picture behind.
 *
 * The words on a card come from the files. `summary:` in a file's header is used when
 * there is one, and otherwise the card shows the first sentence. The app writes nothing.
 */
import type { AspectCard } from './game/card.ts';

export interface CardFacts {
  /** The link's id, which is what a click on the name opens. */
  id: string;
  /** What kind of thing it is, such as "People" or "Keyword". */
  kind: string;
  /** The name of its icon, or null. */
  icon: string | null;
  /** The name's large words and its small ones, as on the entry's own card. */
  main: string;
  lead: string;
  brief: string;
  also: string[];
  /** Small facts shown under the summary, such as a piece of gear's tags. */
  facts: [label: string, value: string][];
  /** The picture's address and how it is framed, or null. */
  picture: { url: string; style: string } | null;
  /** True for a game term, which is edged in the world's second color. */
  game: boolean;
  /** An aspect shows as its own card, with two faces, in place of the small one. */
  card?: AspectCard | null;
  /** For an aspect's card: the keyword a tag names, and opening it. */
  tagKey?: (tag: string) => string | null;
  onOpenTag?: (key: string) => void;
}

/** The first sentence of a passage, for a card with no summary written for it. */
export function firstSentence(text: string, most = 200): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  const first = /^.*?[.!?](?=\s|$)/.exec(plain)?.[0] ?? plain;
  return first.length > most ? `${first.slice(0, most - 1).replace(/\s+\S*$/, '')}…` : first;
}

class Hover {
  /** The name the pointer rests on, and the link it carries. */
  anchor = $state<HTMLElement | null>(null);
  id = $state<string | null>(null);
  /** The Game module says what a game term's card holds, while it is open. */
  game = $state.raw<((key: string) => CardFacts | null) | null>(null);

  show(anchor: HTMLElement, id: string) {
    this.anchor = anchor;
    this.id = id;
  }

  hide() {
    this.anchor = null;
    this.id = null;
  }
}

export const hover = new Hover();
