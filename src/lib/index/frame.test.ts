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

test('a name splits into its first word and the rest', () => {
  assert.deepEqual(spineName('Lou Lewandowski'), { main: 'Lou', rest: 'Lewandowski' });
  assert.deepEqual(spineName('The Chantry of Pain'), { main: 'The Chantry', rest: 'of Pain' });
  assert.deepEqual(spineName('Harrowgate'), { main: 'Harrowgate', rest: '' });
  assert.deepEqual(spineName('Marta "Wren" Okafor'), { main: 'Marta', rest: '"Wren" Okafor' });
  assert.deepEqual(spineName('The Docks'), { main: 'The Docks', rest: '' });
});
