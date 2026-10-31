import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileToFolder, newBook, readTitlePage, seriesLine, withTitlePage, blankPage } from './book.ts';

const typedOut = `---
manuscript: true
shelved: true
---

# The Long Road

*The First Story in the Wayfarer Chronicles*

**by Mara Vell**

Copyright © 2026 Ada Lane

All rights reserved.

## Dedication
For my wife.

## Prologue

Dust.

## Chapter 1

> [!outline]-
> The bus.

The bus sat.

### On the bus

Rows of light.

## Chapter 2

The road.

## Epilogue

After.

## Acknowledgements

Thanks.
`;

test('a typed-out title page becomes fields, and chapters become files', () => {
  const { title, files } = fileToFolder(typedOut, 'the-long-road.md');
  assert.equal(title, 'The Long Road');
  assert.deepEqual(Object.keys(files), [
    'book.md',
    'front/01-dedication.md',
    '01-prologue.md',
    '02-chapter-1.md',
    '03-chapter-2.md',
    '04-epilogue.md',
    'back/01-acknowledgements.md',
  ]);
  const page = readTitlePage(files['book.md'], 'x');
  assert.deepEqual(page, {
    title: 'The Long Road',
    subtitle: '',
    series: 'Wayfarer Chronicles',
    number: 1,
    seriesWord: 'Story',
    partWord: 'Chapter',
    profile: '',
    author: 'Mara Vell',
    copyright: 'Ada Lane',
    year: 2026,
  });
  assert.doesNotMatch(files['book.md'], /manuscript|shelved|All rights/);
  assert.equal(files['02-chapter-1.md'], '# Chapter 1\n\n> [!outline]-\n> The bus.\n\nThe bus sat.\n\n## On the bus\n\nRows of light.\n');
  assert.equal(files['front/01-dedication.md'], '# Dedication\n\nFor my wife.\n');
});

test('a file without chapters becomes a folder with one chapter', () => {
  const { files } = fileToFolder('# Salt Ghosts\n\nA seed.\n', 'salt-ghosts.md');
  assert.deepEqual(Object.keys(files), ['book.md', '01-chapter-1.md']);
  assert.equal(files['01-chapter-1.md'], '# Chapter 1\n\nA seed.\n');
});

test('the series line is written from the series and its number', () => {
  assert.equal(seriesLine({ series: 'Wayfarer Chronicles', number: 2, seriesWord: 'Story' }), 'The Second Story in the Wayfarer Chronicles');
  assert.equal(seriesLine({ series: 'The Tide Books', number: 23, seriesWord: 'Book' }), 'The 23rd Book in The Tide Books');
  assert.equal(seriesLine({ series: '', number: 2, seriesWord: 'Story' }), '');
});

test('a title page round-trips through book.md and keeps notes', () => {
  const page = { ...blankPage('The Crossing', { author: 'Mara Vell', copyright: 'Ada Lane' }), series: 'Wayfarer Chronicles', number: 2 };
  const book = newBook(page) + '\nNotes stay.\n';
  assert.deepEqual(readTitlePage(book, 'x'), page);
  const renamed = withTitlePage(book, { ...page, title: 'The Wreck', series: '' });
  assert.match(renamed, /^# The Wreck$/m);
  assert.doesNotMatch(renamed, /series|number/);
  assert.match(renamed, /Notes stay\./);
});

test('a long italic note under the title stays with the text instead of becoming the subtitle', () => {
  const note = '*Captured in one sitting, verbatim, as design material for the world and not as book text for any chapter.*';
  const { files } = fileToFolder(`# The Campaign\n\n${note}\n\nThe first session began at the docks.\n`, 'campaign.md');
  assert.doesNotMatch(files['book.md'], /subtitle:/);
  assert.ok(files['01-chapter-1.md'].includes(note));
  const short = fileToFolder('# The Campaign\n\n*A ghost story*\n\nThe docks.\n', 'campaign.md').files['book.md'];
  assert.match(short, /subtitle: A ghost story/);
});

test('a title page linked to a profile keeps the link and not the names', () => {
  const page = { ...blankPage('The Long Road', { profile: 'mara-vell' }) };
  assert.equal(page.year, new Date().getFullYear());
  const text = newBook({ ...page, author: 'Stale Name', copyright: 'Stale Holder' });
  assert.match(text, /profile: mara-vell/);
  assert.doesNotMatch(text, /author:|copyright:/);
  assert.equal(readTitlePage(text, 'x').profile, 'mara-vell');
  // Unlinking writes the names out by hand again.
  const unlinked = withTitlePage(text, { ...readTitlePage(text, 'x'), profile: '', author: 'Mara Vell', copyright: 'Ada Lane' });
  assert.match(unlinked, /author: Mara Vell\ncopyright: Ada Lane/);
  assert.doesNotMatch(unlinked, /profile:/);
});

test('a book names its parts, and Chapter is left unwritten', async () => {
  const { readTitlePage, withTitlePage } = await import('./book.ts');
  const { nextChapterTitle } = await import('./outline.ts');
  const page = readTitlePage('---\nseries: M\nnumber: 1\n---\n\n# Boxes\n', 'Boxes');
  assert.equal(page.partWord, 'Chapter');
  const parts = withTitlePage('# Boxes\n', { ...page, partWord: 'Part' });
  assert.match(parts, /part_word: Part/);
  assert.equal(readTitlePage(parts, 'Boxes').partWord, 'Part');
  assert.doesNotMatch(withTitlePage(parts, { ...page, partWord: 'Chapter' }), /part_word/);
  assert.equal(nextChapterTitle([{ title: 'Part 1' }, { title: 'Part 3' }], 'Part'), 'Part 4');
  assert.equal(nextChapterTitle([], 'Movement'), 'Movement 1');
  assert.equal(nextChapterTitle([{ title: 'The Pier' }]), 'Chapter 2');
});

test('plurals and counts for the names of parts and books', async () => {
  const { plural, counted } = await import('./book.ts');
  assert.equal(plural('Story'), 'Stories');
  assert.equal(plural('Episode'), 'Episodes');
  assert.equal(plural('Day'), 'Days');
  assert.equal(plural('Act'), 'Acts');
  assert.equal(counted(1, 'Episode'), '1 episode');
  assert.equal(counted(20, 'Story'), '20 stories');
});
