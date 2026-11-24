import { EditorSelection, Prec, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { allOn, chosen, readLine, setMark } from './marks';

/**
 * The selection toolbar (Cerys, October 25). Selecting text shows a small bar above it
 * with the few things a writer does to a phrase: bold, italic, underline, narrator-only text in a
 * wiki entry, and making a new entry from a name. The markdown marks are written for
 * the writer, so nobody has to know them.
 */
export interface ToolbarOptions {
  /** Offer "Narrator only", which only means something in the wiki. */
  narrator: boolean;
  /** Offer "Rumor", for something suspected and not known (Cerys, November 14). */
  rumor?: boolean;
  /** Called with the selected name when the writer chooses "Make an entry". */
  onMakeEntry?: (name: string) => void;
}

/** The markers that open a line and are no part of its words: a heading, a quote, a list item. */
const LINE_OPENER = /^(\s*(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+))*/;

/**
 * Turns bold, italic, or underline on or off (Cerys, November 24). With words selected,
 * the mark goes on all of them, or comes off all of them when every one already has it,
 * so pressing twice always clears the selection. The work is done on the words, in
 * `marks.ts`, so marks already in the selection are folded in and never doubled.
 *
 * With nothing selected, the pair of marks is written with the cursor between them, ready
 * to type. Pressed again at once, the empty pair is taken away. At the end of a marked
 * phrase, it steps the cursor out past the closing mark.
 *
 * A selection over several paragraphs is marked one line at a time, because a mark cannot
 * cross a line (Cerys, November 11). Underline has no markdown of its own, so it is written
 * `<u>` and `</u>` (Cerys, November 1).
 */
export function toggleMark(view: EditorView, mark: string, close: string = mark): boolean {
  const { state } = view;
  const n = mark.length;
  const m = close.length;
  view.dispatch(
    state.changeByRange((range) => {
      if (range.empty) {
        const line = state.doc.lineAt(range.head);
        const at = range.head - line.from;
        const here = readLine(line.text, mark, close);
        const plainAt = (i: number) => here.at.includes(i);
        const emptyPair =
          line.text.slice(at - n, at) === mark &&
          line.text.slice(at, at + m) === close &&
          // The marks of an empty pair mark nothing, so they read as ordinary characters,
          // and for italic they must not be the two halves of a bold mark.
          plainAt(at - n) &&
          plainAt(at) &&
          (mark !== '*' || readLine(line.text, '**').at.includes(at));
        if (emptyPair) return { changes: { from: range.head - n, to: range.head + m }, range: EditorSelection.cursor(range.head - n) };
        const before = here.at.indexOf(at - 1);
        const closesHere = line.text.slice(at, at + m) === close && !plainAt(at) && before >= 0 && here.on[before];
        if (closesHere) return { range: EditorSelection.cursor(range.head + m) };
        return { changes: { from: range.head, insert: mark + close }, range: EditorSelection.cursor(range.head + n) };
      }
      const pieces: { from: number; text: string; a: number; b: number }[] = [];
      for (let pos = range.from; pos <= range.to; ) {
        const line = state.doc.lineAt(pos);
        const a = Math.max(range.from - line.from, LINE_OPENER.exec(line.text)![0].length);
        const b = Math.min(range.to, line.to) - line.from;
        if (b > a && chosen(readLine(line.text, mark, close), a, b)) pieces.push({ from: line.from, text: line.text, a, b });
        pos = line.to + 1;
      }
      if (!pieces.length) return { range };
      const value = !pieces.every((p) => {
        const l = readLine(p.text, mark, close);
        const c = chosen(l, p.a, p.b)!;
        return allOn(l, c.first, c.last);
      });
      const specs: { from: number; to: number; insert: string }[] = [];
      let grown = 0;
      let first = range.from;
      let last = range.to;
      pieces.forEach((p, i) => {
        const done = setMark(p.text, p.a, p.b, value, mark, close)!;
        if (i === 0) first = p.from + grown + done.from;
        if (i === pieces.length - 1) last = p.from + grown + done.to;
        if (done.text === p.text) return;
        // Only the stretch that differs is replaced, so the rest of the line is untouched.
        let head = 0;
        while (head < p.text.length && head < done.text.length && p.text[head] === done.text[head]) head++;
        let tail = 0;
        while (tail < p.text.length - head && tail < done.text.length - head && p.text[p.text.length - 1 - tail] === done.text[done.text.length - 1 - tail]) tail++;
        specs.push({ from: p.from + head, to: p.from + p.text.length - tail, insert: done.text.slice(head, done.text.length - tail) });
        grown += done.text.length - p.text.length;
      });
      return { changes: specs, range: EditorSelection.range(first, last) };
    }),
    { userEvent: 'input.format' },
  );
  return true;
}

const underline = (view: EditorView) => toggleMark(view, '<u>', '</u>');

/** Turns the selected paragraphs into a callout of one kind, such as narrator-only text or a rumor, or back into plain text. */
export function toggleCallout(view: EditorView, kind: string): boolean {
  const { state } = view;
  const first = state.doc.lineAt(state.selection.main.from);
  const last = state.doc.lineAt(state.selection.main.to);
  const above = first.number > 1 ? state.doc.line(first.number - 1) : null;
  const tag = new RegExp(`^>\\s*\\[!${kind}\\]`, 'i');
  const changes = [];
  if (/^>/.test(first.text) && above && tag.test(above.text)) {
    // Already tagged: remove the callout marker and the quote marks.
    changes.push({ from: above.from, to: first.from });
    for (let n = first.number; n <= last.number; n++) {
      const line = state.doc.line(n);
      const mark = /^>\s?/.exec(line.text);
      if (mark) changes.push({ from: line.from, to: line.from + mark[0].length });
    }
  } else {
    changes.push({ from: first.from, insert: `> [!${kind}]\n` });
    for (let n = first.number; n <= last.number; n++) changes.push({ from: state.doc.line(n).from, insert: '> ' });
  }
  view.dispatch({ changes, userEvent: 'input.format' });
  return true;
}

export const toggleNarrator = (view: EditorView) => toggleCallout(view, 'narrator');

/** The selected text when it could be a name: one line, short, and not blank. */
function nameIn(state: EditorState): string | null {
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to).trim().replace(/^[*_"“']+|[*_"”',.;:!?]+$/g, '');
  return text && !text.includes('\n') && text.length <= 60 ? text : null;
}

function button(label: string, title: string, run: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.title = title;
  // Pressing a button must not take the selection away from the text.
  el.addEventListener('mousedown', (event) => event.preventDefault());
  el.addEventListener('click', run);
  return el;
}

export function selectionToolbar(options: ToolbarOptions): Extension {
  const bar = StateField.define<Tooltip | null>({
    create: () => null,
    update(_value, tr) {
      const range = tr.state.selection.main;
      if (range.empty || tr.state.selection.ranges.length > 1) return null;
      return {
        pos: range.from,
        above: true,
        strictSide: false,
        arrow: false,
        create: (view) => {
          const dom = document.createElement('div');
          dom.className = 'cm-selbar';
          dom.append(button('B', 'Bold (Cmd-B or Ctrl-B)', () => toggleMark(view, '**')));
          dom.lastElementChild!.classList.add('bold');
          dom.append(button('I', 'Italic (Cmd-I or Ctrl-I)', () => toggleMark(view, '*')));
          dom.lastElementChild!.classList.add('italic');
          dom.append(button('U', 'Underline (Cmd-U or Ctrl-U)', () => underline(view)));
          dom.lastElementChild!.classList.add('underline');
          if (options.narrator) dom.append(button('Narrator only', 'Hide this from the protagonist view', () => toggleNarrator(view)));
          if (options.rumor) dom.append(button('Rumor', 'Mark this as suspected, not known', () => toggleCallout(view, 'rumor')));
          const name = nameIn(view.state);
          if (options.onMakeEntry && name) dom.append(button('Make an entry', `Start a wiki entry for ${name}`, () => options.onMakeEntry!(name)));
          return { dom };
        },
      };
    },
    provide: (f) => showTooltip.from(f),
  });

  return [
    bar,
    // Ahead of the editor's own keys, where Mod-i selects the surrounding block and
    // Mod-u undoes a selection, so these always format (Cerys, November 1).
    Prec.high(
      keymap.of([
        { key: 'Mod-b', run: (view) => toggleMark(view, '**') },
        { key: 'Mod-i', run: (view) => toggleMark(view, '*') },
        { key: 'Mod-u', run: underline },
      ]),
    ),
    EditorView.theme({
      '.cm-tooltip.cm-tooltip-above:has(.cm-selbar), .cm-tooltip:has(.cm-selbar)': { border: '0', background: 'transparent' },
      '.cm-selbar': {
        display: 'flex',
        gap: '2px',
        padding: '3px',
        background: 'var(--surface)',
        border: '1px solid var(--rule-strong)',
        boxShadow: '0 6px 18px var(--shadow)',
        transform: 'translateY(-6px)',
      },
      '.cm-selbar button': {
        font: 'inherit',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        color: 'var(--text)',
        background: 'none',
        border: '0',
        padding: '5px 9px',
        minHeight: '30px',
        cursor: 'pointer',
      },
      '.cm-selbar button:hover': { background: 'var(--structure-deep)', color: 'var(--structure-soft)' },
      '.cm-selbar .bold': { fontWeight: '700' },
      '.cm-selbar .italic': { fontStyle: 'italic' },
      '.cm-selbar .underline': { textDecoration: 'underline' },
    }),
  ];
}
