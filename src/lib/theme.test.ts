import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, palette } from './theme.ts';

test('a theme made from two colors keeps its text, names, and labels readable', () => {
  for (const spec of [
    { base: '#1d3f8f', highlight: '#f5c518' },
    { base: '#2aa3a6', highlight: '#f19e2b' },
    { base: '#e0d8ff', highlight: '#ffe0e0' },
    { base: '#808080', highlight: '#300000' },
  ]) {
    const p = palette(spec);
    assert.ok(contrast(p['--text'], p['--bg']) >= 12, `text on ${spec.base}`);
    assert.ok(contrast(p['--accent'], p['--bg']) >= 6, `names on ${spec.base}`);
    assert.ok(contrast(p['--structure'], p['--bg']) >= 4.5, `labels on ${spec.base}`);
    assert.ok(contrast(p['--muted'], p['--bg']) >= 4.5, `quiet text on ${spec.base}`);
  }
});

test('a chosen background and text color are kept as chosen', () => {
  const p = palette({ base: '#1d3f8f', highlight: '#f5c518', background: '#101820', text: '#fafafa' });
  assert.equal(p['--bg'], '#101820');
  assert.equal(p['--text'], '#fafafa');
});
