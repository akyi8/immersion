import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, within } from './when.ts';

const at = (v: unknown) => {
  const w = parseWhen(v);
  return w && [Math.round(w.start * 1000) / 1000, Math.round(w.end * 1000) / 1000, w.approximate];
};

test('years, eras, and astronomical counting', () => {
  assert.deepEqual(at(2954), [2954, 2955, false]);
  assert.deepEqual(at('2954'), [2954, 2955, false]);
  assert.deepEqual(at('44 BCE'), [-43, -42, false]);
  assert.deepEqual(at('1 BC'), [0, 1, false]);
  assert.deepEqual(at('AD 33'), [33, 34, false]);
  assert.deepEqual(at('10,000 BCE'), [-9999, -9998, false]);
});

test('months, days, seasons, decades, and centuries', () => {
  assert.equal(parseWhen('1066-10-14')!.start, parseWhen('14 October 1066')!.start);
  assert.equal(parseWhen('October 14, 1066')!.start, parseWhen('14th October 1066')!.start);
  assert.ok(parseWhen('October 1066')!.start < parseWhen('14 October 1066')!.start + 0.001);
  assert.ok(parseWhen('spring 2088')!.start > 2088 && parseWhen('spring 2088')!.end < 2089);
  assert.deepEqual(at('1920s'), [1920, 1930, false]);
  assert.deepEqual(at('5th century BCE'), [-499, -399, false]);
  assert.deepEqual(at('21st century'), [2001, 2101, false]);
});

test('approximate dates and spans', () => {
  assert.deepEqual(at('c. 1200 BCE'), [-1199, -1198, true]);
  assert.deepEqual(at('around 1200 BCE'), [-1199, -1198, true]);
  assert.deepEqual(at('1914 to 1918'), [1914, 1919, false]);
  assert.deepEqual(at('1914–1918'), [1914, 1919, false]);
  assert.deepEqual(at('44 BCE - AD 14'), [-43, 15, false]);
  assert.deepEqual(at('500 to 300 BCE'), [-499, -298, false]);
  assert.equal(parseWhen('soon'), null);
});

test('an event falls within an era by its start', () => {
  const era = parseWhen('2045 to 2060')!;
  assert.equal(within(parseWhen('2050')!, era), true);
  assert.equal(within(parseWhen('2061')!, era), false);
});
