/**
 * The outline lives inside the manuscript (Mike, October 25): each chapter's heading is
 * followed by a folded `> [!outline]-` callout holding what happens in that chapter.
 * The outline and the manuscript are therefore one list of chapters, and an outline can
 * never point at a chapter that is gone. Obsidian shows the callout folded shut, the
 * writing view hides it, and outline view shows each chapter as a card.
 *
 * A chapter can hold one outline beat per thread (Mike, October 25), such as the main
 * plot and a character's arc. Each beat is its own callout under the heading, labelled
 * with its thread: `> [!outline]- Mara's arc`. A callout with no label belongs to the
 * main thread, so an outline written before threads existed is the main plot's beat.
 */

/** One thread's beat in a chapter. The main thread's key is ''. */
export interface Beat {
  thread: string;
  text: string;
}

/** A chapter as outline view sees it. Offsets are into the text it was read from. */
export interface OutlineChapter {
  title: string;
  /** Where the chapter's heading line starts. */
  offset: number;
  /** The heading's level: 2 for chapters under a title, 1 when chapters are top headings. */
  level: number;
  /** The main thread's beat. */
  outline: string;
  /** Every thread's beat, in the order they appear. */
  beats: Beat[];
}

const OUTLINE_START = /^>\s*\[!outline\][-+]?[ \t]*(.*?)\s*$/i;

interface Line {
  text: string;
  from: number;
  to: number;
}

function linesOf(text: string): Line[] {
  const out: Line[] = [];
  let from = 0;
  for (const t of text.split('\n')) {
    out.push({ text: t, from, to: from + t.length });
    from += t.length + 1;
  }
  return out;
}

interface Block {
  start: number;
  end: number;
  thread: string;
}

/** The outline callouts under the heading on line `h`, one per thread, as line numbers. */
function outlineBlocks(lines: Line[], h: number): Block[] {
  const out: Block[] = [];
  let i = h + 1;
  for (;;) {
    while (i < lines.length && lines[i].text.trim() === '') i++;
    const m = i < lines.length ? OUTLINE_START.exec(lines[i].text) : null;
    if (!m) return out;
    let end = i;
    while (end + 1 < lines.length && /^>/.test(lines[end + 1].text)) end++;
    out.push({ start: i, end, thread: m[1].trim() });
    i = end + 1;
  }
}

function blockText(lines: Line[], block: Block): string {
  return lines
    .slice(block.start + 1, block.end + 1)
    .map((l) => l.text.replace(/^>\s?/, ''))
    .join('\n')
    .trim();
}

function beatsAt(lines: Line[], h: number): Beat[] {
  return outlineBlocks(lines, h).map((b) => ({ thread: b.thread, text: blockText(lines, b) }));
}

