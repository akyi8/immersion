import { test } from 'node:test';
import assert from 'node:assert/strict';
import { find, type Findable } from './finder.ts';

const item = (kind: string, name: string, detail = '', also: string[] = []): Findable => ({ kind, name, detail, also, run: () => {} });

test('the finder ranks names that start with the query first', () => {
  const items = [
    item('Entry', 'Oaklynn Rhye-Cross', 'People'),
    item('Entry', 'Cerys Cross', 'People', ['Cerys']),
    item('Board', 'Cerys Cross Chronicles', 'Series'),
    item('Chapter', 'The Crossing', 'The Wreckage'),
  ];
  assert.deepEqual(find(items, 'cerys').map((i) => i.name), ['Cerys Cross', 'Cerys Cross Chronicles']);
  assert.deepEqual(find(items, 'cross').map((i) => i.name), ['Cerys Cross', 'Oaklynn Rhye-Cross', 'Cerys Cross Chronicles', 'The Crossing']);
  // Every word must match, and the detail counts.
  assert.deepEqual(find(items, 'crossing wreck').map((i) => i.name), ['The Crossing']);
  assert.deepEqual(find(items, 'people oak').map((i) => i.name), ['Oaklynn Rhye-Cross']);
  // Accents and capitals do not matter.
  assert.equal(find([item('Entry', 'Kigyō Shakai')], 'kigyo')[0].name, 'Kigyō Shakai');
  assert.deepEqual(find(items, '   '), []);
});
