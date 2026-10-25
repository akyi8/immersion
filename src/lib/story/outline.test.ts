import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addChapter, nextChapterTitle, readOutline, renameChapter, setOutline, withoutOutlines } from './outline.ts';

const book = `# The Tide Letter

## Chapter 1

> [!outline]-
> Wren takes the long way.
>
> Rook waits at the stall.

Wren took the long way through the narrows.

## Chapter 2

She did not stop.

## About the Author

Someone.
`;

test('chapters come with their outlines', () => {
  const chapters = readOutline(book);
  assert.deepEqual(
    chapters.map((c) => [c.title, c.outline]),
    [
      ['Chapter 1', 'Wren takes the long way.\n\nRook waits at the stall.'],
      ['Chapter 2', ''],
      ['About the Author', ''],
    ],
  );
});

test('an outline is added, changed, and removed under its heading', () => {
  const [, second] = readOutline(book);
  const added = setOutline(book, second.offset, 'She runs.');
  assert.match(added, /## Chapter 2\n\n> \[!outline\]-\n> She runs\.\n\nShe did not stop\./);
  const [first] = readOutline(added);
  const changed = setOutline(added, first.offset, 'Only the stall.');
  assert.equal(readOutline(changed)[0].outline, 'Only the stall.');
  assert.match(changed, /> Only the stall\.\n\nWren took the long way/);
  const removed = setOutline(changed, readOutline(changed)[0].offset, '');
  assert.match(removed, /## Chapter 1\n\nWren took the long way/);
  assert.equal(readOutline(removed)[1].outline, 'She runs.');
});

test('renaming a chapter changes only its heading', () => {
  const [, second] = readOutline(book);
  const renamed = renameChapter(book, second.offset, 'The Chase');
  assert.match(renamed, /## The Chase\n\nShe did not stop\./);
});

test('a new chapter goes after the last numbered one, before back matter', () => {
  const title = nextChapterTitle(readOutline(book));
  assert.equal(title, 'Chapter 3');
  const { text, offset } = addChapter(book, title);
  assert.deepEqual(
    readOutline(text).map((c) => c.title),
    ['Chapter 1', 'Chapter 2', 'Chapter 3', 'About the Author'],
  );
  assert.equal(text.slice(offset).startsWith('## Chapter 3\n'), true);
  const fresh = addChapter('# Salt Ghosts\n\nA seed.\n', 'Opening');
  assert.equal(fresh.text, '# Salt Ghosts\n\nA seed.\n\n## Opening\n\n');
});

test('outlines are not counted as words of the book', () => {
  assert.doesNotMatch(withoutOutlines(book), /Rook waits/);
  assert.match(withoutOutlines(book), /Wren took the long way/);
});