function chapterLevel(lines: Line[]): number {
  const tops = lines.filter((l) => /^#\s/.test(l.text)).length;
  return tops > 1 ? 1 : 2;
}

/** Every chapter in a manuscript, with its outline text. Fenced code is skipped. */
export function readOutline(text: string): OutlineChapter[] {
  const lines = linesOf(text);
  const level = chapterLevel(lines);
  const out: OutlineChapter[] = [];
  let fenced = false;
  lines.forEach((line, n) => {
    if (/^\s*(```|~~~)/.test(line.text)) fenced = !fenced;
    const m = !fenced && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.text);
    if (!m || m[1].length !== level) return;
    const beats = beatsAt(lines, n);
    out.push({ title: m[2].trim(), offset: line.from, level, outline: beats.find((b) => b.thread === '')?.text ?? '', beats });
  });
  return out;
}

function headingLine(lines: Line[], offset: number): number {
  const n = lines.findIndex((l) => l.from === offset);
  if (n < 0) throw new Error('That chapter has moved. Open the outline again.');
  return n;
}

/** Sets the main thread's outline under the chapter heading at `offset`. */
export function setOutline(text: string, offset: number, outline: string): string {
  return setBeat(text, offset, '', outline);
}

/** Sets one thread's beat under the chapter heading at `offset`. Empty text removes it. */
export function setBeat(text: string, offset: number, thread: string, beat: string): string {
  const lines = linesOf(text);
  const h = headingLine(lines, offset);
  const blocks = outlineBlocks(lines, h);
  const k = blocks.findIndex((b) => b.thread === thread);
  const body = beat.trim();
  const callout = body ? [`> [!outline]-${thread ? ` ${thread}` : ''}`, ...body.split('\n').map((l) => (l.trim() ? `> ${l}` : '>'))].join('\n') : '';
  if (k >= 0) {
    const block = blocks[k];
    // Replace the old callout, or remove it with the blank lines before it.
    const from = callout ? lines[block.start].from : k === 0 ? lines[h].to : lines[blocks[k - 1].end].to;
    return text.slice(0, from) + callout + text.slice(lines[block.end].to);
  }
  if (!callout) return text;
  const at = blocks.length ? lines[blocks[blocks.length - 1].end].to : lines[h].to;
  return `${text.slice(0, at)}\n\n${callout}${text.slice(at).startsWith('\n\n') ? '' : '\n'}${text.slice(at)}`;
}

/** Renames a thread in every chapter of a text. */
export function renameThreadIn(text: string, from: string, to: string): string {
  return text
    .split('\n')
    .map((line) => {
      const m = OUTLINE_START.exec(line);
      return m && m[1].trim() === from ? `> [!outline]-${to ? ` ${to}` : ''}` : line;
    })
    .join('\n');
}

/** Removes a thread's beats from every chapter of a text. */
export function removeThreadIn(text: string, thread: string): string {
  let out = text;
  for (;;) {
    const lines = linesOf(out);
    let changed = false;
    for (let n = 0; n < lines.length && !changed; n++) {
      if (!/^#{1,6}\s/.test(lines[n].text)) continue;
      if (outlineBlocks(lines, n).some((b) => b.thread === thread)) {
        out = setBeat(out, lines[n].from, thread, '');
        changed = true;
      }
    }
    if (!changed) return out;
  }
}

/** Renames the chapter heading at `offset`, keeping its level. */
export function renameChapter(text: string, offset: number, title: string): string {
  const lines = linesOf(text);
  const h = headingLine(lines, offset);
  const hashes = /^#+/.exec(lines[h].text)![0];
  return text.slice(0, lines[h].from) + `${hashes} ${title.trim()}` + text.slice(lines[h].to);
}

/**
 * Adds a chapter. It goes after the last numbered chapter, so back matter such as
 * "About the Author" stays at the end, or at the very end when no chapter is numbered.
 * Returns the new text and where the new heading starts.
 */
export function addChapter(text: string, title: string): { text: string; offset: number } {
  const chapters = readOutline(text);
  const level = chapters[0]?.level ?? chapterLevel(linesOf(text));
  const heading = `${'#'.repeat(level)} ${title.trim()}`;
  const numbered = chapters.filter((c) => /^(chapter|part)\b|^\d/i.test(c.title));
  const after = numbered.at(-1);
  const next = after ? chapters[chapters.indexOf(after) + 1] : undefined;
  if (next) {
    // An empty line between blank lines gives the new chapter somewhere to type.
    const before = text.slice(0, next.offset).replace(/\s*$/, '');
    const inserted = `${before}\n\n${heading}\n\n\n\n`;
    return { text: inserted + text.slice(next.offset), offset: before.length + 2 };
  }
  const before = text.replace(/\s*$/, '');
  return { text: `${before}\n\n${heading}\n\n`, offset: before.length + 2 };
}

/** The next chapter's title, continuing "Chapter 11" as "Chapter 12", or "Part 3" as "Part 4". */
export function nextChapterTitle(chapters: { title: string }[], word = 'Chapter'): string {
  const named = new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)\\b`, 'i');
  let highest = 0;
  for (const c of chapters) {
    const m = named.exec(c.title);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${word} ${highest ? highest + 1 : chapters.length + 1}`;
}

/** Removes outline callouts, for counting the words a reader would read. */
export function withoutOutlines(text: string): string {
  return text.replace(/^>\s*\[!outline\][^\n]*(\n>[^\n]*)*/gim, '');
}

/**
 * The title heading of a one-chapter file, as in a manuscript kept as a folder, where
 * each file is a chapter whose first top heading is its title.
 */
export function fileTitle(text: string): { title: string; offset: number; outline: string; beats: Beat[] } | null {
  const lines = linesOf(text);
  const h = lines.findIndex((l) => /^#\s+/.test(l.text));
  if (h < 0) return null;
  const beats = beatsAt(lines, h);
  return { title: lines[h].text.replace(/^#\s+/, '').trim(), offset: lines[h].from, outline: beats.find((b) => b.thread === '')?.text ?? '', beats };
}

/**
 * Gives a manuscript its first chapter when it has none, so its prose belongs to a
 * chapter and shows in outline view. The heading goes just after the title, or at the
 * top of the text after any header. Returns the text and where the heading starts.
 */
export function withFirstChapter(text: string): { text: string; offset: number } {
  const existing = readOutline(text);
  if (existing.length) return { text, offset: existing[0].offset };
  const lines = linesOf(text);
  let start = 0;
  if (lines[0]?.text.trim() === '---') {
    const close = lines.findIndex((l, i) => i > 0 && l.text.trim() === '---');
    if (close > 0) start = close + 1;
  }
  let i = start;
  while (i < lines.length && lines[i].text.trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i].text)) i++;
  while (i < lines.length && lines[i].text.trim() === '') i++;
  if (i >= lines.length) {
    const before = text.replace(/\s*$/, '');
    return { text: `${before}\n\n## Chapter 1\n\n`, offset: before.length + 2 };
  }
  const at = lines[i].from;
  return { text: `${text.slice(0, at)}## Chapter 1\n\n${text.slice(at)}`, offset: at };
}

/**
 * Moves the chapter at `from` to position `to`, carrying its heading, its outline, and
 * its prose with it (Mike, October 25). Whatever comes before the first chapter, such as
 * the title, stays where it is.
 */
export function moveChapter(text: string, from: number, to: number): string {
  const chapters = readOutline(text);
  if (from === to || !chapters[from] || to < 0 || to >= chapters.length) return text;
  const head = text.slice(0, chapters[0].offset).replace(/\s*$/, '');
  const blocks = chapters.map((c, i) => text.slice(c.offset, chapters[i + 1]?.offset ?? text.length).replace(/\s*$/, ''));
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return `${head ? `${head}\n\n` : ''}${blocks.join('\n\n')}\n`;
}
