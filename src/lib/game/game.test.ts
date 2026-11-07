import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { readElement, readKind, writeElement, writeKind, newElement, type Kind } from './elements.ts';
import { effective, gameFileWith, inPlay, loadGame } from './game.ts';

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
