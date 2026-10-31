import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { archivePiece, moveToPlace, newManuscript, renamePiece, renameSeries } from './manage.ts';
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

test('moving between the desk, the drawer, and the shelf never changes what a piece is', async () => {
  const fs = new MemoryFs({
    'stories/ideas/salt-ghosts.md': '# Salt Ghosts\n\n*A long note about where this came from, kept with the text.*\n\nA seed.\n',
    'stories/ideas/the-crossing/01-chapter-1.md': '# Chapter 1\n',
  });
  let index = await buildStoryIndex(fs, 'stories');
  const note = index.manuscripts.find((m) => m.kind === 'file')!;
  // A note moves as it is, and its text is untouched.
  const desk = await moveToPlace(fs, note, 'stories', 'desk');
  assert.equal(desk, 'stories/salt-ghosts.md');
  assert.match(await fs.readText(desk), /A long note/);
  index = await buildStoryIndex(fs, 'stories');
  assert.equal(index.manuscripts.find((m) => m.path === desk)?.place, 'desk');
  // A manuscript keeps its folder, and gains a title page wherever it goes.
  const book = index.manuscripts.find((m) => m.kind === 'folder')!;
  const shelf = await moveToPlace(fs, book, 'stories', 'shelf');
  assert.equal(shelf, 'stories/finished/the-crossing');
  assert.equal(await fs.exists('stories/finished/the-crossing/book.md'), true);
});

test('a manuscript started in a series takes its name and number', async () => {
  const fs = new MemoryFs({});
  await newManuscript(fs, 'stories', 'The Long Road', {}, { name: 'Wayfarer Chronicles', number: 1 });
  const index = await buildStoryIndex(fs, 'stories');
  assert.equal(index.manuscripts[0].series, 'Wayfarer Chronicles');
  assert.equal(index.manuscripts[0].number, 1);
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

test('renaming a series renames it on every book and keeps its threads', async () => {
  const fs = new MemoryFs({
    'world.md': '---\nname: W\nseries_threads:\n  Wayfarer Chronicles:\n    - Main plot\n    - Mara\n---\n\n# W\n',
    'stories/the-crossing/book.md': '---\nseries: Wayfarer Chronicles\nnumber: 2\n---\n\n# The Crossing\n',
    'stories/finished/the-long-road/book.md': '---\nseries: Wayfarer Chronicles\nnumber: 1\n---\n\n# The Long Road\n',
    'stories/other/book.md': '---\nseries: Another\n---\n\n# Other\n',
  });
  await renameSeries(fs, 'stories', 'Wayfarer Chronicles', 'The Long Coast');
  assert.match(await fs.readText('stories/the-crossing/book.md'), /series: The Long Coast\nnumber: 2/);
  assert.match(await fs.readText('stories/finished/the-long-road/book.md'), /series: The Long Coast/);
  assert.match(await fs.readText('stories/other/book.md'), /series: Another/);
  assert.match(await fs.readText('world.md'), /series_threads:\n {2}The Long Coast:\n {4}- Main plot\n {4}- Mara/);
  await assert.rejects(renameSeries(fs, 'stories', 'The Long Coast', 'Another'));
});

test('default part titles follow a new part word, and given titles stay', async () => {
  const { MemoryFs } = await import('../fs/memory.ts');
  const { retitledPart, retitleParts } = await import('./manage.ts');
  assert.equal(retitledPart('---\nstages:\n  kishotenketsu: ki\n---\n\n# Chapter 1\n\nText.\n', 'Chapter', 'Part'), '---\nstages:\n  kishotenketsu: ki\n---\n\n# Part 1\n\nText.\n');
  assert.equal(retitledPart('# The Pier\n', 'Chapter', 'Part'), '# The Pier\n');
  assert.equal(retitledPart('# Chapter 12: The Pier\n', 'Chapter', 'Part'), '# Chapter 12: The Pier\n');
  const fs = new MemoryFs({
    'stories/boxes/book.md': '# Boxes\n',
    'stories/boxes/01-chapter-1.md': '# Chapter 1\n',
    'stories/boxes/02-the-pier.md': '# The Pier\n',
    'stories/boxes/part-two/03-chapter-3.md': '# Chapter 3\n',
    'stories/boxes/front/01-dedication.md': '# Chapter 1\n',
  });
  await retitleParts(fs, 'stories/boxes', 'Chapter', 'Part');
  assert.equal(await fs.readText('stories/boxes/01-chapter-1.md'), '# Part 1\n');
  assert.equal(await fs.readText('stories/boxes/02-the-pier.md'), '# The Pier\n');
  assert.equal(await fs.readText('stories/boxes/part-two/03-chapter-3.md'), '# Part 3\n');
  assert.equal(await fs.readText('stories/boxes/front/01-dedication.md'), '# Chapter 1\n');
});
