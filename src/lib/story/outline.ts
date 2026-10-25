/**
 * The outline lives inside the manuscript (Mike, October 25): each chapter's heading is
 * followed by a folded `> [!outline]-` callout holding what happens in that chapter.
 * The outline and the manuscript are therefore one list of chapters, and an outline can
 * never point at a chapter that is gone. Obsidian shows the callout folded shut, the
 * writing view hides it, and outline view shows each chapter as a card.
 */

/** A chapter as outline view sees it. Offsets are into the text it was read from. */
export interface OutlineChapter {
  title: string;
  /** Where the chapter's heading line starts. */
  offset: number;
  /** The heading's level: 2 for chapters under a title, 1 when chapters are top headings. */
  level: number;
  outline: string;
}

const OUTLINE_START = /^>\s*\[!outline\][-+]?.*$/i;

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

/** The outline callout under the heading on line `h`, as line numbers, or null. */
function outlineBlock(lines: Line[], h: number): { start: number; end: number } | null {
  let i = h + 1;
  while (i < lines.length && lines[i].text.trim() === '') i++;
  if (i >= lines.length || !OUTLINE_START.test(lines[i].text)) return null;
  let end = i;
  while (end + 1 < lines.length && /^>/.test(lines[end + 1].text)) end++;
  return { start: i, end };
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
    const block = outlineBlock(lines, n);
    const outline = block
      ? lines
          .slice(block.start + 1, block.end + 1)
          .map((l) => l.text.replace(/^>\s?/, ''))
          .join('\n')
          .trim()
      : '';
    out.push({ title: m[2].trim(), offset: line.from, level, outline });
  });
  return out;
}

function headingLine(lines: Line[], offset: number): number {
  const n = lines.findIndex((l) => l.from === offset);
  if (n < 0) throw new Error('That chapter has moved. Open the outline again.');
  return n;
}

/** Sets the outline under the chapter heading at `offset`. Empty text removes the callout. */
export function setOutline(text: string, offset: number, outline: string): string {
  const lines = linesOf(text);
  const h = headingLine(lines, offset);
  const block = outlineBlock(lines, h);
  const body = outline.trim();
  const callout = body ? ['> [!outline]-', ...body.split('\n').map((l) => (l.trim() ? `> ${l}` : '>'))].join('\n') : '';
  if (block) {
    // Replace the old callout, and the blank line after it when the callout is removed.
    const from = callout ? lines[block.start].from : lines[h].to;
    const to = lines[block.end].to;
    return text.slice(0, from) + (callout ? callout : '') + text.slice(to);
  }
  if (!callout) return text;
  const at = lines[h].to;
  return `${text.slice(0, at)}\n\n${callout}${text.slice(at).startsWith('\n\n') ? '' : '\n'}${text.slice(at)}`;
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
    const before = text.slice(0, next.offset).replace(/\s*$/, '');
    const inserted = `${before}\n\n${heading}\n\n`;
    return { text: inserted + text.slice(next.offset), offset: before.length + 2 };
  }
  const before = text.replace(/\s*$/, '');
  return { text: `${before}\n\n${heading}\n\n`, offset: before.length + 2 };
}

/** The next chapter's title, continuing "Chapter 11" as "Chapter 12". */
export function nextChapterTitle(chapters: { title: string }[]): string {
  let highest = 0;
  for (const c of chapters) {
    const m = /^chapter\s+(\d+)\b/i.exec(c.title);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return highest ? `Chapter ${highest + 1}` : chapters.length ? `Chapter ${chapters.length + 1}` : 'Chapter 1';
}

/** Removes outline callouts, for counting the words a reader would read. */
export function withoutOutlines(text: string): string {
  return text.replace(/^>\s*\[!outline\][^\n]*(\n>[^\n]*)*/gim, '');
}

/**
 * The title heading of a one-chapter file, as in a manuscript kept as a folder, where
 * each file is a chapter whose first top heading is its title.
 */
export function fileTitle(text: string): { title: string; offset: number; outline: string } | null {
  const lines = linesOf(text);
  const h = lines.findIndex((l) => /^#\s+/.test(l.text));
  if (h < 0) return null;
  const block = outlineBlock(lines, h);
  const outline = block
    ? lines
        .slice(block.start + 1, block.end + 1)
        .map((l) => l.text.replace(/^>\s?/, ''))
        .join('\n')
        .trim()
    : '';
  return { title: lines[h].text.replace(/^#\s+/, '').trim(), offset: lines[h].from, outline };
}
