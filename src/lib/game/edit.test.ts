import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { merge3 } from '../editor/merge.ts';
import { bookTree, loadGame, type Game, type Placed } from './game.ts';
import type { Element } from './elements.ts';
import { addElement, archiveElement, makeWorldTwin, placeRule, placeSection, saveElement, type Save } from './edit.ts';

const kindFile = (name: string) => `---\nname: ${name}\nfields: []\n---\n`;
const el = (kind: string, name: string, more = '', body = '') => `---\nname: ${name}\nkind: ${kind}\ntags: [ ${kind} ]\n${more}---\n${body ? `\n${body}\n` : ''}`;

/** A small base game and a world built on it, as files. */
function files() {
  const engine = new MemoryFs({
    'engine.md': '# Example Engine\n',
    'kinds/division.md': kindFile('Division'),
    'kinds/chapter.md': kindFile('Section'),
    'kinds/module.md': kindFile('Rule'),
    'kinds/keyword.md': kindFile('Keyword'),
    'book.md': '---\nname: Example Engine\nfront_matter: [ chapter/front-matter ]\ndivisions: [ division/the-protagonist ]\n---\n',
    'elements/chapter/front-matter.md': el('chapter', 'Front Matter', 'items: [ module/notice ]\n'),
    'elements/module/notice.md': el('module', 'Notice', '', 'All rights reserved.'),
    'elements/division/the-protagonist.md': el('division', 'The Protagonist', 'sections: [ chapter/risks, chapter/gear ]\n'),
    'elements/chapter/risks.md': el('chapter', 'Risks', 'items: [ module/when-to-roll, module/reading-the-dice ]\n'),
    'elements/chapter/gear.md': el('chapter', 'Gear', 'items: [ module/carrying ]\n'),
    'elements/module/when-to-roll.md': el('module', 'When to Roll', 'house_note: keep me\n', 'Roll when failing would be interesting.'),
    'elements/module/reading-the-dice.md': el('module', 'Reading the Dice', '', 'Count each die below your edge.'),
    'elements/module/carrying.md': el('module', 'Carrying', '', 'You carry what you can lift.'),
  });
  const world = new MemoryFs({
    'world.md': '---\nname: Harrowgate\n---\n',
    'game/book.md': '---\nname: Harrowgate\ndivisions: [ division/the-protagonist ]\n---\n',
    'game/elements/division/the-protagonist.md': el('division', 'The Protagonist', 'sections: [ "engine:chapter/risks", "world:chapter/tides", "engine:chapter/gear" ]\n'),
    'game/elements/chapter/tides.md': el('chapter', 'The Tides', 'items: [ module/low-water ]\n'),
    'game/elements/module/low-water.md': el('module', 'Low Water'),
  });
  return { engine, world };
}
const open = (f: ReturnType<typeof files>) => loadGame({ origin: 'engine', name: 'Example Engine', fs: f.engine, dir: '' }, { origin: 'world', name: 'Harrowgate', fs: f.world, dir: 'game' });
const at = (game: Game, key: string): Placed => game.elements.find((p) => p.key === key)!;
/** Saves the way the screen does, and keeps the game in step with the file. */
const saver = (game: Game): Save => async (p, next) => {
  p.element = await saveElement(game, p, next, p.element, merge3);
};

test('a save writes only what changed and keeps a line the app does not know', async () => {
  const f = files();
  const game = await open(f);
  const rule = at(game, 'engine:module/when-to-roll');
  const next: Element = { ...rule.element, name: 'When You Roll' };
  await saveElement(game, rule, next, rule.element, merge3);
  const text = await f.engine.readText('elements/module/when-to-roll.md');
  assert.match(text, /name: When You Roll/);
  assert.match(text, /house_note: keep me/);
  assert.match(text, /Roll when failing would be interesting\./);
});

test('a new element for the base game is a core element in the engine, and one for the world is the world\'s', async () => {
  const f = files();
  const game = await open(f);
  assert.equal(await addElement(game, 'engine', 'keyword', 'Lit'), 'engine:keyword/lit');
  assert.match(await f.engine.readText('elements/keyword/lit.md'), /tags: \[ core, keyword \]/);
  assert.equal(await addElement(game, 'world', 'keyword', 'Tide-Bound'), 'world:keyword/tide-bound');
  assert.match(await f.world.readText('game/elements/keyword/tide-bound.md'), /tags: \[ keyword \]/);
  await assert.rejects(addElement(game, 'world', 'gadget', 'Thing'), /no gadget kind/);
});

