import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatmapWeeks, levelOf, totals } from './activity.ts';

// Saturday, October 24, 2026.
const today = new Date(2026, 9, 24);
const activity = { days: [['2026-10-19', 300], ['2026-10-24', 100], ['2026-09-01', 2000]] as [string, number][], uncommitted: 50 };

test('weeks run Monday to Sunday and end with the week holding today', () => {
  const weeks = heatmapWeeks(activity, today, 2);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[1][0].date, '2026-10-19');
  assert.equal(weeks[1][0].level, 2);
  assert.equal(weeks[1][5].date, '2026-10-24');
  assert.equal(weeks[1][5].words, 150);
  assert.equal(weeks[1][6].future, true);
  assert.equal(weeks[0][0].date, '2026-10-12');
});

test('shades use fixed thresholds', () => {
  assert.deepEqual([0, 1, 249, 250, 749, 750, 1499, 1500, 9000].map(levelOf), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('totals count today, the week, and the year', () => {
  assert.deepEqual(totals(activity, today), { today: 150, week: 450, year: 2450 });
});
