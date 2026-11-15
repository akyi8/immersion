import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { archivePath, archiveSession, createAdventure, createCampaign, createSession, lastWords, readTable, sessionOf, setFacts } from './index.ts';

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

test('archiving moves a thing out of sight and deletes nothing', async () => {
  const fs = new MemoryFs({});
  await createCampaign(fs, { name: 'C', role: 'gm', game: 'other', system: '' });
  await fs.writeText('table/c/rules/core.pdf', 'pdf');
  let c = (await readTable(fs)).find((x) => x.path === 'table/c')!;
  await createAdventure(fs, c, 'One');
  await createAdventure(fs, c, 'Two');
  c = (await readTable(fs)).find((x) => x.path === 'table/c')!;
  await createSession(fs, c, c.adventures[0], 'First', '2026-11-19');
  await createSession(fs, c, c.adventures[0], 'Second', '2026-11-26');
  c = (await readTable(fs)).find((x) => x.path === 'table/c')!;
  await archiveSession(fs, c.adventures[0].sessions[0]);
  assert.equal(await archivePath(fs, 'table/c/rules/core.pdf'), 'table/c/rules/archive/core.pdf');
  await archivePath(fs, c.adventures[1].path);
  c = (await readTable(fs)).find((x) => x.path === 'table/c')!;
  assert.deepEqual(c.adventures.map((a) => a.name), ['One']);
  assert.deepEqual(c.adventures[0].sessions.map((x) => x.name), ['Second']);
  assert.deepEqual(c.rules, []);
  assert.equal(await fs.exists('table/c/one/archive/first.log.md'), true);
  assert.equal(await fs.exists('table/c/one/archive/first.plan.md'), true);
  assert.equal(await fs.exists('table/c/archive/two/adventure.md'), true);
  await archivePath(fs, 'table/c');
  assert.equal((await readTable(fs)).some((x) => x.path === 'table/c'), false);
  assert.equal(await fs.exists('table/archive/c/campaign.md'), true);
});
