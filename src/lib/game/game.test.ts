import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { readElement, readKind, writeElement, writeKind, newElement, type Kind } from './elements.ts';
import { bookTree, chapterItems, effective, gameFileWith, inPlay, loadGame, pictureOf, withBody } from './game.ts';

const gear: Kind = {
  id: 'gear',
  name: 'Gear',
  plural: 'Gear',
  fields: [
    { key: 'availability', label: 'Availability', type: 'line' },
    { key: 'rules', label: 'Rules', type: 'list' },
    { key: 'burned', label: 'Burned', type: 'text' },
  ],
  layout: ['availability', 'flavor', 'rules', 'burned'],
  about: 'What a protagonist carries.',
};

test('an element reads and writes its structured fields, with the flavor as its body', () => {
  const source = writeElement(
    { path: 'elements/gear/salt-knife.md', id: 'salt-knife', name: 'Salt Knife', kind: 'gear', tags: ['harbor', 'gear', 'weapon'], vendor: 'the-chandler', reskins: '', fields: { burned: 'Rusted through.', availability: '2', rules: ['**Weapon** *(clears no trouble)*.'] }, flavor: 'A dock knife with a cork grip.' },
    gear,
  );
  assert.match(source, /^---\nname: Salt Knife\nkind: gear\ntags: \[ harbor, gear, weapon \]\nvendor: the-chandler\navailability: "2"\nrules:\n {2}- "\*\*Weapon\*\*/);
  const back = readElement('elements/gear/salt-knife.md', source);
  assert.equal(back.name, 'Salt Knife');
  assert.deepEqual(back.tags, ['harbor', 'gear', 'weapon']);
  assert.equal(back.fields.availability, '2');
  assert.deepEqual(back.fields.rules, ['**Weapon** *(clears no trouble)*.']);
  assert.equal(back.flavor, 'A dock knife with a cork grip.');
});

test('a kind reads and writes its shape', () => {
  const back = readKind('gear', writeKind(gear));
  assert.deepEqual(back, gear);
});

test('a new element gets a free file name in its kind', () => {
  const e = newElement('Salt Knife', gear, new Set(['gear/salt-knife']));
  assert.equal(e.path, 'elements/gear/salt-knife-2.md');
});

test('a game is the core elements plus the world, minus what the world sets aside or reskins', async () => {
  const engine = new MemoryFs({
    'engine.md': '# Example Engine\n',
    'kinds/gear.md': writeKind(gear),
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\ntags: [core, gear]\navailability: "1"\n---\n\nRope.\n',
    'elements/gear/lantern.md': '---\nname: Lantern\nkind: gear\ntags: [core, gear]\navailability: "1"\nburned: Shattered.\n---\n\nA lantern.\n',
  });
  const world = new MemoryFs({
    'world.md': '---\nname: Harrowgate\nengine: example-engine\n---\n',
    'game/game.md': gameFileWith(null, ['gear/rope']),
    'game/kinds/charm.md': '---\nname: Charm\nfields: []\n---\n',
    'game/elements/gear/storm-lamp.md': '---\nname: Storm Lamp\nkind: gear\ntags: [harbor, gear]\nreskins: gear/lantern\n---\n\nA lamp for the narrows.\n',
  });
  const game = await loadGame({ origin: 'engine', name: 'Example Engine', fs: engine, dir: '' }, { origin: 'world', name: 'Harrowgate', fs: world, dir: 'game' });
  assert.deepEqual([...game.kinds.keys()], ['gear', 'charm']);
  const by = (name: string) => game.elements.find((p) => p.element.name === name)!;
  assert.equal(by('Rope').setAside, true);
  assert.equal(inPlay(by('Lantern')), false, 'a reskinned core element leaves play');
  const lamp = effective(by('Storm Lamp'));
  assert.equal(lamp.name, 'Storm Lamp');
  assert.equal(lamp.flavor, 'A lamp for the narrows.');
  assert.equal(lamp.fields.burned, 'Shattered.', 'mechanics come from the core element');
  assert.match(gameFileWith(await world.readText('game/game.md'), []), /^# Game/);
});

test('a book lists its chapters, and a world piece is found by the module it extends', async () => {
  const engine = new MemoryFs({
    'engine.md': '# Example Engine\n',
    'book.md': '---\nname: Example Engine\nchapters:\n  - engine:chapter/rolling\n---\n',
    'elements/chapter/rolling.md': '---\nname: Rolling\nkind: chapter\ntags: [ core, chapter ]\nitems:\n  - engine:module/the-edge\n---\n\nHow a roll works.\n',
    'elements/module/the-edge.md': '---\nname: The Edge\nkind: module\ntags: [ core, module ]\n---\n\nYour edge starts at 7.\n',
  });
  const world = new MemoryFs({
    'world.md': '---\nname: Harrowgate\n---\n',
    'game/book.md': '---\nname: Harrowgate\nchapters:\n  - engine:chapter/rolling\n  - world:chapter/the-harbor\n---\n',
    'game/elements/add-on/the-edge.md': '---\nname: The Edge\nkind: add-on\ntags: [ harbor, add-on ]\nextends: module/the-edge\n---\n\n*Wren climbs the pier.*\n',
  });
  const game = await loadGame({ origin: 'engine', name: 'Example Engine', fs: engine, dir: '' }, { origin: 'world', name: 'Harrowgate', fs: world, dir: 'game' });
  assert.deepEqual(game.books.engine?.chapters, ['engine:chapter/rolling']);
  assert.deepEqual(game.books.world?.chapters, ['engine:chapter/rolling', 'world:chapter/the-harbor']);
  assert.equal(game.addOns.get('module/the-edge')?.element.flavor, '*Wren climbs the pier.*');
});

test('a chapter resolves its items, reading a bare reference in its own folder', async () => {
  const engine = new MemoryFs({
    'engine.md': '# Example Engine\n',
    'elements/chapter/rolling.md': '---\nname: Rolling\nkind: chapter\ntags: [ core, chapter ]\nitems:\n  - module/the-edge\n  - "heading: Tools"\n  - engine:gear/rope\n  - module/gone\n---\n',
    'elements/module/the-edge.md': '---\nname: The Edge\nkind: module\ntags: [ core, module ]\n---\n\nYour edge starts at 7.\n',
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\ntags: [ core, gear ]\n---\n',
  });
  const world = new MemoryFs({
    'world.md': '---\nname: Harrowgate\n---\n',
    'game/elements/add-on/the-edge.md': '---\nname: The Edge\nkind: add-on\ntags: [ add-on ]\nextends: module/the-edge\n---\n\n*Wren climbs the pier.*\n',
  });
  const game = await loadGame({ origin: 'engine', name: 'Example Engine', fs: engine, dir: '' }, { origin: 'world', name: 'Harrowgate', fs: world, dir: 'game' });
  const byKey = new Map(game.elements.map((p) => [p.key, p]));
  const chapter = byKey.get('engine:chapter/rolling')!;
  const items = chapterItems(game, chapter, byKey);
  assert.deepEqual(
    items.map((i) => (i.type === 'heading' ? `heading ${i.text}` : i.type === 'missing' ? `missing ${i.ref}` : i.type === 'module' ? `module ${i.placed.element.name} ${i.hasWorldPiece}` : `element ${i.placed.element.name}`)),
    ['module The Edge true', 'heading Tools', 'element Rope', 'missing module/gone'],
  );
});

test('a book is a tree of divisions, sections, and rules, and the base game leaves out the world', async () => {
  const engine = new MemoryFs({
    'engine.md': '# Example Engine\n',
    'kinds/gear.md': '---\nname: Gear\n---\n',
    'book.md': '---\nname: Example Engine\ndivisions: [ division/the-protagonist ]\n---\n\nThe base game.\n',
    'elements/division/the-protagonist.md': '---\nname: The Protagonist\nkind: division\nsections: [ chapter/rolling ]\n---\n',
    'elements/chapter/rolling.md': '---\nname: Rolling\nkind: chapter\nitems:\n  - module/the-edge\n  - "heading: Gear"\n  - gear/rope\n---\n',
    'elements/module/the-edge.md': '---\nname: The Edge\nkind: module\n---\n\nYour edge starts at 7.\n',
    'elements/module/the-edge.png': 'picture',
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\n---\n',
  });
  const world = new MemoryFs({
    'world.md': '---\nname: Harrowgate\n---\n',
    'game/book.md': '---\nname: Harrowgate\nfront_matter: [ chapter/front ]\ndivisions:\n  - division/the-protagonist\n  - division/the-aspects\n---\n\nSalt and fog.\n',
    'game/elements/chapter/front.md': '---\nname: Front Matter\nkind: chapter\nitems: [ engine:module/the-edge ]\n---\n',
    'game/book.jpg': 'picture',
    'game/elements/division/the-protagonist.md': '---\nname: The Protagonist\nkind: division\nsections:\n  - engine:chapter/rolling\n  - chapter/the-tides\n---\n',
    'game/elements/division/the-aspects.md': '---\nname: The Aspects\nkind: division\ncatalog: [ gear, need ]\n---\n',
    'game/elements/chapter/the-tides.md': '---\nname: The Tides\nkind: chapter\nitems: [ module/low-water ]\n---\n',
    'game/elements/module/low-water.md': '---\nname: Low Water\nkind: module\n---\n',
    'game/elements/add-on/the-edge.md': '---\nname: The Edge\nkind: add-on\nextends: module/the-edge\n---\n\n*Wren climbs the pier.*\n',
    'game/elements/add-on/the-edge.webp': 'picture',
    'game/elements/gear/salt-knife.md': '---\nname: Salt Knife\nkind: gear\n---\n',
  });
  const game = await loadGame({ origin: 'engine', name: 'Example Engine', fs: engine, dir: '' }, { origin: 'world', name: 'Harrowgate', fs: world, dir: 'game' });

  const mine = bookTree(game, 'world')!;
  assert.equal(mine.book.body, 'Salt and fog.');
  assert.equal(mine.book.image, 'book.jpg');
  assert.deepEqual(mine.divisions.map((d) => d.placed.element.name), ['The Protagonist', 'The Aspects']);
  // The front matter is a world's own section that can print core pages with the world's piece.
  const page = mine.front[0].items[0];
  assert.equal(page.type === 'rule' && page.worldPiece?.element.flavor, '*Wren climbs the pier.*');
  assert.deepEqual(mine.back, []);
  const [rolling, tides] = mine.divisions[0].sections;
  const edge = rolling.items[0];
  assert.equal(edge.type === 'rule' && edge.worldPiece?.element.flavor, '*Wren climbs the pier.*');
  assert.deepEqual(rolling.items.map((i) => i.type), ['rule', 'heading']);
  assert.deepEqual(rolling.elements.map((p) => p.element.name), ['Rope']);
  assert.equal(tides.items.length, 1);
  assert.deepEqual(mine.divisions[1].catalog.map((c) => [c.kind.id, c.elements.map((p) => p.element.name)]), [['gear', ['Rope', 'Salt Knife']]]);
  // In the world's book, the world's own picture shows; in the base game, the core one.
  const rule = edge.type === 'rule' ? edge.placed : null;
  assert.equal(pictureOf(game, rule!, true)?.path, 'elements/add-on/the-edge.webp');
  assert.equal(pictureOf(game, rule!, false)?.path, 'elements/module/the-edge.png');

  const base = bookTree(game, 'engine')!;
  assert.equal(base.divisions[0].sections.length, 1);
  const baseEdge = base.divisions[0].sections[0].items[0];
  assert.equal(baseEdge.type === 'rule' && baseEdge.worldPiece, null);
});

test('a new body keeps the header exactly', () => {
  assert.equal(withBody('---\nname: Book\ndivisions: [ a ]\n---\n\nOld.\n', 'New text.'), '---\nname: Book\ndivisions: [ a ]\n---\n\nNew text.\n');
  assert.equal(withBody('---\nname: Book\n---\n', ''), '---\nname: Book\n---\n');
  assert.equal(withBody('Plain.\n', 'Other.'), 'Other.\n');
});

test('an expansion adds elements and pieces, and the book shows them only in the world', async () => {
  const engine = new MemoryFs({
    'engine.md': '# Example Engine\n',
    'kinds/gear.md': '---\nname: Gear\n---\n',
    'book.md': '---\nname: Example Engine\ndivisions: [ division/aspects ]\n---\n',
    'elements/division/aspects.md': '---\nname: The Aspects\nkind: division\ncatalog: [ gear ]\n---\n',
    'elements/module/the-edge.md': '---\nname: The Edge\nkind: module\n---\n\nYour edge starts at 7.\n',
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\n---\n',
  });
  const world = new MemoryFs({
    'world.md': '---\nname: Harrowgate\n---\n',
    'game/book.md': '---\nname: Harrowgate\ndivisions: [ division/aspects, division/rules ]\n---\n',
    'game/elements/division/aspects.md': '---\nname: The Aspects\nkind: division\ncatalog: [ gear ]\n---\n',
    'game/elements/division/rules.md': '---\nname: Rules\nkind: division\nsections: [ chapter/tides ]\n---\n',
    'game/elements/chapter/tides.md': '---\nname: Tides\nkind: chapter\nitems: [ engine:module/the-edge, module/low-water ]\n---\n',
    'game/elements/module/low-water.md': '---\nname: Low Water\nkind: module\n---\n',
    'game/expansions/fogbound/expansion.md': '---\nname: Fogbound\n---\n\nThe smugglers of the outer banks.\n',
    'game/expansions/fogbound/elements/gear/rope.md': '---\nname: Tarred Rope\nkind: gear\n---\n',
    'game/expansions/fogbound/elements/add-on/the-edge.md': '---\nname: The Edge\nkind: add-on\nextends: module/the-edge\n---\n\n*In fog, the edge starts at 6.*\n',
    'game/expansions/fogbound/elements/add-on/low-water-world.md': '---\nname: Low Water\nkind: add-on\nextends: world:module/low-water\n---\n\nSmugglers land at low water.\n',
    'game/expansions/world/expansion.md': '---\nname: Not Allowed\n---\n',
  });
  const game = await loadGame({ origin: 'engine', name: 'Example Engine', fs: engine, dir: '' }, { origin: 'world', name: 'Harrowgate', fs: world, dir: 'game' });
  assert.deepEqual(game.expansions.map((x) => [x.origin, x.name, x.about]), [['fogbound', 'Fogbound', 'The smugglers of the outer banks.']]);
  assert.ok(game.elements.some((p) => p.key === 'fogbound:gear/rope'));

  const mine = bookTree(game, 'world')!;
  assert.deepEqual(mine.divisions[0].catalog[0].elements.map((p) => p.key), ['engine:gear/rope', 'fogbound:gear/rope']);
  const [edge, low] = mine.divisions[1].sections[0].items;
  assert.equal(edge.type === 'rule' && edge.expansionPieces[0].element.flavor, '*In fog, the edge starts at 6.*');
  assert.equal(low.type === 'rule' && low.expansionPieces[0].element.flavor, 'Smugglers land at low water.');

  const base = bookTree(game, 'engine')!;
  assert.deepEqual(base.divisions[0].catalog[0].elements.map((p) => p.key), ['engine:gear/rope']);
});