test('a rule moves to another section, to the place asked for', async () => {
  const f = files();
  const game = await open(f);
  await placeRule(at(game, 'engine:chapter/risks'), at(game, 'engine:chapter/gear'), 'engine:module/reading-the-dice', 'engine:module/carrying', saver(game));
  assert.deepEqual(at(game, 'engine:chapter/risks').element.fields.items, ['module/when-to-roll']);
  assert.deepEqual(at(game, 'engine:chapter/gear').element.fields.items, ['engine:module/reading-the-dice', 'module/carrying']);
  // The rule's own file is untouched: only the two lists changed.
  assert.match(await f.engine.readText('elements/module/reading-the-dice.md'), /Count each die below your edge\./);
});

test("a world's section moved within a division keeps the base game's sections around it", async () => {
  const f = files();
  const game = await open(f);
  const division = at(game, 'world:division/the-protagonist');
  const shown = bookTree(game, 'world')!.divisions[0].sections.map((s) => s.placed.key);
  assert.deepEqual(shown, ['engine:chapter/risks', 'world:chapter/tides', 'engine:chapter/gear']);
  await placeSection(division, division, at(game, 'world:chapter/tides'), null, shown, saver(game));
  assert.deepEqual(bookTree(await open(f), 'world')!.divisions[0].sections.map((s) => s.placed.element.name), ['Risks', 'Gear', 'The Tides']);
  // Nothing was written to the base game.
  assert.match(await f.engine.readText('elements/division/the-protagonist.md'), /sections: \[ chapter\/risks, chapter\/gear \]/);
});

test("the world's own file for a part of the base game is made once, with the same id", async () => {
  const f = files();
  const game = await open(f);
  assert.equal(await makeWorldTwin(game, at(game, 'engine:chapter/front-matter')), 'world:chapter/front-matter');
  assert.match(await f.world.readText('game/elements/chapter/front-matter.md'), /name: Front Matter/);
  assert.equal(await makeWorldTwin(await open(f), at(game, 'engine:chapter/front-matter')), null);
  assert.equal(await makeWorldTwin(game, at(game, 'world:chapter/tides')), null);
});

test('archiving a rule moves its file, lets every list go of it, and notes where it stood', async () => {
  const f = files();
  const game = await open(f);
  await archiveElement(game, at(game, 'engine:module/when-to-roll'), saver(game));
  assert.equal(await f.engine.exists('elements/module/when-to-roll.md'), false);
  const archived = await f.engine.readText('archive/elements/module/when-to-roll.md');
  assert.match(archived, /Roll when failing would be interesting\./);
  assert.match(archived, /archived_from:/);
  assert.match(archived, /in: engine:chapter\/risks/);
  assert.match(archived, /before: engine:module\/reading-the-dice/);
  assert.deepEqual(at(game, 'engine:chapter/risks').element.fields.items, ['module/reading-the-dice']);
});

test('archiving a section takes it out of the division and the book that listed it', async () => {
  const f = files();
  const game = await open(f);
  await archiveElement(game, at(game, 'engine:chapter/front-matter'), saver(game));
  assert.doesNotMatch(await f.engine.readText('book.md'), /front_matter/);
  await archiveElement(game, at(game, 'world:chapter/tides'), saver(game));
  assert.deepEqual(at(game, 'world:division/the-protagonist').element.fields.sections, ['engine:chapter/risks', 'engine:chapter/gear']);
  assert.equal(await f.world.exists('game/archive/elements/chapter/tides.md'), true);
  // The section's rule stays in the game.
  assert.equal(await f.world.exists('game/elements/module/low-water.md'), true);
});

test('archiving twice gives the second file a number and loses nothing', async () => {
  const f = files();
  let game = await open(f);
  await archiveElement(game, at(game, 'engine:module/carrying'), saver(game));
  await f.engine.writeText('elements/module/carrying.md', el('module', 'Carrying', '', 'A second one.'));
  game = await open(f);
  await archiveElement(game, at(game, 'engine:module/carrying'), saver(game));
  assert.match(await f.engine.readText('archive/elements/module/carrying.md'), /You carry what you can lift\./);
  assert.match(await f.engine.readText('archive/elements/module/carrying-2.md'), /A second one\./);
});
