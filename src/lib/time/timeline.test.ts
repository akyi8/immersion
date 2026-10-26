import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from './timeline.ts';
import { parseWhen } from './when.ts';

const entry = (name: string, when: string | null, era = false) => ({
  id: `wiki/history/${name}.md`,
  name,
  aliases: [],
  category: 'history',
  body: '',
  summary: '',
  imagePath: null,
  when: parseWhen(when),
  era,
});

test('events sort into moments and eras band over them', () => {
  const t = buildTimeline([
    entry('The Big One', '2057'),
    entry('The Founding', 'c. 1781'),
    entry('The Riots', '2057'),
    entry('The Gen X Years', '2045 to 2060', true),
    entry('The Long Dark', '2050 to 2070', true),
    entry('Undated', null),
  ]);
  assert.deepEqual(
    t.moments.map((m) => [m.label, m.events.map((e) => e.name)]),
    [
      ['c. 1781', ['The Founding']],
      ['2045', []],
      ['2050', []],
      ['2057', ['The Big One', 'The Riots']],
    ],
  );
  assert.deepEqual(
    t.eras.map((b) => [b.era.name, b.from, b.to, b.lane]),
    [
      ['The Gen X Years', 1, 3, 0],
      ['The Long Dark', 2, 3, 1],
    ],
  );
  assert.equal(t.lanes, 2);
});
