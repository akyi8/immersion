import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { archivePiece, moveToPlace, newManuscript, renamePiece } from './manage.ts';
import { buildStoryIndex } from './index.ts';

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

test('moving between the desk, the drawer, and the shelf moves the folder', async () => {
  const fs = new MemoryFs({ 'stories/ideas/salt-ghosts.md': '# Salt Ghosts\n\n## Chapter 1\n\nA seed.\n' });
  let index = await buildStoryIndex(fs, 'stories');
  // A file becomes a folder on its way to the desk, and the original goes to the archive.
  const desk = await moveToPlace(fs, index.manuscripts[0], 'stories', 'desk');
  assert.equal(desk, 'stories/salt-ghosts');
  assert.equal(await fs.readText('stories/salt-ghosts/01-chapter-1.md'), '# Chapter 1\n\nA seed.\n');
  assert.equal(await fs.exists('stories/archive/ideas/salt-ghosts.md'), true);
  index = await buildStoryIndex(fs, 'stories');
  const shelf = await moveToPlace(fs, index.manuscripts[0], 'stories', 'shelf');
  assert.equal(shelf, 'stories/finished/salt-ghosts');
  assert.equal(await fs.exists('stories/finished/salt-ghosts/book.md'), true);
});

test('a new manuscript is a folder with a title page and a first chapter', async () => {
  const fs = new MemoryFs({});
  const made = await newManuscript(fs, 'stories', 'The Crossing', { author: 'Mara Vell' });
  assert.deepEqual(made, { folder: 'stories/the-crossing', chapter: 'stories/the-crossing/01-chapter-1.md' });
  assert.match(await fs.readText('stories/the-crossing/book.md'), /author: Mara Vell[\s\S]*# The Crossing/);
});

test('renaming a manuscript folder renames its title page and its folder', async () => {
  const fs = new MemoryFs({ 'stories/salt/book.md': '---\nauthor: Wren\n---\n\n# Salt\n', 'stories/salt/01-chapter-1.md': '# Chapter 1\n' });
  assert.equal(await renamePiece(fs, 'stories/salt', 'Salt Ghosts'), 'stories/salt-ghosts');
  assert.equal(await fs.readText('stories/salt-ghosts/book.md'), '---\nauthor: Wren\n---\n\n# Salt Ghosts\n');
});
