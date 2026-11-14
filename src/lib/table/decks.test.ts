import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { POKER, TAROT, draw, parseDeck, readDecks, readDraws, remaining, writeDraws } from './decks.ts';

const fixed = (...values: number[]) => () => values.shift()!;

test('the decks that come with the app are whole', () => {
  assert.equal(POKER.cards.length, 54);
  assert.equal(TAROT.cards.length, 78);
  assert.equal(new Set(TAROT.cards).size, 78);
});

test("a world's deck is a file that lists its cards", async () => {
  const fs = new MemoryFs({ 'table/decks/fate-deck.md': '---\nname: Fate Deck\n---\n\n# Notes are skipped\n- Red Joker\n- 13 of Rams\n\n1. Black Joker\n', 'table/decks/empty.md': '\n' });
  const decks = await readDecks(fs);
  assert.deepEqual(decks.map((d) => d.id), ['poker', 'tarot', 'fate-deck']);
  assert.deepEqual(decks[2], { id: 'fate-deck', name: 'Fate Deck', cards: ['Red Joker', '13 of Rams', 'Black Joker'], reversals: false });
  assert.equal(parseDeck('One\nTwo\n', 'my-deck.md')?.name, 'My Deck');
});

test('a card drawn leaves the deck until it is shuffled back', () => {
  const deck = { id: 'd', name: 'D', cards: ['A', 'B', 'B', 'C'], reversals: false };
  assert.equal(draw(deck, [], fixed(2)), 'B');
  assert.deepEqual(remaining(deck, ['B']), ['A', 'B', 'C']);
  assert.equal(draw(deck, ['A', 'B', 'B', 'C'], fixed(1)), null);
});

test('a tarot card can come out reversed, and still leaves the deck', () => {
  const card = draw(TAROT, [], fixed(1, 2))!;
  assert.equal(card, 'The Fool (reversed)');
  assert.equal(remaining(TAROT, [card]).length, 77);
});

test('a campaign remembers its draws', async () => {
  const fs = new MemoryFs({});
  assert.deepEqual(await readDraws(fs, 'table/c'), {});
  await writeDraws(fs, 'table/c', { poker: ['Ace of Spades', 'Red Joker'], tarot: [] });
  assert.deepEqual(await readDraws(fs, 'table/c'), { poker: ['Ace of Spades', 'Red Joker'] });
  await writeDraws(fs, 'table/c', {});
  assert.deepEqual(await readDraws(fs, 'table/c'), {});
});
