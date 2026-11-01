import type { EditorView } from '@codemirror/view';

/**
 * Where typing starts in a chapter (Mike, November 1). Clicking the empty page below the
 * writing, or the "Start writing here" line in a chapter that has only its beat, puts
 * the cursor at the end of the chapter. Typing must land on a line of its own, never
 * inside the beat's quote or a heading, so a blank line is added first when needed.
 */
export function writingSpot(text: string): { insert: string; at: number } {
  const lines = text.split('\n');
  const last = lines[lines.length - 1];
  const before = lines.length > 1 ? lines[lines.length - 2] : '';
  const fenced = (line: string) => /^\s*>/.test(line) || /^#{1,6}\s/.test(line);
  if (last.trim() !== '') return fenced(last) ? { insert: '\n\n', at: text.length + 2 } : { insert: '', at: text.length };
  // A line right after a quote would join the quote, so it needs a blank line between.
  if (/^\s*>/.test(before)) return { insert: '\n', at: text.length + 1 };
  return { insert: '', at: text.length };
}

/** True when a chapter holds nothing but its header, headings, and beats. */
export function hasNoProse(text: string): boolean {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return body.split('\n').every((line) => line.trim() === '' || /^\s*>/.test(line) || /^#{1,6}\s/.test(line));
}

/** Puts the cursor where the writing continues, and focuses the editor. */
export function startWriting(view: EditorView) {
  const text = view.state.doc.toString();
  const { insert, at } = writingSpot(text);
  view.dispatch({
    changes: insert ? { from: text.length, insert } : undefined,
    selection: { anchor: at },
    scrollIntoView: true,
  });
  view.focus();
}
