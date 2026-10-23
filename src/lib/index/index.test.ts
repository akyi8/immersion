import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MentionScanner } from './scanner.ts';
import { parseEntry, nameFromFile } from './parse.ts';

const scanner = new MentionScanner([
  { text: 'Marta "Wren" Okafor', id: 'wren' },
  { text: 'Marta', id: 'wren' },
  { text: 'Wren', id: 'wren' },
  { text: 'Jonah Vale', id: 'jonah' },
  { text: 'Jonah', id: 'jonah' },
  { text: 'Rook', id: 'rook' },
  { text: 'Harrowgate', id: 'town' },
  { text: 'the narrows', id: 'town' },
]);

const named = (text: string) => scanner.find(text).map((m) => text.slice(m.start, m.end));

test('the longest overlapping name wins', () => {
  assert.deepEqual(named('the courier Marta "Wren" Okafor arrived'), ['Marta "Wren" Okafor']);
});

test('capitalized names match only with their capitalization', () => {
  assert.deepEqual(named('she moved the rook in Harrowgate'), ['Harrowgate']);
});

test('lowercase aliases match in any case', () => {
  assert.deepEqual(named('The Narrows flooded'), ['The Narrows']);
});

test('possessives match and partial words do not', () => {
  assert.deepEqual(named("Jonah's coat, Jonahville, Wrens"), ['Jonah']);
});

test('idsIn lists each entry once in order', () => {
  assert.deepEqual(scanner.idsIn('Wren met Jonah Vale. Marta laughed.'), ['wren', 'jonah']);
});

test('aliases come from the bold line and the title from the first heading', () => {
  const body = '# Marta "Wren" Okafor\n**Aliases:** Marta, Wren, Birdie\n---\n## Introduction\nMarta "Wren" Okafor carries messages nobody else will.\n';
  const e = parseEntry({}, body, 'wren-okafor.md');
  assert.equal(e.name, 'Marta "Wren" Okafor');
  assert.deepEqual(e.aliases, ['Marta', 'Wren', 'Birdie']);
  assert.equal(e.summary, 'Marta "Wren" Okafor carries messages nobody else will.');
  assert.ok(!e.body.includes('Aliases'));
});

test('a repeated title heading is dropped and field lines are skipped for the summary', () => {
  const body = '# Ilse Brandt\n\n# Ilse Brandt\n\n**Role:** The ferry captain.\n\n## First Appearance\n\nShe boards the ferry.\n';
  const e = parseEntry({}, body, 'ilse-brandt.md');
  assert.equal(e.name, 'Ilse Brandt');
  assert.ok(!e.body.startsWith('#'));
  assert.equal(e.summary, 'She boards the ferry.');
});

test('YAML aliases and names are honored', () => {
  const e = parseEntry({ name: 'Tomas Reyes', aliases: ['Rook'] }, 'A smuggler.', 'tomas-reyes.md');
  assert.equal(e.name, 'Tomas Reyes');
  assert.deepEqual(e.aliases, ['Rook']);
});

test('file names become readable names', () => {
  assert.equal(nameFromFile('the-salt-market.md'), 'The Salt Market');
});
