import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allOn, chosen, readLine, setMark } from './marks.ts';

/** Toggles a mark the way the editor does, on the text between `[` and `]`. */
function toggle(marked: string, mark = '**', close = mark): string {
  const from = marked.indexOf('[');
  const to = marked.indexOf(']') - 1;
  const line = marked.replace('[', '').replace(']', '');
  const l = readLine(line, mark, close);
  const range = chosen(l, from, to)!;
  const done = setMark(line, from, to, !allOn(l, range.first, range.last), mark, close)!;
  return `${done.text.slice(0, done.from)}[${done.text.slice(done.from, done.to)}]${done.text.slice(done.to)}`;
}

test('bold goes around the chosen words and comes off again', () => {
  assert.equal(toggle('The [salt market] opens.'), 'The **[salt market]** opens.');
  assert.equal(toggle('The **[salt market]** opens.'), 'The [salt market] opens.');
});

test('a selection that is partly bold becomes wholly bold, with one pair of marks', () => {
  assert.equal(toggle('[The **salt** market opens]'), '**[The salt market opens]**');
  assert.equal(toggle('The **sa[lt** market] opens'), 'The **sa[lt market]** opens');
  assert.equal(toggle('[**Applies when** you roll, **always**]'), '**[Applies when you roll, always]**');
});

test('pressing twice clears the bold from everything chosen', () => {
  const once = toggle('[The **salt** market opens]');
  assert.equal(toggle(once), '[The salt market opens]');
});

test('taking the bold off the middle of a phrase leaves both ends bold', () => {
  assert.equal(toggle('**The [salt] market**'), '**The** [salt] **market**');
});

test('a selection that takes in the asterisks themselves is read by its words', () => {
  assert.equal(toggle('The [**salt market**] opens.'), 'The [salt market] opens.');
  assert.equal(toggle('The *[*salt market*]* opens.'), 'The [salt market] opens.');
});

test('the marks hug the words, and the space around a selection stays outside', () => {
  assert.equal(toggle('The[ salt market ]opens.'), 'The **[salt market]** opens.');
});

test('bold and italic together are read apart', () => {
  assert.equal(toggle('***[both]***'), '*[both]*');
  assert.equal(toggle('*[only italic]*'), '***[only italic]***');
  assert.equal(toggle('***[both]***', '*'), '**[both]**');
  assert.equal(toggle('**[only bold]**', '*'), '***[only bold]***');
  assert.equal(toggle('a *[plain]* word', '*'), 'a [plain] word');
});

test("a list's bullet and a lone asterisk are ordinary characters", () => {
  assert.equal(toggle('* [first] item'), '* **[first]** item');
  assert.equal(toggle('2 * 3 is [six]', '*'), '2 * 3 is *[six]*');
});

test('an asterisk pair left open marks nothing', () => {
  assert.equal(toggle('**unclosed [word] here'), '**unclosed **[word]** here');
});

test('underline uses its own pair of marks', () => {
  assert.equal(toggle('an [underlined] word', '<u>', '</u>'), 'an <u>[underlined]</u> word');
  assert.equal(toggle('an <u>[underlined]</u> word', '<u>', '</u>'), 'an [underlined] word');
  assert.equal(toggle('<u>one [two] three</u>', '<u>', '</u>'), '<u>one</u> [two] <u>three</u>');
});

test('a selection with no words in it changes nothing', () => {
  assert.equal(setMark('a   b', 1, 4, true, '**'), null);
});
