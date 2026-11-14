import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { createAdventure, createCampaign, createSession, lastWords, readTable, sessionOf, setFacts } from './index.ts';

test('a campaign is made, filled, and read back', async () => {
  const fs = new MemoryFs({ 'world.md': '# W\n' });
  assert.deepEqual(await readTable(fs), []);
  await createCampaign(fs, { name: 'The Salt Ledger', role: 'gm', game: 'other', system: 'Pendragon' });
  let [c] = await readTable(fs);
  assert.equal(c.path, 'table/the-salt-ledger');
  assert.deepEqual([c.name, c.role, c.game, c.system], ['The Salt Ledger', 'gm', 'other', 'Pendragon']);
  await createAdventure(fs, c, 'The Year 485');
  [c] = await readTable(fs);
  const stem = await createSession(fs, c, c.adventures[0], 'The Bear Hunt', '2026-11-19');
  assert.equal(stem, 'table/the-salt-ledger/the-year-485/the-bear-hunt');
  await setFacts(fs, `${stem}.log.md`, { when: 'Spring, 485', table: ['Mike', 'Dana'] });
  [c] = await readTable(fs);
  const s = c.adventures[0].sessions[0];
  assert.deepEqual([s.name, s.played, s.when, s.people, s.log, s.plan], ['The Bear Hunt', '2026-11-19', 'Spring, 485', ['Mike', 'Dana'], `${stem}.log.md`, `${stem}.plan.md`]);
  // The next session starts from the last one's date in the game and its table.
  const next = await createSession(fs, c, c.adventures[0], 'The Barrow', '2026-11-26');
  [c] = await readTable(fs);
  assert.deepEqual(c.adventures[0].sessions.map((x) => x.name), ['The Bear Hunt', 'The Barrow']);
  assert.equal(c.adventures[0].sessions[1].when, 'Spring, 485');
  assert.equal(sessionOf([c], `${next}.plan.md`)?.session.name, 'The Barrow');
});

test("a player's session has no plan, and a second adventure follows the first", async () => {
  const fs = new MemoryFs({});
  await createCampaign(fs, { name: 'Knights', role: 'player', game: 'other', system: '' });
  let [c] = await readTable(fs);
  await createAdventure(fs, c, 'Zeta first');
  [c] = await readTable(fs);
  await createAdventure(fs, c, 'Alpha second');
  [c] = await readTable(fs);
  assert.deepEqual(c.adventures.map((a) => a.name), ['Zeta first', 'Alpha second']);
  await createSession(fs, c, c.adventures[0], 'One', '2026-11-19');
  [c] = await readTable(fs);
  assert.equal(c.adventures[0].sessions[0].plan, null);
});

test('where a session ended is its last plain paragraph', () => {
  const log = '---\nname: One\n---\n\nWe rode out.\n\nThe bear is dead.\n\n> [!rumor]\n> It had eyes.\n';
  assert.equal(lastWords(log), 'The bear is dead.');
  assert.equal(lastWords('---\nname: One\n---\n'), '');
});
