import { EditorSelection, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';

/**
 * The selection toolbar (Mike, October 25). Selecting text shows a small bar above it
 * with the few things a writer does to a phrase: bold, italic, narrator-only text in a
 * wiki entry, and making a new entry from a name. The markdown marks are written for
 * the writer, so nobody has to know them.
 */
export interface ToolbarOptions {
  /** Offer "Narrator only", which only means something in the wiki. */
  narrator: boolean;
  /** Called with the selected name when the writer chooses "Make an entry". */
  onMakeEntry?: (name: string) => void;
}

/** Wraps the selection in `mark`, or removes the mark when the selection already has it. */
export function toggleMark(view: EditorView, mark: string): boolean {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const n = mark.length;
      const before = state.sliceDoc(range.from - n, range.from);
      const after = state.sliceDoc(range.to, range.to + n);
      // A single * next to ** is part of bold, not italic.
      const wrapped = before === mark && after === mark && !(n === 1 && (state.sliceDoc(range.from - 2, range.from) === '**' || state.sliceDoc(range.to, range.to + 2) === '**'));
      if (wrapped) {
        return {
          changes: [
            { from: range.from - n, to: range.from },
            { from: range.to, to: range.to + n },
          ],
          range: EditorSelection.range(range.from - n, range.to - n),
        };
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark },
        ],
        range: EditorSelection.range(range.from + n, range.to + n),
      };
    }),
    { userEvent: 'input.format' },
  );
  return true;
}

/** Turns the selected paragraphs into a narrator-only callout, or back into plain text. */
export function toggleNarrator(view: EditorView): boolean {
  const { state } = view;
  const first = state.doc.lineAt(state.selection.main.from);
  const last = state.doc.lineAt(state.selection.main.to);
  const above = first.number > 1 ? state.doc.line(first.number - 1) : null;
  const changes = [];
  if (/^>/.test(first.text) && above && /^>\s*\[!narrator\]/i.test(above.text)) {
    // Already narrator-only: remove the callout marker and the quote marks.
    changes.push({ from: above.from, to: first.from });
    for (let n = first.number; n <= last.number; n++) {
      const line = state.doc.line(n);
      const mark = /^>\s?/.exec(line.text);
      if (mark) changes.push({ from: line.from, to: line.from + mark[0].length });
    }
  } else {
    changes.push({ from: first.from, insert: '> [!narrator]\n' });
    for (let n = first.number; n <= last.number; n++) changes.push({ from: state.doc.line(n).from, insert: '> ' });
  }
  view.dispatch({ changes, userEvent: 'input.format' });
  return true;
}

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
          if (options.narrator) dom.append(button('Narrator only', 'Hide this from the protagonist view', () => toggleNarrator(view)));
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
    keymap.of([
      { key: 'Mod-b', run: (view) => toggleMark(view, '**') },
      { key: 'Mod-i', run: (view) => toggleMark(view, '*') },
    ]),
    EditorView.theme({
      '.cm-tooltip.cm-tooltip-above:has(.cm-selbar), .cm-tooltip:has(.cm-selbar)': { border: '0', background: 'transparent' },
      '.cm-selbar': {
        display: 'flex',
        gap: '2px',
        padding: '3px',
        background: 'var(--surface)',
        border: '1px solid var(--rule-strong)',
        boxShadow: '0 6px 18px rgb(0 0 0 / 0.5)',
        transform: 'translateY(-6px)',
      },
      '.cm-selbar button': {
        font: 'inherit',
        fontFamily: 'var(--font-body)',
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
    }),
  ];
}
