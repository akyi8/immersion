import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProfileId, profileLabel, readYou, withProfiles } from './you.ts';

test('author profiles round-trip through immersion.md', () => {
  assert.deepEqual(readYou(null), { profiles: [] });
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
