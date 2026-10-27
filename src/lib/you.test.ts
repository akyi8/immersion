import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOOK, newProfileId, profileLabel, readYou, withLook, withProfiles } from './you.ts';

test('author profiles round-trip through immersion.md', () => {
  assert.deepEqual(readYou(null), { profiles: [], look: DEFAULT_LOOK });
  const first = withProfiles(null, [{ id: 'mara-vell', author: 'Mara Vell', copyright: 'Ada Lane' }]);
  assert.match(first, /profiles:\n {2}- id: mara-vell\n {4}author: Mara Vell\n {4}copyright: Ada Lane/);
  assert.match(first, /# Immersion/);
  const you = readYou(first);
  assert.deepEqual(you.profiles, [{ id: 'mara-vell', author: 'Mara Vell', copyright: 'Ada Lane' }]);
  // A renamed profile keeps its id, so books linked to it follow the new name.
  const renamed = readYou(withProfiles(first, [{ ...you.profiles[0], author: 'M. Vell' }]));
  assert.equal(renamed.profiles[0].id, 'mara-vell');
  assert.equal(renamed.profiles[0].author, 'M. Vell');
  assert.equal(newProfileId('Mara Vell', you.profiles), 'mara-vell-2');
  assert.equal(profileLabel(you.profiles[0]), 'Mara Vell (© Ada Lane)');
  assert.doesNotMatch(withProfiles(first, []), /profiles:/);
});

test('the layout is kept in immersion.md, beside the profiles', () => {
  const start = withProfiles(null, [{ id: 'mara-vell', author: 'Mara Vell', copyright: '' }]);
  assert.deepEqual(readYou(start).look, { layout: 'classic', backdrop: true });
  const soft = withLook(start, { layout: 'soft', backdrop: true });
  assert.match(soft, /layout: soft/);
  assert.doesNotMatch(soft, /backdrop/);
  assert.equal(readYou(soft).profiles[0].author, 'Mara Vell');
  const plain = withLook(soft, { layout: 'soft', backdrop: false });
  assert.deepEqual(readYou(plain).look, { layout: 'soft', backdrop: false });
  // Classic with the picture on is what a file with neither line means.
  assert.doesNotMatch(withLook(plain, DEFAULT_LOOK), /layout|backdrop/);
});
