import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameScanner } from './links.ts';

const elements = [
  { key: 'engine/rules/trouble', name: 'Trouble', kind: 'rule', origin: 'engine' },
  { key: 'world/aspects/salt-debt', name: 'Salt Debt', kind: 'aspect', origin: 'world' },
  { key: 'world/add-ons/trouble', name: 'Trouble', kind: 'add-on', origin: 'world' },
  { key: 'engine/rules/wren', name: 'Wren', kind: 'rule', origin: 'engine' },
];
const world = [{ id: 'wiki/people/wren.md', name: 'Marta "Wren" Okafor', aliases: ['Wren'] }];
const ids = (s: ReturnType<typeof gameScanner>, text: string) => s.find(text).map((m) => m.id);

test("a world's game text links game terms and the world's names", () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'Wren rolls for Trouble and takes on a Salt Debt.'), ['wiki/people/wren.md', 'game:engine/rules/trouble', 'game:world/aspects/salt-debt']);
});

test('a capitalized term does not catch the ordinary word', () => {
  assert.deepEqual(ids(gameScanner(elements, world, 'world'), 'There was trouble at the docks.'), []);
});

test("the engine's text links only the engine's own terms", () => {
  const s = gameScanner(elements, world, 'engine');
  assert.deepEqual(ids(s, 'Wren rolls for Trouble and takes on a Salt Debt.'), ['game:engine/rules/wren', 'game:engine/rules/trouble']);
});
