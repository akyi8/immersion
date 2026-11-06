import { test } from 'node:test';
import assert from 'node:assert/strict';
import { find, type Findable } from './finder.ts';

const item = (kind: string, name: string, detail = '', also: string[] = []): Findable => ({ kind, name, detail, also, run: () => {} });

test('the finder ranks names that start with the query first', () => {
  const items = [
    item('Entry', 'Ada Rhye-Cross', 'People'),
    item('Entry', 'Wren Cross', 'People', ['Wren']),
    item('Board', 'Wren Cross Letters', 'Series'),
    item('Chapter', 'The Crossing', 'The Tide Letter'),
  ];
  assert.deepEqual(find(items, 'wren').map((i) => i.name), ['Wren Cross', 'Wren Cross Letters']);
  assert.deepEqual(find(items, 'cross').map((i) => i.name), ['Wren Cross', 'Ada Rhye-Cross', 'Wren Cross Letters', 'The Crossing']);
  // Every word must match, and the detail counts.
  assert.deepEqual(find(items, 'crossing tide').map((i) => i.name), ['The Crossing']);
  assert.deepEqual(find(items, 'people ada').map((i) => i.name), ['Ada Rhye-Cross']);
  // Accents and capitals do not matter.
  assert.equal(find([item('Entry', 'Ōshima Pier')], 'oshima')[0].name, 'Ōshima Pier');
  assert.deepEqual(find(items, '   '), []);
});
