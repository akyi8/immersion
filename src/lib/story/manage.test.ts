import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { archivePiece, renamePiece } from './manage.ts';

test('renaming a piece changes its title and its file name', async () => {
  const fs = new MemoryFs({ 'stories/ideas/salt-ghosts.md': '# Salt Ghosts\n\nA seed.\n' });
  const path = await renamePiece(fs, 'stories/ideas/salt-ghosts.md', 'The Salt Ghosts');
  assert.equal(path, 'stories/ideas/the-salt-ghosts.md');
  assert.equal(await fs.readText(path), '# The Salt Ghosts\n\nA seed.\n');
  assert.equal(await fs.exists('stories/ideas/salt-ghosts.md'), false);
});

test('archiving a piece keeps its folder inside the archive', async () => {
  const fs = new MemoryFs({ 'stories/ideas/salt-ghosts.md': '# Salt Ghosts\n' });
  assert.equal(await archivePiece(fs, 'stories/ideas/salt-ghosts.md', 'stories'), 'stories/archive/ideas/salt-ghosts.md');
});
