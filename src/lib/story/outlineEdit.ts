import type { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';
import { fileTitle, readOutline, setOutline, type OutlineChapter } from './outline';

/**
 * Reading and changing chapter outlines through an open editor, for the outline panel
 * beside the writing (Mike, October 25). Changes go into the editor's own document, so
 * the editor stays the only thing that writes the file and its autosave never races a
 * second writer.
 */

const cache = new WeakMap<Text, OutlineChapter[]>();

/**
 * The chapters in the editor's document. A manuscript kept as one file has chapter
 * headings; a chapter file of a folder manuscript is one chapter under its title heading.
 */
export function chaptersIn(view: EditorView, wholeBook: boolean): OutlineChapter[] {
  const doc = view.state.doc;
  let found = cache.get(doc);
  if (!found) {
    const text = doc.toString();
    if (wholeBook) found = readOutline(text);
    else {
      const head = fileTitle(text);
      found = head ? [{ ...head, level: 1 }] : [];
    }
    cache.set(doc, found);
  }
  return found;
}

/** The chapter that holds `pos`, with its place in the list. */
export function chapterAt(chapters: OutlineChapter[], pos: number): { chapter: OutlineChapter; index: number } | null {
  let index = -1;
  chapters.forEach((c, i) => {
    if (c.offset <= pos) index = i;
  });
  if (index < 0 && chapters.length) index = 0;
  return index < 0 ? null : { chapter: chapters[index], index };
}

/** Replaces the outline under the heading at `offset`, changing only the text that differs. */
export function setOutlineInView(view: EditorView, offset: number, outline: string) {
  const before = view.state.doc.toString();
  const after = setOutline(before, offset, outline);
  if (after === before) return;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  // Not a typing event, so the writing view's guard around outlines lets it through.
  view.dispatch({ changes: { from: start, to: endBefore, insert: after.slice(start, endAfter) }, userEvent: 'outline.edit' });
}
