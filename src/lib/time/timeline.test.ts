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

test('eras that hand off share their boundary year with the era that begins in it', () => {
  // Sin Angeles' generations, which chain end to start (Mike, October 31).
  const t = buildTimeline([
    entry('Boomer', '1985 to 2000', true),
    entry('Gen X', '2000 to 2015', true),
    entry('Gen Y', '2015 to 2030', true),
    entry('Y2K', '2000'),
    entry('Late', '1999'),
  ]);
  const at = (name: string) => t.eras.find((b) => b.era.name === name)!;
  const label = (i: number) => t.moments[i].label;
  assert.deepEqual([label(at('Boomer').from), label(at('Boomer').to)], ['1985 to 2000'.split(' to ')[0], '1999']);
  assert.deepEqual([label(at('Gen X').from), label(at('Gen X').to)], ['2000', '2000']);
  assert.equal(label(at('Gen Y').from), '2015');
  // Bands that hand off fit in one lane.
  assert.equal(t.lanes, 1);
  // A war with nothing after it keeps the events of its last year.
  const war = buildTimeline([entry('The Great War', '1914 to 1918', true), entry('Armistice', '11 November 1918')]);
  assert.equal(war.moments[war.eras[0].to].label, '11 November 1918');
});
