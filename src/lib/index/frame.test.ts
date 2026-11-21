import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFrame, writeFrame, dragged, defaultShape, readShape, CENTERED, spineName } from './frame.ts';

test('a frame reads and writes as across, down, and zoom', () => {
  assert.deepEqual(readFrame('50 30 1.4'), { x: 50, y: 30, zoom: 1.4 });
  assert.deepEqual(readFrame('20, 80'), { x: 20, y: 80, zoom: 1 });
  assert.equal(writeFrame({ x: 50, y: 30, zoom: 1.4 }), '50 30 1.4');
  assert.equal(writeFrame(CENTERED), undefined);
  assert.equal(readFrame('soon'), null);
  assert.equal(readFrame(undefined), null);
});

test('a frame stays inside the picture and the zoom range', () => {
  assert.deepEqual(readFrame('-10 140 9'), { x: 0, y: 100, zoom: 4 });
  assert.deepEqual(readFrame('50 50 0.5'), { x: 50, y: 50, zoom: 1 });
});

test('dragging moves the picture with the pointer', () => {
  // A square picture in a wide box overflows only downward: 400 wide covers 400 tall in a 400 by 200 box.
  const box = { width: 400, height: 200 };
  const picture = { width: 1000, height: 1000 };
  const moved = dragged(CENTERED, 30, 50, box, picture);
  assert.equal(moved.x, 50, 'nothing to pan across');
  assert.equal(moved.y, 25, 'dragging down 50 of 200 spare pixels shows more of the top');
});

test('people are portraits and everything else is a banner, unless an entry says otherwise', () => {
  assert.equal(defaultShape('people'), 'portrait');
  assert.equal(defaultShape('places'), 'banner');
  assert.equal(readShape('banner'), 'banner');
  assert.equal(readShape('poster'), null);
});

test("the world's choice of shape stands in for the category's", () => {
  assert.equal(defaultShape('people'), 'portrait');
  assert.equal(defaultShape('places'), 'banner');
  assert.equal(defaultShape('people', 'behind'), 'behind');
  assert.equal(defaultShape('places', 'portrait'), 'portrait');
});

const spine = (name: string, chosen: string | null = null) => {
  const s = spineName(name, chosen);
  return [s.main, s.rest];
};

test('the spine guesses which word stands large', () => {
  assert.deepEqual(spine('Ada Varga'), ['Ada', 'Varga']);
  assert.deepEqual(spine('Harrowgate'), ['Harrowgate', '']);
  // A nickname in quotes wins, and shows without its quotes.
  assert.deepEqual(spine('Marta "Wren" Okafor'), ['Wren', 'Marta Okafor']);
  assert.deepEqual(spine('Signe “Doll” Halvorsen'), ['Doll', 'Signe Halvorsen']);
  // Titles and joining words never win, and an article rides with the word after it.
  assert.deepEqual(spine('Sister Agnes'), ['Agnes', 'Sister']);
  assert.deepEqual(spine('Earl of Saltmere'), ['Saltmere', 'Earl of']);
  assert.deepEqual(spine('The Chantry of Pain'), ['The Chantry', 'of Pain']);
  assert.deepEqual(spine('The Docks'), ['The Docks', '']);
  assert.deepEqual(spine('Sir'), ['Sir', '']);
});

test("the writer's choice of word beats the guess", () => {
  assert.deepEqual(spine('Ada Varga', 'Varga'), ['Varga', 'Ada']);
  assert.deepEqual(spine('Marta "Wren" Okafor', 'okafor'), ['Okafor', 'Marta Wren']);
  assert.deepEqual(spine('The Chantry of Pain', 'Pain'), ['Pain', 'The Chantry of']);
  // A word the name no longer has falls back to the guess.
  assert.deepEqual(spine('Ada Varga', 'Kowalski'), ['Ada', 'Varga']);
});

test('a click can choose any word but an article or a joining word', () => {
  const s = spineName('The Chantry of Pain');
  assert.deepEqual(s.words.map((w) => [w.text, w.big, w.choice]), [['The', true, false], ['Chantry', true, true], ['of', false, false], ['Pain', false, true]]);
  assert.equal(s.guess, 'Chantry');
  assert.equal(spineName('Sister Agnes').words[0].choice, true);
});

test('more than one word can stand large', () => {
  assert.deepEqual(spine('The Salt Market', 'Salt Market'), ['The Salt Market', '']);
  assert.deepEqual(spine('Marta "Wren" Okafor', 'Marta Okafor'), ['Marta Okafor', 'Wren']);
  // A joining word between two large words rides with them.
  assert.deepEqual(spine('The Chantry of Pain', 'Chantry Pain'), ['The Chantry of Pain', '']);
  assert.deepEqual(spine('Ada Varga the Younger', 'Ada Younger'), ['Ada the Younger', 'Varga']);
});
