import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freePath } from './archive.ts';

const among = (taken: string[]) => async (path: string) => taken.includes(path);

test('a place in the archive is the wanted place when nothing is there', async () => {
  assert.equal(await freePath(among([]), 'wiki/archive/harbor.md'), 'wiki/archive/harbor.md');
});

test('a place in the archive takes a number before the ending when the name is taken', async () => {
  assert.equal(await freePath(among(['wiki/archive/harbor.md', 'wiki/archive/harbor-2.md']), 'wiki/archive/harbor.md'), 'wiki/archive/harbor-3.md');
});

test('a place in the archive numbers a folder, or a name with no ending, at the end', async () => {
  assert.equal(await freePath(among(['wiki/archive/people']), 'wiki/archive/people'), 'wiki/archive/people-2');
});

test('a place in the archive is not misled by a dot in a folder above the file', async () => {
  assert.equal(await freePath(among(['game.v2/archive/rules']), 'game.v2/archive/rules'), 'game.v2/archive/rules-2');
});

test('a place in the archive keeps a session file ending whole', async () => {
  assert.equal(await freePath(among(['t/archive/first-night.log.md']), 't/archive/first-night.log.md'), 't/archive/first-night-2.log.md');
});
