/**
 * Joins two sets of edits made to the same text. The writer types in the app while
 * another program, such as a Git pull or an assistant working in the same folder, edits
 * the file on disk. When the two touched different lines, both edits are kept and nobody
 * is asked anything. When they touched the same lines, the answer is null and the writer
 * chooses.
 *
 * The text is compared line by line, and a paragraph of prose is one line. A line that
 * neither side touched is an anchor. Between two anchors, a stretch that only one side
 * changed takes that side's version.
 */

/** Past this many differing lines the comparison costs too much, so the writer is asked. */
const LIMIT = 4000;

/** For each line of `a`, the line of `b` it pairs with in their longest common run, or -1. */
function pairs(a: string[], b: string[]): Int32Array {
  const match = new Int32Array(a.length).fill(-1);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    match[start] = start;
    start++;
  }
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) {
    match[a.length - 1 - end] = b.length - 1 - end;
    end++;
  }
  const n = a.length - start - end;
  const m = b.length - start - end;
  if (n === 0 || m === 0) return match;
  // Longest common subsequence over the middle that differs.
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[start + i] === b[start + j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      match[start + i] = start + j;
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
    else j++;
  }
  return match;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

/**
 * The text that holds both `mine` and `theirs`, where each began as `base`. Null when
 * both changed the same lines in different ways.
 */
export function merge3(base: string, mine: string, theirs: string): string | null {
  if (mine === theirs || theirs === base) return mine;
  if (mine === base) return theirs;
  const b = base.split('\n');
  const m = mine.split('\n');
  const t = theirs.split('\n');
  if (b.length > LIMIT || m.length > LIMIT || t.length > LIMIT) return null;
  const inMine = pairs(b, m);
  const inTheirs = pairs(b, t);

  const out: string[] = [];
  let bi = 0;
  let mi = 0;
  let ti = 0;
  // Takes the stretch before an anchor from whichever side changed it.
  const stretch = (bEnd: number, mEnd: number, tEnd: number): boolean => {
    const was = b.slice(bi, bEnd);
    const mineNow = m.slice(mi, mEnd);
    const theirsNow = t.slice(ti, tEnd);
    if (same(mineNow, was)) out.push(...theirsNow);
    else if (same(theirsNow, was) || same(mineNow, theirsNow)) out.push(...mineNow);
    else return false;
    return true;
  };
  for (let k = 0; k < b.length; k++) {
    if (inMine[k] < 0 || inTheirs[k] < 0) continue;
    if (!stretch(k, inMine[k], inTheirs[k])) return null;
    out.push(b[k]);
    bi = k + 1;
    mi = inMine[k] + 1;
    ti = inTheirs[k] + 1;
  }
  if (!stretch(b.length, m.length, t.length)) return null;
  return out.join('\n');
}
