import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, importKey, keyFits, newParams, sealText } from './crypto.ts';
import { newEntryName, openEntry, sealEntry, sealedIn } from './entries.ts';

test('a passphrase opens its vault and no other passphrase does', async () => {
  const { params, raw } = await newParams('salt and smoke');
  assert.equal(await keyFits(raw, params), true);
  assert.equal(await keyFits(await deriveKey('salt and smoke', params), params), true);
  assert.equal(await keyFits(await deriveKey('salt and smoke ', params), params), false);

  const key = await importKey(raw);
  const entry = { title: 'The night on the pier', created: 1, modified: 2, text: 'She leaned in.', picture: 'data:image/jpeg;base64,AAAA' };
  const file = await sealEntry(key, 'w1', 'aaaa.locked', entry);
  // Nothing of the story shows in the file, not even its title.
  assert.doesNotMatch(file, /pier|leaned|jpeg/);
  assert.deepEqual(await openEntry(key, 'aaaa.locked', file), entry);
  // A story's file copied over another story's file refuses to open there.
  await assert.rejects(openEntry(key, 'bbbb.locked', file));
  // A wrong key or a changed byte refuses to open.
  await assert.rejects(openEntry(await importKey(await deriveKey('wrong', params)), 'aaaa.locked', file));
  const tampered = file.replace(/"data":"(.)/, (_m, c) => `"data":"${c === 'A' ? 'B' : 'A'}`);
  await assert.rejects(openEntry(key, 'aaaa.locked', tampered));
  assert.match(newEntryName(), /^[0-9a-f]{24}\.locked$/);
});

test('a story sealed in the older form still opens, under any name', async () => {
  const { raw } = await newParams('salt and smoke');
  const key = await importKey(raw);
  const entry = { title: 'An old one', created: 1, modified: 2, text: 'Kept.', picture: null };
  const old = JSON.stringify({ immersion: 'vault', v: 1, sealed: await sealText(key, JSON.stringify(entry)) });
  assert.deepEqual(await openEntry(key, 'cccc.locked', old), entry);
});

test('key settings outside sane bounds are refused before any work is done', async () => {
  const { params } = await newParams('salt and smoke');
  await assert.rejects(deriveKey('salt and smoke', { ...params, memory: 64 * 1024 * 1024 }), /memory/);
  await assert.rejects(deriveKey('salt and smoke', { ...params, passes: 0 }), /passes/);
  await assert.rejects(deriveKey('salt and smoke', { ...params, lanes: Number.NaN }), /lanes/);
});

test('a story is sealed to its world, and the world line cannot be rewritten', async () => {
  const { raw } = await newParams('salt and smoke');
  const key = await importKey(raw);
  const entry = { title: 'Low tide', created: 1, modified: 2, text: 'Out past the bar.', picture: null };
  const file = await sealEntry(key, 'w1', 'aaaa.locked', entry);
  assert.equal(sealedIn(file), 'w1');
  // Someone moving the file into another world cannot make it claim that world.
  await assert.rejects(openEntry(key, 'aaaa.locked', file.replace('"world":"w1"', '"world":"w2"')));
});

test('a story sealed to its file name alone, the form of one day, still opens', async () => {
  const { raw } = await newParams('salt and smoke');
  const key = await importKey(raw);
  const entry = { title: 'One day', created: 1, modified: 2, text: 'Kept.', picture: null };
  const v2 = JSON.stringify({ immersion: 'vault', v: 2, sealed: await sealText(key, JSON.stringify(entry), 'dddd.locked') });
  assert.deepEqual(await openEntry(key, 'dddd.locked', v2), entry);
  assert.equal(sealedIn(v2), null);
});
