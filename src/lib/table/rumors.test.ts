import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rumorsIn, setStanding } from './rumors.ts';

const page = ['We rode to Imber.', '', '> [!rumor]', "> The bear has a man's eyes.", '> Dana thinks it is a knight.', '', '> [!narrator]', '> It is only a bear.', '', '> [!rumor] false', '> The Earl will marry a Saxon.', '', '> A plain quote.', ''].join('\n');

test('rumors are found with how they stand', () => {
  assert.deepEqual(rumorsIn(page), [
    { text: "The bear has a man's eyes. Dana thinks it is a knight.", standing: 'open', line: 2 },
    { text: 'The Earl will marry a Saxon.', standing: 'false', line: 9 },
  ]);
});

test('a rumor is settled and reopened on its tag line', () => {
  const settled = setStanding(page, 2, 'confirmed')!;
  assert.equal(settled.split('\n')[2], '> [!rumor] confirmed');
  assert.equal(rumorsIn(settled)[0].standing, 'confirmed');
  assert.equal(setStanding(settled, 2, 'open'), page);
  assert.equal(setStanding(page, 0, 'false'), null);
});

test('a rumor written on its tag line keeps its text when settled', () => {
  const one = '> [!rumor] The well is poisoned.\n';
  assert.deepEqual(rumorsIn(one), [{ text: 'The well is poisoned.', standing: 'open', line: 0 }]);
  const settled = setStanding(one, 0, 'false')!;
  assert.equal(settled, '> [!rumor] false\n> The well is poisoned.\n');
  assert.equal(rumorsIn(settled)[0].text, 'The well is poisoned.');
});

test('a narrator secret straight after a rumor is not part of it', () => {
  const both = '> [!rumor]\n> Eyes.\n> [!narrator]\n> The truth.\n';
  assert.deepEqual(rumorsIn(both).map((r) => r.text), ['Eyes.']);
});
