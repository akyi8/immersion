import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { readOutline, setBeat } from './outline.ts';
import { fileSource, folderSource } from './outlineSource.ts';
import { buildStoryIndex } from './index.ts';

const book = `# The Wreckage

## Chapter 1

> [!outline]-
> Cerys wakes in the wreck.

She woke.

## Chapter 2

Nothing yet.
`;

test('a chapter holds one beat per thread, and the old outline is the main thread', () => {
  let text = setBeat(book, readOutline(book)[0].offset, "Cerys's arc", 'She stops trusting Viking.');
  text = setBeat(text, readOutline(text)[1].offset, "Cerys's arc", 'She trusts him again.');
  const chapters = readOutline(text);
  assert.deepEqual(chapters[0].beats, [
    { thread: '', text: 'Cerys wakes in the wreck.' },
    { thread: "Cerys's arc", text: 'She stops trusting Viking.' },
  ]);
  assert.equal(chapters[0].outline, 'Cerys wakes in the wreck.');
  assert.match(text, /> \[!outline\]- Cerys's arc\n> She stops trusting Viking\.\n\nShe woke\./);
  // Emptying a beat removes its callout and the prose is untouched.
  const back = setBeat(text, readOutline(text)[0].offset, "Cerys's arc", '');
  assert.equal(readOutline(back)[0].beats.length, 1);
  assert.match(back, /> Cerys wakes in the wreck\.\n\nShe woke\./);
});

test('threads are added, renamed, ordered, and removed across a one-file manuscript', async () => {
  const fs = new MemoryFs({ 'stories/w.md': book });
  const source = fileSource(fs, 'stories/w.md');
  await source.addThread("Cerys's arc");
  await source.addThread('The heist');
  await source.setBeat(1, "Cerys's arc", 'She trusts him again.');
  assert.deepEqual((await source.threads()).map((t) => t.name), ['Main plot', "Cerys's arc", 'The heist']);
  await source.renameThread("Cerys's arc", 'Cerys');
  await source.moveThread('The heist', -1);
  assert.deepEqual((await source.threads()).map((t) => [t.key, t.name]), [['', 'Main plot'], ['The heist', 'The heist'], ['Cerys', 'Cerys']]);
  assert.equal((await source.load())[1].beats.Cerys, 'She trusts him again.');
  await source.renameThread('', 'The wreck');
  assert.equal((await source.threads())[0].name, 'The wreck');
  await source.removeThread('Cerys');
  assert.equal((await source.load())[1].beats.Cerys, undefined);
  assert.match(await fs.readText('stories/w.md'), /^---\nthreads:\n {2}- The wreck\n {2}- The heist\n---/);
});

test('a manuscript folder keeps its threads in book.md and its beats in each chapter', async () => {
  const fs = new MemoryFs({
    'stories/w/book.md': '# The Wreckage\n',
    'stories/w/01-chapter-1.md': '# Chapter 1\n\n> [!outline]-\n> The wreck.\n\nShe woke.\n',
    'stories/w/02-chapter-2.md': '# Chapter 2\n\nLater.\n',
  });
  const m = (await buildStoryIndex(fs, 'stories')).manuscripts[0];
  const source = folderSource(fs, m);
  await source.addThread('Viking');
  await source.setBeat(1, 'Viking', 'He lies.');
  assert.match(await fs.readText('stories/w/book.md'), /threads:\n {2}- Main plot\n {2}- Viking/);
  assert.equal(await fs.readText('stories/w/02-chapter-2.md'), '# Chapter 2\n\n> [!outline]- Viking\n> He lies.\n\nLater.\n');
  assert.deepEqual((await source.load()).map((c) => c.beats), [{ '': 'The wreck.' }, { Viking: 'He lies.' }]);
});
