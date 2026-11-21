import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameScanner } from './links.ts';

const elements = [
  { key: 'engine:keyword/trouble', name: 'Trouble', kind: 'keyword', origin: 'engine' },
  { key: 'world:gear/salt-debt', name: 'Salt Debt', kind: 'gear', origin: 'world' },
  { key: 'world:gear/tell', name: 'Tell', kind: 'gear', origin: 'world' },
  { key: 'engine:module/taking-risks', name: 'Taking Risks', kind: 'module', origin: 'engine' },
  { key: 'world:division/the-harbor', name: 'The Harbor', kind: 'division', origin: 'world' },
  { key: 'world:add-on/trouble', name: 'Trouble', kind: 'add-on', origin: 'world' },
  { key: 'engine:keyword/wren', name: 'Wren', kind: 'keyword', origin: 'engine' },
];
const world = [{ id: 'wiki/people/wren.md', name: 'Marta "Wren" Okafor', aliases: ['Wren'] }];
const ids = (s: ReturnType<typeof gameScanner>, text: string) => s.find(text).map((m) => m.id);

test("a world's game text links game terms and the world's names", () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'Wren rolls for Trouble and takes on a Salt Debt.'), ['wiki/people/wren.md', 'game:engine:keyword/trouble', 'game:world:gear/salt-debt']);
});

test('a game term links where it is written with its capital, singular or plural', () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'There was trouble at the docks, and more troubles after.'), []);
  assert.deepEqual(ids(s, 'She took a Trouble, then two Troubles, and carried two Salt Debts.'), ['game:engine:keyword/trouble', 'game:engine:keyword/trouble', 'game:world:gear/salt-debt']);
  assert.deepEqual(ids(s, 'It tells you who is lying, if you have a Tell.'), ['game:world:gear/tell']);
});

test('a one-word term that opens a sentence is an ordinary word, unless it is marked', () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'Tell me who did it. Trouble follows.'), []);
  assert.deepEqual(ids(s, '- Tell the narrator first.'), []);
  assert.deepEqual(ids(s, '**Tell.** A device that reads faces. *Trouble* is the cost.'), ['game:world:gear/tell', 'game:engine:keyword/trouble']);
  assert.deepEqual(ids(s, 'Salt Debt is owed to the Chandler.'), ['game:world:gear/salt-debt']);
});

test('the names of divisions, sections, and rules never link', () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'See Taking Risks, in The Harbor.'), []);
});

test("a world's name wins over a game term of the same name", () => {
  assert.deepEqual(ids(gameScanner(elements, world, 'world'), 'Then Wren waited.'), ['wiki/people/wren.md']);
});

test("the engine's text links only the engine's own terms", () => {
  const s = gameScanner(elements, world, 'engine');
  assert.deepEqual(ids(s, 'Then Wren rolls for Trouble and takes on a Salt Debt.'), ['game:engine:keyword/wren', 'game:engine:keyword/trouble']);
});
