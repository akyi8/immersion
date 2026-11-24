/**
 * Bold, italic, and underline on one line of markdown (Cerys, November 24).
 *
 * A mark is toggled on the words, not on the asterisks. The line is read into its plain
 * characters and, for each one, whether the mark is on. The toggle changes that for the
 * chosen characters, and the line is written out again with the marks placed afresh. So
 * a selection that is partly bold becomes wholly bold with one pair of marks around it,
 * pressing again takes the bold off the same words, and taking the bold off the middle of
 * a bold phrase leaves the two ends bold. Marks never pile up beside older marks.
 *
 * Asterisks run together where text is both bold and italic. Three in a row are one
 * bold mark and one italic mark, and each toggle reads only its own.
 */
export interface Line {
  /** The line's characters with this mark's own marks taken out. */
  chars: string[];
  /** Whether the mark is on for each character. */
  on: boolean[];
  /** Where each character stood in the line as it was. */
  at: number[];
}

type Token = { text: string; at: number; mark?: 'open' | 'close' };

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

/** Splits a line into plain text and this mark's own marks. */
function tokens(line: string, mark: string, close: string): Token[] {
  const out: Token[] = [];
  let on = false;
  const plain = (text: string, at: number) => {
    for (let i = 0; i < text.length; i++) out.push({ text: text[i], at: at + i });
  };
  // A mark opens only before a word and closes only after one, as markdown reads it, so
  // a lone asterisk between spaces, or a list's bullet, is an ordinary character.
  const fits = (start: number, end: number) => (on ? !isSpace(line[start - 1]) : !isSpace(line[end]));
  const delim = (at: number, len: number) => {
    out.push({ text: line.slice(at, at + len), at, mark: on ? 'close' : 'open' });
    on = !on;
  };
  for (let i = 0; i < line.length; ) {
    if (line[i] === '\\' && i + 1 < line.length) {
      plain(line.slice(i, i + 2), i);
      i += 2;
      continue;
    }
    if (mark.includes('*')) {
      if (line[i] !== '*') {
        plain(line[i], i);
        i++;
        continue;
      }
      let run = 1;
      while (line[i + run] === '*') run++;
      const mine = mark.length; // 2 for bold, 1 for italic
      const other = 3 - mine;
      // A run of this mark's own length is this mark. A run of three is this mark and the
      // other one together. Any other run belongs to the other mark, or is plain.
      if (run === mine && fits(i, i + run)) delim(i, mine);
      else if (run === 3 && fits(i, i + run)) {
        // Opening, this mark comes first and the other's asterisks stay as text inside
        // it. Closing, the other's asterisks come first and this mark ends the stretch.
        if (!on) {
          delim(i, mine);
          plain(line.slice(i + mine, i + 3), i + mine);
        } else {
          plain(line.slice(i, i + other), i);
          delim(i + other, mine);
        }
      } else plain(line.slice(i, i + run), i);
      i += run;
      continue;
    }
    const want = on ? close : mark;
    if (line.startsWith(want, i)) {
      delim(i, want.length);
      i += want.length;
    } else {
      plain(line[i], i);
      i++;
    }
  }
  // A mark left open at the end of the line marks nothing, so it is ordinary text.
  if (on) {
    const last = out.map((t) => t.mark).lastIndexOf('open');
    const t = out[last];
    out.splice(last, 1, ...[...t.text].map((c, k) => ({ text: c, at: t.at + k })));
  }
  return out;
}

export function readLine(line: string, mark: string, close: string = mark): Line {
  const chars: string[] = [];
  const on: boolean[] = [];
  const at: number[] = [];
  let now = false;
  for (const t of tokens(line, mark, close)) {
    if (t.mark) now = t.mark === 'open';
    else {
      chars.push(t.text);
      on.push(now);
      at.push(t.at);
    }
  }
  return { chars, on, at };
}

/** The characters of the line that a selection covers, without the space at its ends. */
export function chosen(l: Line, from: number, to: number): { first: number; last: number } | null {
  let first = l.at.findIndex((a) => a >= from);
  let last = l.at.length - 1;
  while (last >= 0 && l.at[last] >= to) last--;
  if (first < 0 || last < first) return null;
  while (first <= last && isSpace(l.chars[first])) first++;
  while (last >= first && isSpace(l.chars[last])) last--;
  return last < first ? null : { first, last };
}

/** Whether every chosen word already has the mark. */
export function allOn(l: Line, first: number, last: number): boolean {
  for (let i = first; i <= last; i++) if (!l.on[i] && !isSpace(l.chars[i])) return false;
  return true;
}

/** Writes the line out with the mark placed afresh, and says where each character now stands. */
export function writeLine(l: Line, mark: string, close: string = mark): { text: string; at: number[] } {
  const on = [...l.on];
  // A mark hugs its words: the space at either end of a marked stretch is left outside it.
  for (let i = 0; i < on.length; i++) if (on[i] && isSpace(l.chars[i]) && (!on[i - 1] || !on[i + 1])) on[i] = false;
  for (let i = on.length - 1; i >= 0; i--) if (on[i] && isSpace(l.chars[i]) && (!on[i - 1] || !on[i + 1])) on[i] = false;
  // A marked stretch with no words in it is no stretch: what is left when the bold comes off
  // words that are also italic is the italic's own asterisks, which need no bold around them.
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || on[i - 1]) continue;
    let end = i;
    while (on[end + 1]) end++;
    if (l.chars.slice(i, end + 1).every((c) => c === '*' || isSpace(c))) for (let k = i; k <= end; k++) on[k] = false;
    i = end;
  }
  let text = '';
  const at: number[] = [];
  l.chars.forEach((c, i) => {
    if (on[i] && !on[i - 1]) text += mark;
    at.push(text.length);
    text += c;
    if (on[i] && !on[i + 1]) text += close;
  });
  return { text, at };
}

/**
 * Turns the mark on or off for the chosen part of a line. Returns the new line and where
 * the chosen words now stand in it, or null when the selection holds no words.
 */
export function setMark(line: string, from: number, to: number, value: boolean, mark: string, close: string = mark): { text: string; from: number; to: number } | null {
  const l = readLine(line, mark, close);
  const range = chosen(l, from, to);
  if (!range) return null;
  for (let i = range.first; i <= range.last; i++) l.on[i] = value;
  const out = writeLine(l, mark, close);
  return { text: out.text, from: out.at[range.first], to: out.at[range.last] + l.chars[range.last].length };
}
