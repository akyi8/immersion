import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceAt } from './sentence.ts';

const text = 'The bell rang. "Who is it?" Wren asked. Nobody answered.';
const at = (offset: number) => {
  const s = sentenceAt(text, offset);
  return text.slice(s.from, s.to).trim();
};

test('the sentence around the cursor is found', () => {
  assert.equal(at(3), 'The bell rang.');
  assert.equal(at(20), '"Who is it?"');
  assert.equal(at(30), 'Wren asked.');
  assert.equal(at(text.length), 'Nobody answered.');
});

test('the start of a sentence belongs to that sentence', () => {
  assert.equal(at(15), '"Who is it?"');
});

test('just past the last period, the sentence just written is still the one', () => {
  const s = sentenceAt('One. Two. ', 10);
  assert.deepEqual(s, { from: 5, to: 10 });
});

test('a paragraph of one sentence is all of it', () => {
  assert.deepEqual(sentenceAt('No period here', 4), { from: 0, to: 14 });
  assert.deepEqual(sentenceAt('', 0), { from: 0, to: 0 });
});
