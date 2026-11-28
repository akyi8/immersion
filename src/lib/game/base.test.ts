import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { describeWorld } from '../world.ts';
import { loadGame } from './game.ts';
import { baseGameFile, baseGameHere } from './base.ts';

test('a base game opens on its own, with no world built on it', async () => {
  const fs = new MemoryFs({
    'engine.md': '---\nname: Example Engine\n---\n',
    'book.md': '---\nname: Example Engine\n---\n',
    'kinds/module.md': '---\nname: Rule\nplural: Rules\n---\n',
    'elements/module/when-to-roll.md': '---\nname: When to Roll\nkind: module\n---\n\nRoll when failing would be interesting.\n',
  });
  const here = await baseGameHere(fs);
  assert.ok(here);
  assert.equal(here.engine.name, 'Example Engine');
  const game = await loadGame(here.engine, here.world);
  assert.deepEqual(game.elements.map((p) => p.key), ['engine:module/when-to-roll']);
  assert.equal(game.books.world, null);
  assert.equal(await baseGameHere(new MemoryFs({ 'world.md': '---\nname: Harrowgate\n---\n' })), null);
});

test('a world can be kept to one module, and the journal is kept to Story', () => {
  assert.equal(describeWorld(baseGameFile('Example Engine')).only, 'game');
  assert.equal(describeWorld(baseGameFile('Example Engine')).name, 'Example Engine');
  assert.equal(describeWorld('---\nname: Real World\njournal: true\n---\n').only, 'story');
  assert.equal(describeWorld('---\nname: Harrowgate\n---\n').only, '');
  assert.equal(describeWorld('---\nname: Harrowgate\nonly: nonsense\n---\n').only, '');
});
