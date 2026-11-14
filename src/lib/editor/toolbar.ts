import { EditorSelection, Prec, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';

/**
 * The selection toolbar (Mike, October 25). Selecting text shows a small bar above it
 * with the few things a writer does to a phrase: bold, italic, underline, narrator-only text in a
 * wiki entry, and making a new entry from a name. The markdown marks are written for
 * the writer, so nobody has to know them.
 */
export interface ToolbarOptions {
  /** Offer "Narrator only", which only means something in the wiki. */
  narrator: boolean;
  /** Offer "Rumor", for something suspected and not known (Mike, November 14). */
  rumor?: boolean;
  /** Called with the selected name when the writer chooses "Make an entry". */
  onMakeEntry?: (name: string) => void;
}

/**
 * Wraps the selection in `mark`, or removes the mark when the selection already has it.
 * Underline has no markdown of its own, so it is written `<u>` and `</u>`, which the
 * reading view and other markdown editors understand (Mike, November 1).
 */
export function toggleMark(view: EditorView, mark: string, close: string = mark): boolean {
  const { state } = view;
  const n = mark.length;
  const m = close.length;
  view.dispatch(
    state.changeByRange((range) => {
      // A selection that runs over several paragraphs is marked one paragraph at a time,
      // because a mark cannot cross a blank line (Mike, November 11). Each piece leaves out
      // the space around it and any heading, list, or quote marker in front of it.
      type Side = 'outside' | 'inside' | null;
      const pieces: { from: number; to: number; start: Side; end: Side }[] = [];
      // Asterisks run together where text is both bold and italic, so a run is counted:
      // an odd run holds italic, and a run of two or more holds bold.
      const stars = (pos: number, dir: 1 | -1, limit: number) => {
        let count = 0;
        while (count < limit && state.sliceDoc(dir > 0 ? pos + count : pos - count - 1, dir > 0 ? pos + count + 1 : pos - count) === '*') count++;
        return count;
      };
      const has = (text: string, pos: number, dir: 1 | -1, limit: number) => {
        if (text.includes('*')) {
          const run = stars(pos, dir, limit);
          return text === '*' ? run % 2 === 1 : run >= 2;
        }
        return limit >= text.length && (dir > 0 ? state.sliceDoc(pos, pos + text.length) : state.sliceDoc(pos - text.length, pos)) === text;
      };
      for (let pos = range.from; pos <= range.to; ) {
        const line = state.doc.lineAt(pos);
        let from = Math.max(range.from, line.from);
        let to = Math.min(range.to, line.to);
        if (from === line.from) from += /^(\s*(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+))*/.exec(line.text)![0].length;
        const text = state.sliceDoc(from, Math.max(from, to));
        from += text.length - text.trimStart().length;
        to -= text.length - text.trimEnd().length;
        if (to > from || (range.empty && pos === range.from)) {
          to = Math.max(from, to);
          // The mark may sit just outside the selection or just inside it, at either end.
          const start: Side = has(mark, from, -1, from - line.from) ? 'outside' : has(mark, from, 1, to - from) ? 'inside' : null;
          const end: Side = has(close, to, 1, line.to - to) ? 'outside' : has(close, to, -1, to - from) ? 'inside' : null;
          pieces.push({ from, to, start, end });
        }
        pos = line.to + 1;
      }
      if (!pieces.length) return { range };
      // The mark comes off only when every piece has it. Otherwise the pieces without it get it.
      const marked = (p: (typeof pieces)[number]) => !!p.start && !!p.end && (p.to - p.from >= n + m || p.start === 'outside' || p.end === 'outside');
      const remove = pieces.every(marked);
      const specs = pieces.flatMap((p): { from: number; to?: number; insert?: string }[] =>
        remove
          ? [p.start === 'outside' ? { from: p.from - n, to: p.from } : { from: p.from, to: p.from + n }, p.end === 'outside' ? { from: p.to, to: p.to + m } : { from: p.to - m, to: p.to }]
          : marked(p)
            ? []
            : [
                { from: p.from, insert: mark },
                { from: p.to, insert: close },
              ],
      );
      const changes = state.changes(specs);
      // One piece keeps the words selected, inside their marks. Several pieces keep the
      // whole run selected, marks included, so pressing again takes the marks off.
      const one = pieces.length === 1;
      const first = Math.min(range.from, pieces[0].from);
      const last = Math.max(range.to, pieces[pieces.length - 1].to);
      return { changes, range: EditorSelection.range(changes.mapPos(first, one ? 1 : -1), changes.mapPos(last, one ? -1 : 1)) };
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
    // Mod-u undoes a selection, so these always format (Mike, November 1).
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
