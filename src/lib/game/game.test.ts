import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { readElement, readKind, writeElement, writeKind, newElement, type Kind } from './elements.ts';
import { bookTree, chapterItems, effective, gameFileWith, inPlay, loadGame, pictureOf, withBody, readBook } from './game.ts';

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

test("a book lists its chapters, and a world's add-on is found by the rule it extends", async () => {
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
  // The front matter is a world's own section that can print core pages with what the world adds after each.
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

test('an expansion adds elements of its own and never a piece of a rule, and the book shows them only in the world', async () => {
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
  // An add-on left in an expansion's folder from before is read as a file and adds nothing to the rule.
  const [edge, low] = mine.divisions[1].sections[0].items;
  assert.equal(edge.type === 'rule' && edge.worldPiece, null);
  assert.equal(low.type === 'rule' && low.worldPiece, null);

  const base = bookTree(game, 'engine')!;
  assert.deepEqual(base.divisions[0].catalog[0].elements.map((p) => p.key), ['engine:gear/rope']);
});


test("a book's title page is read from its header", () => {
  const book = readBook('---\nname: Harrowgate\nsubtitle: A game of salt and fog\nprofile: wren-okafor\nyear: 2026\n---\n\nOld front page text.\n');
  assert.equal(book?.subtitle, 'A game of salt and fog');
  assert.equal(book?.profile, 'wren-okafor');
  assert.equal(book?.year, 2026);
  assert.equal(book?.author, '');
  assert.equal(book?.body, 'Old front page text.');
  assert.equal(readBook('---\nname: Bare\n---\n')?.year, null);
});

test('an element file saved on Windows reads without an empty first line', async () => {
  const { readElement } = await import('./elements.ts');
  const e = readElement('elements/origin/average.md', '---\r\nname: Average\r\nkind: origin\r\noffers: Choose two.\r\n---\r\n\r\nThe vast middle.\r\nNot starving.\r\n');
  assert.equal(e.name, 'Average');
  assert.equal(e.fields.offers, 'Choose two.');
  assert.equal(e.flavor, 'The vast middle.\nNot starving.');
});

test("a new world's book is laid out over its engine's", async () => {
  const { bookOver } = await import('./game.ts');
  const engine = new MemoryFs({
    'engine.md': '# Example Engine\n',
    'kinds/gear.md': '---\nname: Gear\n---\n',
    'kinds/division.md': '---\nname: Division\n---\n',
    'kinds/chapter.md': '---\nname: Chapter\n---\n',
    'kinds/module.md': '---\nname: Module\n---\n',
    'book.md': '---\nname: Example Engine\nfront_matter: [ chapter/front-matter ]\ndivisions: [ division/the-protagonist, division/the-aspects ]\n---\n',
    'elements/chapter/front-matter.md': '---\nname: Front Matter\nkind: chapter\nitems: [ module/safety ]\n---\n',
    'elements/module/safety.md': '---\nname: Safety\nkind: module\n---\n\nTalk first.\n',
    'elements/division/the-protagonist.md': '---\nname: The Protagonist\nkind: division\nsections: [ chapter/taking-risks ]\n---\n\nWho you play.\n',
    'elements/division/the-aspects.md': '---\nname: The Aspects\nkind: division\ncatalog: [ gear ]\n---\n',
    'elements/chapter/taking-risks.md': '---\nname: Taking Risks\nkind: chapter\nitems: [ module/when-to-roll ]\n---\n',
    'elements/module/when-to-roll.md': '---\nname: When to Roll\nkind: module\n---\n\nRoll when it matters.\n',
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\n---\n',
  });
  const world = new MemoryFs({ 'world.md': '---\nname: Low Tide\n---\n' });
  const open = () => loadGame({ origin: 'engine', name: 'Example Engine', fs: engine, dir: '' }, { origin: 'world', name: 'Low Tide', fs: world, dir: 'game' });
  const before = await open();
  assert.equal(before.books.world, null);
  for (const f of bookOver(before, 'Low Tide')) await world.writeText(`game/${f.path}`, f.text);

  const mine = bookTree(await open(), 'world')!;
  assert.equal(mine.book.name, 'Low Tide');
  assert.deepEqual(mine.front.map((s) => [s.placed.key, s.items.map((i) => i.type === 'rule' && i.placed.key)]), [['world:chapter/front-matter', ['engine:module/safety']]]);
  assert.deepEqual(mine.divisions.map((d) => [d.placed.key, d.placed.element.flavor]), [['world:division/the-protagonist', 'Who you play.'], ['world:division/the-aspects', '']]);
  // The engine's section and its rule show in the world's division, still the engine's own.
  const section = mine.divisions[0].sections[0];
  assert.equal(section.placed.key, 'engine:chapter/taking-risks');
  assert.deepEqual(section.items.map((i) => i.type === 'rule' && i.placed.key), ['engine:module/when-to-roll']);
  assert.deepEqual(mine.divisions[1].catalog[0].elements.map((p) => p.key), ['engine:gear/rope']);
  // Nothing in the engine changed.
  assert.equal(await engine.exists('elements/division/the-protagonist.md'), true);
  assert.match(await engine.readText('book.md'), /name: Example Engine/);
});

// Code review, November 21 (D3): a game page wrote its whole element back from memory.
test("a page's save writes only what it changed, onto the file as it stands on disk", async () => {
  const { readElement, withChanges } = await import('./elements.ts');
  const { merge3 } = await import('../editor/merge.ts');
  const path = 'elements/gear/rope.md';
  const first = '---\nname: Rope\nkind: gear\ntags: [ core, gear ]\n# a note for whoever edits this by hand\ncost: 40\nconcealable: true\nstats:\n  weight: 2\nrules:\n  - "Holds a climber."\n---\n\nFifty feet of it.\n\nTarred against the salt.\n';
  const base = readElement(path, first);

  // Another computer renamed it and changed its cost while this page was open.
  const onDisk = first.replace('name: Rope', 'name: Tarred Rope').replace('cost: 40', 'cost: 55').replace('Fifty feet of it.', 'Sixty feet of it.');
  // This page changed one rule and the second paragraph.
  const mine = { ...base, fields: { ...base.fields, rules: ['Holds two climbers.'] }, flavor: 'Fifty feet of it.\n\nTarred against the fog.' };
  const out = withChanges(onDisk, base, mine, merge3);

  assert.match(out, /name: Tarred Rope/, 'the rename from elsewhere is kept');
  assert.match(out, /cost: 55/, 'a number changed elsewhere is kept, and stays a number');
  assert.match(out, /concealable: true/, 'a key the page does not know is kept');
  assert.match(out, /stats:\n {2}weight: 2/, 'a nested key is kept');
  assert.match(out, /# a note for whoever edits this by hand/, 'a comment is kept');
  assert.match(out, /Holds two climbers\./, "the page's own change is written");
  assert.match(out, /Sixty feet of it\.\n\nTarred against the fog\./, 'both changes to the body are joined');

  // Nothing changed: nothing is rewritten.
  assert.equal(withChanges(onDisk, base, base, merge3), onDisk);
  // A field emptied on the page leaves the file.
  assert.doesNotMatch(withChanges(first, base, { ...base, fields: { ...base.fields, rules: [] } }, merge3), /rules:/);
});

test('a header that cannot be read stops the save, and the file keeps every key', async () => {
  const { readElement, withChanges } = await import('./elements.ts');
  const { merge3 } = await import('../editor/merge.ts');
  const path = 'elements/gear/blade.md';
  const good = '---\nname: Blade\nkind: gear\ncost: "3"\n---\n\nSharp.\n';
  const base = readElement(path, good);
  // Someone typed a colon into a value by hand, which breaks the header.
  const broken = '---\nname: Blade\nkind: gear\ncost: "3"\neffect: Roll: 2d6\n---\n\nSharp.\n';
  assert.throws(() => withChanges(broken, base, { ...base, name: 'Long Blade' }, merge3), /cannot be read/);
  // A change to the body alone does not touch the header, so it is still saved.
  assert.match(withChanges(broken, base, { ...base, flavor: 'Very sharp.' }, merge3), /effect: Roll: 2d6\n---\n\nVery sharp\./);
});
