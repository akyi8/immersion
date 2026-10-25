import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileToFolder, newBook, readTitlePage, seriesLine, withTitlePage, blankPage } from './book.ts';

const typedOut = `---
manuscript: true
shelved: true
---

# The Road South

*The First Story in the Cerys Cross Chronicles*

**by Cerys Cross**

Copyright © 2026 C. Michael Howlett

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
  const { title, files } = fileToFolder(typedOut, 'the-road-south.md');
  assert.equal(title, 'The Road South');
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
    title: 'The Road South',
    subtitle: '',
    series: 'Cerys Cross Chronicles',
    number: 1,
    seriesWord: 'Story',
    author: 'Cerys Cross',
    copyright: 'C. Michael Howlett',
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
  assert.equal(seriesLine({ series: 'Cerys Cross Chronicles', number: 2, seriesWord: 'Story' }), 'The Second Story in the Cerys Cross Chronicles');
  assert.equal(seriesLine({ series: 'The Tide Books', number: 23, seriesWord: 'Book' }), 'The 23rd Book in The Tide Books');
  assert.equal(seriesLine({ series: '', number: 2, seriesWord: 'Story' }), '');
});

test('a title page round-trips through book.md and keeps notes', () => {
  const page = { ...blankPage('The Wreckage', { author: 'Cerys Cross', copyright: 'C. Michael Howlett' }), series: 'Cerys Cross Chronicles', number: 2 };
  const book = newBook(page) + '\nNotes stay.\n';
  assert.deepEqual(readTitlePage(book, 'x'), page);
  const renamed = withTitlePage(book, { ...page, title: 'The Wreck', series: '' });
  assert.match(renamed, /^# The Wreck$/m);
  assert.doesNotMatch(renamed, /series|number/);
  assert.match(renamed, /Notes stay\./);
});
