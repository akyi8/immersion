import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge3 } from './merge.ts';

const base = ['# Wren', '', 'She carries messages.', '', 'She owes Tomas a favor.', '', 'The harbor bell rang.', ''].join('\n');

test('edits to different paragraphs are both kept', () => {
  const mine = base.replace('The harbor bell rang.', 'The harbor bell rang twice.');
  const theirs = base.replace('She carries messages.', 'She carries messages nobody else will.');
  const merged = merge3(base, mine, theirs);
  assert.ok(merged?.includes('rang twice.'));
  assert.ok(merged?.includes('nobody else will.'));
  assert.equal(merged?.split('\n').length, base.split('\n').length);
});

test('edits to the same paragraph are left for the writer', () => {
  const mine = base.replace('She owes Tomas a favor.', 'She owes Tomas two favors.');
  const theirs = base.replace('She owes Tomas a favor.', 'She owes Tomas nothing.');
  assert.equal(merge3(base, mine, theirs), null);
});

test('edits to neighboring lines with nothing between them are left for the writer', () => {
  const b = 'one\ntwo\nthree';
  assert.equal(merge3(b, 'ONE\ntwo\nthree', 'one\nTWO\nthree'), null);
});

test('one side unchanged returns the other', () => {
  assert.equal(merge3(base, base, base + 'More.\n'), base + 'More.\n');
  assert.equal(merge3(base, base + 'More.\n', base), base + 'More.\n');
});

test('the same edit on both sides is kept once', () => {
  const both = base.replace('a favor', 'a debt');
  assert.equal(merge3(base, both, both), both);
});

test('a paragraph added at the end and one added at the start are both kept', () => {
  const mine = base + '\nShe set the letter down.\n';
  const theirs = base.replace('# Wren\n', '# Wren\n\n**Aliases:** Marta');
  const merged = merge3(base, mine, theirs);
  assert.ok(merged?.startsWith('# Wren\n\n**Aliases:** Marta\n'));
  assert.ok(merged?.endsWith('She set the letter down.\n'));
});

test('a deletion on one side and an edit elsewhere on the other are both kept', () => {
  const mine = base.replace('She owes Tomas a favor.\n\n', '');
  const theirs = base.replace('# Wren', '# Marta "Wren" Okafor');
  assert.equal(merge3(base, mine, theirs), mine.replace('# Wren', '# Marta "Wren" Okafor'));
});

test('repeated blank lines do not confuse the anchors', () => {
  const b = 'a\n\nb\n\nc\n\nd';
  assert.equal(merge3(b, 'a\n\nb\n\nc\n\nD', 'A\n\nb\n\nc\n\nd'), 'A\n\nb\n\nc\n\nD');
});

test('one side deleting a paragraph the other edited is left for the writer', () => {
  const mine = base.replace('She owes Tomas a favor.\n', '');
  const theirs = base.replace('a favor', 'a debt');
  assert.equal(merge3(base, mine, theirs), null);
});
