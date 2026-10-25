import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addChapter, moveChapter, nextChapterTitle, readOutline, renameChapter, setOutline, withFirstChapter, withoutOutlines } from './outline.ts';

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
  assert.equal(text.slice(offset).startsWith('## Chapter 3\n\n\n\n## About the Author'), true);
  const fresh = addChapter('# Salt Ghosts\n\nA seed.\n', 'Opening');
  assert.equal(fresh.text, '# Salt Ghosts\n\nA seed.\n\n## Opening\n\n');
});

test('outlines are not counted as words of the book', () => {
  assert.doesNotMatch(withoutOutlines(book), /Rook waits/);
  assert.match(withoutOutlines(book), /Wren took the long way/);
});

test('a manuscript without chapters gains a first chapter that holds its prose', () => {
  const declared = withFirstChapter('---\nmanuscript: true\n---\n\n# Salt Ghosts\n\nA seed.\n');
  assert.equal(declared.text, '---\nmanuscript: true\n---\n\n# Salt Ghosts\n\n## Chapter 1\n\nA seed.\n');
  assert.equal(declared.text.slice(declared.offset).startsWith('## Chapter 1'), true);
  assert.equal(withFirstChapter('# Empty\n').text, '# Empty\n\n## Chapter 1\n\n');
  assert.equal(withFirstChapter(book).text, book);
});

test('a chapter moves with its outline and prose, and nothing is lost', () => {
  const moved = moveChapter(book, 0, 1);
  assert.deepEqual(
    readOutline(moved).map((c) => [c.title, c.outline]),
    [
      ['Chapter 2', ''],
      ['Chapter 1', 'Wren takes the long way.\n\nRook waits at the stall.'],
      ['About the Author', ''],
    ],
  );
  assert.match(moved, /^# The Tide Letter\n\n## Chapter 2\n\nShe did not stop\.\n\n## Chapter 1\n/);
  assert.equal(moveChapter(moveChapter(book, 0, 1), 1, 0), book);
});
