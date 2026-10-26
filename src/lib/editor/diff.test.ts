import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smallestChange } from './diff.ts';

test('an outside edit changes only the stretch that differs', () => {
  const before = 'line one\nline two\nline three';
  // A date added at the top leaves the rest of the page where it was.
  assert.deepEqual(smallestChange(before, '---\nwhen: 1985\n---\n' + before), { from: 0, to: 0, insert: '---\nwhen: 1985\n---\n' });
  assert.deepEqual(smallestChange(before, 'line one\nline 2\nline three'), { from: 14, to: 17, insert: '2' });
  assert.deepEqual(smallestChange('aaa', 'aa'), { from: 2, to: 3, insert: '' });
  assert.equal(smallestChange(before, before), null);
  // Applying the change always gives the new text.
  for (const [a, b] of [['abcabc', 'abc'], ['x', 'xyx'], ['', 'new'], ['old', '']]) {
    const c = smallestChange(a, b)!;
    assert.equal(a.slice(0, c.from) + c.insert + a.slice(c.to), b);
  }
});
