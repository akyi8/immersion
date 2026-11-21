import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordsIn } from './spell.ts';

const words = (text: string) => wordsIn(text).map((w) => w.word);

test('a line is read as the words that can be checked', () => {
  assert.deepEqual(words('The stalls open at low water.'), ['The', 'stalls', 'open', 'at', 'low', 'water']);
  assert.deepEqual(words("She didn't take Wren's knife, or the sailors' pay."), ['She', "didn't", 'take', "Wren's", 'knife', 'or', 'the', 'sailors', 'pay']);
  assert.deepEqual(words('It’s a long-shot.'), ["It's", 'long', 'shot']);
});

test('codes, initials, and single letters are left alone', () => {
  assert.deepEqual(words('Roll 2d8 on the MMI, a B2B deal, at x4.'), ['Roll', 'on', 'the', 'deal', 'at']);
  assert.deepEqual(words('See wren@example.com or docs/world_format.'), ['See', 'or']);
});

test('a word is found where it stands, so it can be replaced', () => {
  const [w] = wordsIn('  the brwon fox').filter((x) => x.word === 'brwon');
  assert.deepEqual([w.from, w.to], [6, 11]);
  const [p] = wordsIn("Wren's").slice(0, 1);
  assert.deepEqual([p.from, p.to, p.word], [0, 6, "Wren's"]);
});
