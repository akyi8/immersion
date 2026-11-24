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
const world = [{ id: 'wiki/people/wren.md', name: 'Marta "Wren" Okafor', aliases: ['Wren', 'Marta'] }];
const ids = (s: ReturnType<typeof gameScanner>, text: string) => s.find(text).map((m) => m.id);

test("a world's game text links game terms and the world's names", () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'Marta rolls for Trouble and takes on a Salt Debt.'), ['wiki/people/wren.md', 'game:engine:keyword/trouble', 'game:world:gear/salt-debt']);
});

test('a mechanic links however it is written, singular or plural', () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'There was trouble at the docks, and more Troubles after.'), ['game:engine:keyword/trouble', 'game:engine:keyword/trouble']);
  assert.deepEqual(ids(s, 'Trouble follows. TROUBLE always does.'), ['game:engine:keyword/trouble', 'game:engine:keyword/trouble']);
});

test('an aspect links where it is written with its capital, singular or plural', () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'She carried two Salt Debts, and no salt debt was forgiven.'), ['game:world:gear/salt-debt']);
  assert.deepEqual(ids(s, 'It tells you who is lying, if you have a Tell.'), ['game:world:gear/tell']);
});

test('a one-word aspect that opens a sentence is an ordinary word, unless it is marked', () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'Tell me who did it.'), []);
  assert.deepEqual(ids(s, '- Tell the narrator first.'), []);
  assert.deepEqual(ids(s, '**Tell.** A device that reads faces.'), ['game:world:gear/tell']);
  assert.deepEqual(ids(s, 'Salt Debt is owed to the Chandler.'), ['game:world:gear/salt-debt']);
});

test('the label decides: a keyword by its tag, and an aspect label wins', () => {
  const labelled = [
    { key: 'world:condition/burned', name: 'Burned', kind: 'condition', origin: 'world', tags: ['harbor', 'keyword'] },
    { key: 'world:keyword/read', name: 'Read', kind: 'keyword', origin: 'world', tags: ['keyword', 'aspect'] },
    { key: 'world:keyword/property', name: 'Property', kind: 'keyword', origin: 'world', tags: ['keyword'] },
  ];
  const s = gameScanner(labelled, [], 'world');
  assert.deepEqual(ids(s, 'Every aspect is either lit or burned.'), ['game:world:condition/burned']);
  assert.deepEqual(ids(s, 'You read the room, and spend a Read.'), ['game:world:keyword/read']);
  assert.deepEqual(ids(s, 'Two properties and one property.'), ['game:world:keyword/property', 'game:world:keyword/property']);
});

test('the names of divisions, sections, and rules never link', () => {
  const s = gameScanner(elements, world, 'world');
  assert.deepEqual(ids(s, 'See Taking Risks, in The Harbor.'), []);
});

test('in game text a word that is both a game term and a wiki name is the game term', () => {
  assert.deepEqual(ids(gameScanner(elements, world, 'world'), 'Then Wren waited.'), ['game:engine:keyword/wren']);
  // A person called Art, and a keyword called Art: "Arts" in a rule is the keyword, in any case.
  const art = [{ key: 'engine:keyword/art', name: 'Art', kind: 'keyword', origin: 'engine' }];
  const people = [{ id: 'wiki/people/art.md', name: 'Arthur Vane', aliases: ['Art'] }];
  const s = gameScanner(art, people, 'world');
  assert.deepEqual(ids(s, 'The Arts are learned slowly, and an art is kept. Arthur Vane knows two.'), ['game:engine:keyword/art', 'game:engine:keyword/art', 'wiki/people/art.md']);
});

test("the engine's text links only the engine's own terms", () => {
  const s = gameScanner(elements, world, 'engine');
  assert.deepEqual(ids(s, 'Then Wren rolls for Trouble and takes on a Salt Debt.'), ['game:engine:keyword/wren', 'game:engine:keyword/trouble']);
});

test('a wiki name links in its plural, and a name ending in s is left alone', () => {
  const s = gameScanner([], [{ id: 'w/lamp.md', name: 'Storm Lamp', aliases: [] }, { id: 'w/reyes.md', name: 'Tomas Reyes', aliases: [] }], 'world');
  assert.deepEqual(ids(s, 'Two Storm Lamps for Tomas Reyes, and none for the Reyeses.'), ['w/lamp.md', 'w/reyes.md']);
});
