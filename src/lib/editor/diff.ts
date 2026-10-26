/**
 * The smallest single change that turns `before` into `after`: the stretch between their
 * common start and their common end. An outside edit applied this way leaves the cursor
 * and the scroll where they were, unless the edit touches the very place the cursor is
 * (Mike, October 26).
 */
export function smallestChange(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) return null;
  let start = 0;
  const limit = Math.min(before.length, after.length);
  while (start < limit && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let end = 0;
  while (end < limit - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}
