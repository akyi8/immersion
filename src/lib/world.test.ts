import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeWorld, withDetails, worldFile } from './world.ts';

test('changing the details keeps the rest of world.md', () => {
  const before = `---
name: Harrowgate
# the folder Obsidian calls the bible
wiki: world-bible
tagline: A harbor town
stories: stories
---

# Harrowgate

Notes about this world.
`;
  const after = withDetails(before, { name: 'Harrowgate Deep', tagline: 'Drowned · 1890' });
  const about = describeWorld(after);
  assert.equal(about.name, 'Harrowgate Deep');
  assert.equal(about.tagline, 'Drowned · 1890');
  assert.equal(about.wikiDir, 'world-bible');
  assert.match(after, /# the folder Obsidian calls the bible/);
  assert.match(after, /^# Harrowgate Deep$/m);
  assert.match(after, /Notes about this world\.\n$/);
});

test('a world.md with no header gains one', () => {
  const after = withDetails('# Saltglass\n\nDust.\n', { name: 'Saltglass', tagline: 'Mirrors' });
  assert.equal(describeWorld(after).tagline, 'Mirrors');
  assert.match(after, /Dust\./);
});

test('a written world.md reads back the same', () => {
  const text = worldFile({ name: 'Saltglass', tagline: 'A desert: of mirrors', wikiDir: 'wiki', storiesDir: 'stories' });
  const about = describeWorld(text);
  assert.equal(about.name, 'Saltglass');
  assert.equal(about.tagline, 'A desert: of mirrors');
});
