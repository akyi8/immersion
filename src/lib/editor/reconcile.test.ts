import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from './reconcile.ts';

const rule = 'Roll for trouble.\n\nOn a six, the trouble passes.\n\nOn a one, it finds you.\n';

test('nothing changed outside leaves the editor alone', () => {
  assert.deepEqual(reconcile(rule, rule + 'More.\n', rule), { show: null, seed: rule, clash: false });
});

test('an outside change with nothing typed is shown', () => {
  const theirs = rule.replace('six', 'five or six');
  assert.deepEqual(reconcile(rule, rule, theirs), { show: theirs, seed: theirs, clash: false });
});

test("the editor's own save coming back is not an outside change", () => {
  const saved = rule + 'A';
  const now = rule + 'AB';
  assert.deepEqual(reconcile(rule, now, saved, [rule + 'A', now]), { show: null, seed: saved, clash: false });
});

test('an outside change to another paragraph joins the typing', () => {
  const mine = rule.replace('it finds you', 'it finds you first');
  const theirs = rule.replace('six', 'five or six');
  const r = reconcile(rule, mine, theirs);
  assert.equal(r.clash, false);
  assert.equal(r.seed, theirs);
  assert.ok(r.show?.includes('five or six') && r.show.includes('finds you first'));
});

test('a change to the same paragraph keeps the writer text and says so', () => {
  const mine = rule.replace('six', 'four');
  const theirs = rule.replace('six', 'five');
  assert.deepEqual(reconcile(rule, mine, theirs), { show: null, seed: theirs, clash: true });
});
