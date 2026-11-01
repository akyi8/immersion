import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasNoProse, writingSpot } from './writeHere.ts';

test('typing after a beat gets a line of its own, outside the quote', () => {
  const beat = '# Chapter 1\n\n> [!outline]\n> Cerys wakes.';
  assert.deepEqual(writingSpot(beat), { insert: '\n\n', at: beat.length + 2 });
  assert.deepEqual(writingSpot(beat + '\n'), { insert: '\n', at: beat.length + 2 });
  assert.deepEqual(writingSpot(beat + '\n\n'), { insert: '', at: beat.length + 2 });
});

test('typing after prose simply continues at the end', () => {
  const prose = '# Chapter 1\n\nShe ran.';
  assert.deepEqual(writingSpot(prose), { insert: '', at: prose.length });
});

test('a chapter with only its heading and beat has no prose yet', () => {
  assert.equal(hasNoProse('---\nstages:\n  kishotenketsu: ki\n---\n# Chapter 1\n\n> [!outline]\n> Cerys wakes.\n'), true);
  assert.equal(hasNoProse('# Chapter 1\n\n> [!outline]\n> Cerys wakes.\n\nShe ran.'), false);
});
