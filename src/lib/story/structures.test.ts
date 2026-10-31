import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bands, placed, readStages, readStructures, withStage } from './structures.ts';

const guidance = readFileSync(new URL('./structure-guidance.md', import.meta.url), 'utf8');

test('the guidance file gives every structure its parts, guidance, and prompts', () => {
  const [k, circle, acts] = readStructures(guidance);
  assert.equal(k.name, 'Kishōtenketsu');
  assert.deepEqual(k.parts.map((p) => [p.id, p.name]), [['ki', 'Ki'], ['sho', 'Shō'], ['ten', 'Ten'], ['ketsu', 'Ketsu']]);
  assert.match(k.overview, /understanding rather than conflict/);
  assert.match(k.overview, /fishing boats/);
  assert.match(k.parts[2].about, /^Ten introduces a turn/);
  assert.equal(k.parts[2].prompts.length, 4);
  assert.equal(circle.parts.length, 8);
  assert.equal(circle.parts[7].name, 'Change');
  assert.equal(acts.parts[0].name, 'Act I: The Beginning');
  assert.deepEqual(acts.parts[1].recommended.map((s) => s.name), ['The Extraordinary World', 'Road of Trials', 'False Summits']);
  assert.equal(acts.parts[2].optional.length, 7);
  assert.match(acts.parts[2].optional[0].essence, /^Pressure drives/);
  // Stage lists never leak into the prompts.
  assert.ok(acts.parts.every((p) => p.prompts.every((q) => q.endsWith('?'))));
});

test('cards sit in bands by the part they hold, and placing one reorders the book', () => {
  const [k] = readStructures(guidance);
  const stages = [{}, { kishotenketsu: 'ten' }, { kishotenketsu: 'ki', 'story-circle': 'go' }, { kishotenketsu: 'gone' }];
  const list = bands(k, stages);
  assert.deepEqual(list.map((b) => [b.part?.id ?? null, b.cards]), [['ki', [2]], ['sho', []], ['ten', [1]], ['ketsu', []], [null, [0, 3]]]);
  // Card 0 goes into Ki before card 2, then card 3 to the end of Shō.
  assert.deepEqual(placed(list, 0, 'ki', 2), [0, 2, 1, 3]);
  assert.deepEqual(placed(list, 3, 'sho', null), [2, 3, 1, 0]);
  // Back to Unassigned goes last.
  assert.deepEqual(placed(list, 2, null, null), [1, 0, 3, 2]);
});

test('a chapter records its part in each structure, and clearing one keeps the others', () => {
  let text = '# Chapter 3\n\n> [!outline]-\n> The twist.\n';
  text = withStage(text, 'kishotenketsu', 'ten');
  assert.match(text, /^---\nstages:\n {2}kishotenketsu: ten\n---\n\n# Chapter 3/);
  text = withStage(text, 'story-circle', 'find');
  assert.deepEqual(readStages(text), { kishotenketsu: 'ten', 'story-circle': 'find' });
  text = withStage(text, 'kishotenketsu', null);
  assert.deepEqual(readStages(text), { 'story-circle': 'find' });
  assert.equal(withStage(text, 'story-circle', null), '# Chapter 3\n\n> [!outline]-\n> The twist.\n');
  assert.deepEqual(readStages(withStage('---\nseries: M\n---\n\n# Boxes\n', 'four-acts', 'act-2', 'series_stages'), 'series_stages'), { 'four-acts': 'act-2' });
});

test('a manuscript board and a series board keep their structure and parts in their files', async () => {
  const { MemoryFs } = await import('../fs/memory.ts');
  const { folderSource, seriesSource } = await import('./outlineSource.ts');
  const { buildStoryIndex } = await import('./index.ts');
  const fs = new MemoryFs({
    'world.md': '---\nname: W\n---\n\n# W\n',
    'stories/boxes/book.md': '---\nseries: M\nnumber: 1\n---\n\n# Boxes\n',
    'stories/boxes/01-chapter-1.md': '# Chapter 1\n',
    'stories/boxes/02-chapter-2.md': '# Chapter 2\n',
    'stories/boxes/03-chapter-3.md': '# Chapter 3\n',
    'stories/ocean/book.md': '---\nseries: M\nnumber: 2\n---\n\n# Ocean\n',
  });
  const book = (await buildStoryIndex(fs, 'stories')).manuscripts.find((m) => m.title === 'Boxes')!;
  const source = folderSource(fs, book);
  assert.equal(await source.structure!(), null);
  await source.setStructure!('kishotenketsu');
  assert.equal(await source.structure!(), 'kishotenketsu');
  await source.setStage!(2, 'kishotenketsu', 'ki');
  await source.reorder!([2, 0, 1]);
  // Chapter 3 is now first in reading order, and its part went with it.
  assert.match(await fs.readText('stories/boxes/01-chapter-3.md'), /kishotenketsu: ki/);
  assert.equal(await fs.readText('stories/boxes/02-chapter-1.md'), '# Chapter 1\n');
  await source.setStructure!(null);
  assert.doesNotMatch(await fs.readText('stories/boxes/book.md'), /structure/);

  const series = seriesSource(fs, 'stories', 'M');
  await series.setStructure!('four-acts');
  assert.match(await fs.readText('world.md'), /series_structures:\n {2}M: four-acts/);
  await series.setStage!(1, 'four-acts', 'act-1');
  await series.reorder!([1, 0]);
  assert.match(await fs.readText('stories/ocean/book.md'), /number: 1[\s\S]*series_stages:\n {2}four-acts: act-1/);
  assert.equal((await series.load()).map((c) => c.title).join(), 'Ocean,Boxes');
});

test('a manuscript board follows its chapters after renumbering them', async () => {
  const { MemoryFs } = await import('../fs/memory.ts');
  const { folderSource } = await import('./outlineSource.ts');
  const { buildStoryIndex } = await import('./index.ts');
  const fs = new MemoryFs({
    'world.md': '---\nname: W\n---\n\n# W\n',
    'stories/boxes/book.md': '# Boxes\n',
    'stories/boxes/01-a.md': '# A\n',
    'stories/boxes/02-b.md': '# B\n',
  });
  const source = folderSource(fs, (await buildStoryIndex(fs, 'stories')).manuscripts[0]);
  await source.move(1, 0);
  assert.equal((await source.load()).map((c) => c.title).join(), 'B,A');
  await source.add();
  assert.equal((await source.load()).length, 3);
});

test('a series board names the parts of every book at once, and a new book follows', async () => {
  const { MemoryFs } = await import('../fs/memory.ts');
  const { seriesSource } = await import('./outlineSource.ts');
  const fs = new MemoryFs({
    'world.md': '---\nname: W\n---\n\n# W\n',
    'stories/boxes/book.md': '---\nseries: M\nnumber: 1\n---\n\n# Boxes\n',
    'stories/ocean/book.md': '---\nseries: M\nnumber: 2\n---\n\n# Ocean\n',
  });
  const series = seriesSource(fs, 'stories', 'M');
  assert.equal(await series.partWord!(), 'Chapter');
  await series.setPartWord!('Part');
  assert.match(await fs.readText('stories/boxes/book.md'), /part_word: Part/);
  assert.match(await fs.readText('stories/ocean/book.md'), /part_word: Part/);
  const made = await series.add();
  assert.match(await fs.readText(made.path), /part_word: Part/);
  assert.equal(await series.seriesWord!(), 'Story');
  await series.setSeriesWord!('Episode');
  assert.match(await fs.readText('stories/ocean/book.md'), /series_word: Episode/);
  const third = await series.add();
  assert.match(await fs.readText(third.path), /# Episode 4/);
});
