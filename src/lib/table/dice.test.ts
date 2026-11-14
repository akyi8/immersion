import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoll, roll, rollLine, saidRoll, troubleLine, troubleRoll } from './dice.ts';

/** Dice that come up in a set order. */
const fixed = (...values: number[]) => () => values.shift()!;

test('rolls are read the way players write them', () => {
  assert.deepEqual(parseRoll('d20'), [{ sign: 1, count: 1, sides: 20 }]);
  assert.equal(saidRoll(parseRoll(' 2D6 +3 ')!), '2d6 + 3');
  assert.equal(saidRoll(parseRoll('4d6-1d4-2')!), '4d6 - d4 - 2');
  for (const bad of ['', 'hello', '7', 'd1', '0d6', '3d', 'd20+', '101d6', '2d6++1']) assert.equal(parseRoll(bad), null, bad);
});

test('a roll adds its dice and its numbers', () => {
  const r = roll(parseRoll('2d6+3')!, fixed(4, 2));
  assert.equal(r.total, 9);
  assert.equal(rollLine(r), 'Rolled 2d6 + 3: 4, 2 = 9');
  assert.equal(rollLine(roll(parseRoll('d20')!, fixed(7)), 'Hunting 12'), 'Rolled d20 for Hunting 12: 7');
  assert.equal(roll(parseRoll('d20-d4')!, fixed(10, 3)).total, 7);
});

test('a trouble roll counts dice below the edge, and the 8s and 1s', () => {
  const r = troubleRoll(4, 6, fixed(4, 7, 1, 6));
  assert.deepEqual([r.trouble, r.eights, r.ones], [2, 0, 1]);
  assert.equal(troubleLine(r, 'the climb'), 'Rolled 4d8 at edge 6 for the climb: 4, 7, 1, 6 = 2 trouble (1 1)');
  assert.equal(troubleRoll(0, 7).values.length, 0);
});
