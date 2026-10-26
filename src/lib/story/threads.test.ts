import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { readOutline, setBeat } from './outline.ts';
import { fileSource, folderSource } from './outlineSource.ts';
import { buildStoryIndex } from './index.ts';

const book = `# The Crossing

## Chapter 1

> [!outline]-
> Mara wakes in the wreck.

She woke.

## Chapter 2

Nothing yet.
`;

test('a chapter holds one beat per thread, and the old outline is the main thread', () => {
  let text = setBeat(book, readOutline(book)[0].offset, "Mara's arc", 'She stops trusting Tomas.');
  text = setBeat(text, readOutline(text)[1].offset, "Mara's arc", 'She trusts him again.');
  const chapters = readOutline(text);
  assert.deepEqual(chapters[0].beats, [
    { thread: '', text: 'Mara wakes in the wreck.' },
    { thread: "Mara's arc", text: 'She stops trusting Tomas.' },
  ]);
  assert.equal(chapters[0].outline, 'Mara wakes in the wreck.');
  assert.match(text, /> \[!outline\]- Mara's arc\n> She stops trusting Tomas\.\n\nShe woke\./);
  // Emptying a beat removes its callout and the prose is untouched.
  const back = setBeat(text, readOutline(text)[0].offset, "Mara's arc", '');
  assert.equal(readOutline(back)[0].beats.length, 1);
  assert.match(back, /> Mara wakes in the wreck\.\n\nShe woke\./);
});

test('threads are added, renamed, ordered, and removed across a one-file manuscript', async () => {
  const fs = new MemoryFs({ 'stories/w.md': book });
  const source = fileSource(fs, 'stories/w.md');
  await source.addThread("Mara's arc");
  await source.addThread('The heist');
  await source.setBeat(1, "Mara's arc", 'She trusts him again.');
  assert.deepEqual((await source.threads()).map((t) => t.name), ['Main plot', "Mara's arc", 'The heist']);
  await source.renameThread("Mara's arc", 'Mara');
  await source.moveThread('The heist', -1);
  assert.deepEqual((await source.threads()).map((t) => [t.key, t.name]), [['', 'Main plot'], ['The heist', 'The heist'], ['Mara', 'Mara']]);
  assert.equal((await source.load())[1].beats.Mara, 'She trusts him again.');
  await source.renameThread('', 'The wreck');
  assert.equal((await source.threads())[0].name, 'The wreck');
  await source.removeThread('Mara');
  assert.equal((await source.load())[1].beats.Mara, undefined);
  assert.match(await fs.readText('stories/w.md'), /^---\nthreads:\n {2}- The wreck\n {2}- The heist\n---/);
});

test('a manuscript folder keeps its threads in book.md and its beats in each chapter', async () => {
  const fs = new MemoryFs({
    'stories/w/book.md': '# The Crossing\n',
    'stories/w/01-chapter-1.md': '# Chapter 1\n\n> [!outline]-\n> The wreck.\n\nShe woke.\n',
    'stories/w/02-chapter-2.md': '# Chapter 2\n\nLater.\n',
  });
  const m = (await buildStoryIndex(fs, 'stories')).manuscripts[0];
  const source = folderSource(fs, m);
  await source.addThread('Tomas');
  await source.setBeat(1, 'Tomas', 'He lies.');
  assert.match(await fs.readText('stories/w/book.md'), /threads:\n {2}- Main plot\n {2}- Tomas/);
  assert.equal(await fs.readText('stories/w/02-chapter-2.md'), '# Chapter 2\n\n> [!outline]- Tomas\n> He lies.\n\nLater.\n');
  assert.deepEqual((await source.load()).map((c) => c.beats), [{ '': 'The wreck.' }, { Tomas: 'He lies.' }]);
});

test('a series board orders books by number and keeps series beats in each book.md', async () => {
  const fs = new MemoryFs({
    'world.md': '---\nname: W\n---\n# W\n',
    'stories/the-crossing/book.md': '---\nseries: Wayfarer Chronicles\nnumber: 2\nauthor: Mara Vell\n---\n\n# The Crossing\n',
    'stories/the-crossing/01-chapter-1.md': '# Chapter 1\n',
    'stories/finished/the-long-road/book.md': '---\nseries: Wayfarer Chronicles\nnumber: 1\n---\n\n# The Long Road\n',
    'stories/finished/the-long-road/01-chapter-1.md': '# Chapter 1\n',
    'stories/other/book.md': '# Another Story\n',
  });
  const { seriesSource } = await import('./outlineSource.ts');
  const source = seriesSource(fs, 'stories', 'Wayfarer Chronicles');
  assert.deepEqual((await source.load()).map((c) => c.title), ['The Long Road', 'The Crossing']);
  await source.addThread("Mara's arc");
  await source.setBeat(1, "Mara's arc", 'She learns what Tomas does.');
  assert.match(await fs.readText('stories/the-crossing/book.md'), /# The Crossing\n\n> \[!outline\]- Mara's arc\n> She learns what Tomas does\.\n/);
  assert.match(await fs.readText('world.md'), /series_threads:\n {2}Wayfarer Chronicles:\n {4}- Main plot\n {4}- Mara's arc/);
  await source.move(1, 0);
  assert.deepEqual((await source.load()).map((c) => c.title), ['The Crossing', 'The Long Road']);
  const added = await source.add();
  assert.equal(added.path, 'stories/story-3/book.md');
  const made = await fs.readText(added.path);
  assert.match(made, /series: Wayfarer Chronicles\nnumber: 3/);
  assert.match(made, /author: Mara Vell/);
});
