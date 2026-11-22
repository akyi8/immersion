import { splitHeader, withHeader } from '../world.ts';
import type { WorldFs } from '../fs/types';
import { TABLE_DIR, slugOf, titleFromSlug } from './index.ts';
import type { Chance } from './dice.ts';

/**
 * Decks of cards for the table (Cerys, November 14). Two decks come with the app: a poker
 * deck with its jokers, and the tarot. Any other deck is a file in the world's
 * `table/decks` folder that lists its cards, one to a line, so a deck is added by adding
 * a file. A campaign remembers what has been drawn from each deck in its `draws.md`.
 */
export interface Deck {
  id: string;
  name: string;
  cards: string[];
  /** Whether a card can come out upside down, as tarot cards do. */
  reversals: boolean;
}

const RANKS = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
export const POKER: Deck = {
  id: 'poker',
  name: 'Poker deck',
  cards: [...['Spades', 'Hearts', 'Diamonds', 'Clubs'].flatMap((s) => RANKS.map((r) => `${r} of ${s}`)), 'Red Joker', 'Black Joker'],
  reversals: false,
};

const MAJOR = ['The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor', 'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit', 'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance', 'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun', 'Judgement', 'The World'];
const COURT = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];
export const TAROT: Deck = {
  id: 'tarot',
  name: 'Tarot',
  cards: [...MAJOR, ...['Wands', 'Cups', 'Swords', 'Pentacles'].flatMap((s) => COURT.map((r) => `${r} of ${s}`))],
  reversals: true,
};

export const DECKS_DIR = `${TABLE_DIR}/decks`;

/** A deck from its file: a name in the header, and one card on each line of the body. */
export function parseDeck(source: string, fileName: string): Deck | null {
  const { header, body } = splitHeader(source);
  const cards = body
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
    .filter((l) => l && !l.startsWith('#'));
  if (!cards.length) return null;
  const stem = fileName.replace(/\.md$/i, '');
  return { id: slugOf(stem), name: typeof header.name === 'string' && header.name.trim() ? header.name.trim() : titleFromSlug(stem), cards, reversals: header.reversals === true };
}

/** Every deck the world has: the two that come with the app, then the world's own. */
export async function readDecks(fs: WorldFs): Promise<Deck[]> {
  const out = [POKER, TAROT];
  if (!(await fs.exists(DECKS_DIR))) return out;
  for (const e of await fs.readDir(DECKS_DIR)) {
    if (e.isDir || !/\.md$/i.test(e.name)) continue;
    try {
      const deck = parseDeck(await fs.readText(`${DECKS_DIR}/${e.name}`), e.name);
      // A world's own deck takes the place of one that comes with the app, when it has the same name.
      if (!deck) continue;
      const i = out.findIndex((d) => d.id === deck.id);
      if (i >= 0) out[i] = deck;
      else out.push(deck);
    } catch {
      // A deck that cannot be read is left out, and the others still show.
    }
  }
  return out;
}

/** What a campaign has drawn from each deck, newest last. A reversed card ends with " (reversed)". */
export type Draws = Record<string, string[]>;

const REVERSED = ' (reversed)';
export const upright = (card: string) => (card.endsWith(REVERSED) ? card.slice(0, -REVERSED.length) : card);

export const drawsPath = (campaign: string) => `${campaign}/draws.md`;

export async function readDraws(fs: WorldFs, campaign: string): Promise<Draws> {
  try {
    const drawn = splitHeader(await fs.readText(drawsPath(campaign))).header.drawn;
    const out: Draws = {};
    if (drawn && typeof drawn === 'object') for (const [id, cards] of Object.entries(drawn)) if (Array.isArray(cards)) out[id] = cards.map(String);
    return out;
  } catch {
    return {};
  }
}

export async function writeDraws(fs: WorldFs, campaign: string, draws: Draws): Promise<void> {
  const kept = Object.fromEntries(Object.entries(draws).filter(([, cards]) => cards.length));
  let source = '';
  try {
    source = await fs.readText(drawsPath(campaign));
  } catch {
    // The first draw makes the file.
  }
  const next = withHeader(source, { drawn: Object.keys(kept).length ? kept : undefined });
  await fs.writeText(drawsPath(campaign), next || '\n');
}

/** The cards still in a deck, given what has been drawn. A deck may hold the same card twice. */
export function remaining(deck: Deck, drawn: string[]): string[] {
  const left = [...deck.cards];
  for (const card of drawn) {
    const i = left.indexOf(upright(card));
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

/** Draws one card from what is left, or null when the deck is spent. */
export function draw(deck: Deck, drawn: string[], by: Chance): string | null {
  const left = remaining(deck, drawn);
  if (!left.length) return null;
  const card = left[by(left.length) - 1];
  return deck.reversals && by(2) === 2 ? card + REVERSED : card;
}
