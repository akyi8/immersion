import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtIn, hasLabel, labelsOf, linkingOf, readLabels } from './labels.ts';

const base = builtIn();

test("an element's labels are its kind and its tags, as one set", () => {
  assert.deepEqual([...labelsOf({ kind: 'gear', tags: ['harbor', 'Gear', 'Weapon'] }, base)], ['gear', 'harbor', 'weapon']);
  assert.deepEqual([...labelsOf({ kind: 'gear' }, base)], ['gear']);
});

test('with no labels file, a keyword links in any case and everything else by its capitals', () => {
  assert.equal(linkingOf({ kind: 'keyword', tags: ['core', 'keyword'] }, base), 'any case');
  assert.equal(linkingOf({ kind: 'condition', tags: ['keyword'] }, base), 'any case');
  assert.equal(linkingOf({ kind: 'gear', tags: ['gear', 'tool'] }, base), 'capitals');
  assert.equal(linkingOf({ kind: 'module', tags: ['core', 'module'] }, base), 'never');
});

test('when labels disagree, the strictest wins', () => {
  assert.equal(linkingOf({ kind: 'keyword', tags: ['keyword', 'aspect'] }, base), 'capitals');
  assert.equal(linkingOf({ kind: 'module', tags: ['keyword'] }, base), 'never');
});

test('a labels file adds labels, changes meanings, and says one label is also another', () => {
  const { labels, skipped } = readLabels('---\ncondition:\n  links: any case\n  plural: Conditions\ngear:\n  is: aspect\nKeyword:\n  links: capitals\n---\n\nNotes.\n');
  assert.deepEqual(skipped, []);
  assert.equal(linkingOf({ kind: 'condition' }, labels), 'any case');
  assert.equal(labels.get('condition')?.plural, 'Conditions');
  assert.equal(hasLabel({ kind: 'gear' }, 'aspect', labels), true);
  assert.equal(linkingOf({ kind: 'keyword' }, labels), 'capitals');
  // The meanings a file does not mention stay as they were.
  assert.equal(linkingOf({ kind: 'division' }, labels), 'never');
});

test('a world can change what an engine label means', () => {
  const engine = readLabels('---\ncondition:\n  links: any case\n---\n').labels;
  const world = readLabels('---\ncondition:\n  links: capitals\n---\n', engine).labels;
  assert.equal(linkingOf({ kind: 'condition' }, engine), 'any case');
  assert.equal(linkingOf({ kind: 'condition' }, world), 'capitals');
});

test('an entry that cannot be read is skipped and named, and the rest still load', () => {
  const { labels, skipped } = readLabels('---\ncondition:\n  links: sometimes\ntrait: yes\nscar:\n  links: any case\n---\n');
  assert.equal(skipped.length, 2);
  assert.match(skipped[0], /condition.*sometimes/);
  assert.match(skipped[1], /trait/);
  assert.equal(linkingOf({ kind: 'scar' }, labels), 'any case');
  assert.equal(labels.has('condition'), false);
});

test('a missing or empty file leaves the built-in meanings', () => {
  assert.deepEqual([...readLabels(null).labels], [...base]);
  assert.deepEqual([...readLabels('Just notes, no header.').labels], [...base]);
});
