import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readElement, readKind } from './elements.ts';
import { cardOf } from './card.ts';

const gear = readKind(
  'gear',
  '---\nname: Gear\nplural: Gear\nfields:\n  - { key: prerequisite, label: Prerequisite, type: line }\n  - { key: flavor, label: Flavor, type: text }\n  - { key: rules, label: Rules, type: list }\n  - { key: consequences, label: Consequences, type: list }\n  - { key: darkened_flavor, label: "Flavor (Darkened)", type: text }\n  - { key: darkened_rules, label: "Rules (Darkened)", type: list }\n  - { key: recovery, label: Recovery, type: text }\nlayout: [ flavor, rules, body ]\n---\n',
);
const keyword = readKind('keyword', '---\nname: Keyword\nplural: Keywords\nfields:\n  - { key: reminder, label: Reminder, type: line }\n---\n');

test('an aspect reads as a card with a lit face and a darkened face', () => {
  const lamp = readElement(
    'elements/gear/storm-lamp.md',
    '---\nname: Storm Lamp\nkind: gear\ntags: [ harbor, gear, tool ]\nflavor: A brass lamp with a shutter.\nrules:\n  - "**Tool**."\n  - "**Legal**."\nconsequences: [ "**8:** Someone answers your light." ]\ndarkened_flavor: The lamp is cold.\nrecovery: A flask of oil.\n---\n\nThe page, which the card does not hold.\n',
  );
  const card = cardOf(lamp, gear)!;
  assert.equal(card.name, 'Storm Lamp');
  assert.equal(card.kind, 'Gear');
  assert.deepEqual(card.tags, ['harbor', 'tool'], "the kind's own tag is left off, since the card names the kind");
  assert.deepEqual(card.lit, { flavor: 'A brass lamp with a shutter.', rules: ['**Tool**.', '**Legal**.'], consequences: ['**8:** Someone answers your light.'] });
  assert.deepEqual(card.dark, { flavor: 'The lamp is cold.', rules: [], consequences: [] });
  assert.equal(card.recovery, 'A flask of oil.');
  assert.equal(card.hasDark, true);
});

test('an aspect with nothing darkened has one face, and a keyword has no card', () => {
  const rope = readElement('elements/gear/rope.md', '---\nname: Rope\nkind: gear\nrules: "One line\\nAnother"\n---\n');
  const card = cardOf(rope, gear)!;
  assert.equal(card.hasDark, false);
  assert.deepEqual(card.lit.rules, ['One line', 'Another'], 'rules typed as one text read line by line');
  const trouble = readElement('elements/keyword/trouble.md', '---\nname: Trouble\nkind: keyword\n---\n');
  assert.equal(cardOf(trouble, keyword), null);
  assert.equal(cardOf(trouble, null), null);
});
