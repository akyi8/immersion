import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { buildStoryIndex, countWords, sectionsOfFile, titleOf } from './index.ts';
import { withHeader } from '../world.ts';

const tideLetter = `---
manuscript: true
---

# The Tide Letter

## Chapter 1

Wren took the long way through the narrows.

### The stall

Rook was waiting.

## Chapter 2

She *did not* stop.
`;

test('words are counted as a reader sees them', () => {
  assert.equal(countWords('# Title\n\nThe **salt** market, at [night](https://x.y).\n\n> [!narrator]\n> Rook lies.'), 8);
  assert.equal(countWords('---\nmanuscript: true\n---\n\n- one\n- two'), 2);
});

test('a one-file manuscript has chapters and scenes from its headings', () => {
  const s = sectionsOfFile(tideLetter, 'stories/tide.md');
  assert.deepEqual(
    s.map((x) => [x.title, x.depth, x.words]),
    [
      ['Chapter 1', 2, 13],
      ['The stall', 3, 3],
      ['Chapter 2', 2, 4],
    ],
  );
  assert.equal(tideLetter.slice(s[0].offset!).startsWith('## Chapter 1'), true);
  assert.equal(titleOf(tideLetter, 'tide.md'), 'The Tide Letter');
});

test('the desk, the drawer, and the shelf are folders, and every manuscript is a folder', async () => {
  const fs = new MemoryFs({
    'stories/the-tide-letter.md': tideLetter,
    'stories/the-tide-letter.outline.md': '# Outline\n',
    'stories/ideas/salt-ghosts.md': '# Salt Ghosts\n\nA seed.\n',
    'stories/ideas/ink/outline.md': '# Ink\n',
    'stories/archive/old.md': '# Old\n',
    'stories/export/old.md': '# Exported\n',
    'stories/portraits/book.md': '---\nauthor: Wren\n---\n\n# Harbor Portraits\n',
    'stories/portraits/front/01-dedication.md': '# Dedication\n\nFor Rook.\n',
    'stories/portraits/02-rook.md': '# Rook\n\nTwo words.\n',
    'stories/portraits/10-wren.md': '# Wren\n\nThree more words.\n',
    'stories/finished/the-long-tide/book.md': '# The Long Tide\n',
    'stories/finished/the-long-tide/01-chapter-1.md': '# Chapter 1\n',
  });
  const index = await buildStoryIndex(fs, 'stories');
  assert.deepEqual(
    index.manuscripts.map((m) => [m.title, m.kind, m.place]),
    [
      ['Harbor Portraits', 'folder', 'desk'],
      ['Ink', 'folder', 'drawer'],
      ['Salt Ghosts', 'file', 'drawer'],
      ['The Long Tide', 'folder', 'shelf'],
      ['The Tide Letter', 'file', 'desk'],
    ],
  );
  const portraits = index.manuscripts[0];
  assert.deepEqual(portraits.sections.map((s) => s.title), ['Rook', 'Wren']);
  assert.deepEqual(portraits.front.map((s) => s.title), ['Dedication']);
  assert.equal(portraits.book, 'stories/portraits/book.md');
  // Front matter does not count toward the story's words.
  assert.equal(portraits.words, 3 + 4);
});

test('a missing stories folder is reported', async () => {
  const index = await buildStoryIndex(new MemoryFs({ 'world.md': '# W\n' }), 'stories');
  assert.equal(index.missing, true);
});

test('declaring a manuscript adds one header line and keeps the rest', () => {
  const after = withHeader('# Salt Ghosts\n\nA seed.\n', { manuscript: true });
  assert.equal(after, '---\nmanuscript: true\n---\n\n# Salt Ghosts\n\nA seed.\n');
  assert.equal(withHeader(after, { manuscript: undefined }), '# Salt Ghosts\n\nA seed.\n');
});
