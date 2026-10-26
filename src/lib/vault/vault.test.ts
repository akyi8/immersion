import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, importKey, keyFits, newParams } from './crypto.ts';
import { newEntryName, openEntry, sealEntry } from './entries.ts';

test('a passphrase opens its vault and no other passphrase does', async () => {
  const { params, raw } = await newParams('salt and smoke');
  assert.equal(await keyFits(raw, params), true);
  assert.equal(await keyFits(await deriveKey('salt and smoke', params), params), true);
  assert.equal(await keyFits(await deriveKey('salt and smoke ', params), params), false);

  const key = await importKey(raw);
  const entry = { title: 'The night on the pier', created: 1, modified: 2, text: 'She leaned in.', picture: 'data:image/jpeg;base64,AAAA' };
  const file = await sealEntry(key, entry);
  // Nothing of the story shows in the file, not even its title.
  assert.doesNotMatch(file, /pier|leaned|jpeg/);
  assert.deepEqual(await openEntry(key, file), entry);
  // A wrong key or a changed byte refuses to open.
  await assert.rejects(openEntry(await importKey(await deriveKey('wrong', params)), file));
  const tampered = file.replace(/"data":"(.)/, (_m, c) => `"data":"${c === 'A' ? 'B' : 'A'}`);
  await assert.rejects(openEntry(key, tampered));
  assert.match(newEntryName(), /^[0-9a-f]{24}\.locked$/);
});
