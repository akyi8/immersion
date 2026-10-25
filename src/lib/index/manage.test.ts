import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryFs } from '../fs/memory.ts';
import { archiveEntry, moveEntry, renameEntry, withAlias, withTitle } from './manage.ts';

const entry = (id: string, name: string) => ({ id, name, aliases: [], category: 'people', body: '', summary: '', imagePath: null });

test('an old name becomes an alias in the form the entry already uses', () => {
  assert.equal(withAlias('# Rook\n\n**Aliases:** Tomas\n', 'Rook'), '# Rook\n\n**Aliases:** Tomas, Rook\n');
  assert.equal(withAlias('# Tomas\n\nText.\n', 'Rook'), '---\naliases:\n  - Rook\n---\n\n# Tomas\n\nText.\n');
  assert.equal(withAlias('---\naliases: [Rook]\n---\n# T\n', 'rook'), '---\naliases: [Rook]\n---\n# T\n');
});

test('the title heading follows the new name', () => {
  assert.equal(withTitle('---\nx: 1\n---\n# Old\n\nText.\n', 'Old', 'New'), '---\nx: 1\n---\n# New\n\nText.\n');
  assert.equal(withTitle('Text only.\n', 'Old', 'New'), '# New\n\nText only.\n');
});

test('renaming moves the file and picture and keeps the old name as an alias', async () => {
  const fs = new MemoryFs({ 'wiki/people/rook.md': '# Rook\n\nA smuggler.\n', 'wiki/people/rook.jpg': 'img' });
  const path = await renameEntry(fs, entry('wiki/people/rook.md', 'Rook'), 'Tomas Reyes');
  assert.equal(path, 'wiki/people/tomas-reyes.md');
  assert.equal(await fs.exists('wiki/people/rook.md'), false);
  assert.equal(await fs.exists('wiki/people/tomas-reyes.jpg'), true);
  assert.equal(await fs.readText(path), '---\naliases:\n  - Rook\n---\n\n# Tomas Reyes\n\nA smuggler.\n');
});

test('moving and archiving keep the file and its picture together', async () => {
  const fs = new MemoryFs({ 'wiki/people/wren.md': '# Wren\n', 'wiki/people/wren.png': 'img', 'wiki/places/.keep': '' });
  const moved = await moveEntry(fs, entry('wiki/people/wren.md', 'Wren'), 'wiki/places');
  assert.equal(moved, 'wiki/places/wren.md');
  assert.equal(await fs.exists('wiki/places/wren.png'), true);
  const archived = await archiveEntry(fs, entry(moved, 'Wren'), 'wiki');
  assert.equal(archived, 'wiki/archive/places/wren.md');
  assert.equal(await fs.exists('wiki/archive/places/wren.png'), true);
});
