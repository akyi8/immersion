import { EditorState, Prec, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage, insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import { livePreview } from './livepreview';
import { tags } from '@lezer/highlight';
import type { MentionScanner } from '../index/scanner';

/**
 * The text editor (architecture decision 8). The document is always the file's exact
 * markdown. Styling, paragraph spacing, and automatic links are drawn over the text
 * and never change it, so saving writes back only what the writer typed.
 */

/** Holds the current scanner, so a rebuilt index can update links without a new editor. */
export interface ScannerRef {
  current: MentionScanner;
  selfId: string;
  /** The entry open in the next pane, whose name is marked. */
  next?: string | null;
}

const rescan = StateEffect.define<null>();

/** Tells an editor that the index changed and its links should be redrawn. */
export function refreshMentions(view: EditorView) {
  view.dispatch({ effects: rescan.of(null) });
}

function mentionPlugin(ref: ScannerRef, onMention: (id: string) => void): Extension {
  const build = (view: EditorView): DecorationSet => {
    const ranges = [];
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        for (const m of ref.current.find(line.text)) {
          if (m.id === ref.selfId) continue;
          ranges.push(
            Decoration.mark({ class: m.id === ref.next ? 'cm-mention cm-mention-open' : 'cm-mention', attributes: { 'data-entry': m.id } }).range(line.from + m.start, line.from + m.end),
          );
        }
        pos = line.to + 1;
      }
    }
    return Decoration.set(ranges, true);
  };

  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = build(view);
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.some((e) => e.is(rescan)))) {
            this.decorations = build(u.view);
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    // A click on a name places the cursor, as in any editor, and also opens the name's
    // entry in the pane to the right.
    EditorView.domEventHandlers({
      mousedown(event) {
        const el = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]');
        if (el?.dataset.entry) onMention(el.dataset.entry);
        return false;
      },
    }),
  ];
}

/** Blank lines between paragraphs are drawn short, so paragraphs read as spaced prose. */
const paragraphGaps = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const ranges = [];
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          if (line.text.trim() === '') ranges.push(Decoration.line({ class: 'cm-gap' }).range(line.from));
          pos = line.to + 1;
        }
      }
      return Decoration.set(ranges);
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * The blank line between two paragraphs is one step for the cursor, not a line to type
 * on (Mike, October 24). Arrow keys pass over it, Backspace at the start of a paragraph
 * joins it to the one above, and a click on the gap lands at the edge of a paragraph.
 * The blank line stays in the file, so the markdown keeps its spacing. Two or more blank
 * lines in a row stay ordinary lines, which is also where Enter leaves the cursor.
 */
const gapField = StateField.define<DecorationSet>({
  create: (state) => findGaps(state),
  update: (gaps, tr) => (tr.docChanged ? findGaps(tr.state) : gaps),
});

const gapMark = Decoration.mark({});

function findGaps(state: EditorState): DecorationSet {
  const doc = state.doc;
  const code: { from: number; to: number }[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        code.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = 2; n < doc.lines; n++) {
    const line = doc.line(n);
    if (line.text.trim() !== '') continue;
    const above = doc.line(n - 1);
    const below = doc.line(n + 1);
    if (above.text.trim() === '' || below.text.trim() === '') continue;
    // Blank lines inside a code block are part of the code.
    if (code.some((c) => c.from < line.from && c.to > line.to)) continue;
    builder.add(above.to, below.from, gapMark);
  }
  return builder.finish();
}

const paragraphStep = [gapField, EditorView.atomicRanges.of((view) => view.state.field(gapField))];

/**
 * Enter starts a new paragraph by writing the blank line markdown needs, so the writer
 * presses it once (design: typography). Inside lists and quotes it continues the list
 * or quote instead. Shift-Enter writes a single line break.
 */
const paragraphKeys = Prec.high(
  keymap.of([
    {
      key: 'Enter',
      run: (view) => {
        const line = view.state.doc.lineAt(view.state.selection.main.head);
        if (/^\s*([-*+]|\d+[.)]|>)\s/.test(line.text)) return insertNewlineContinueMarkup(view);
        if (line.text.trim() === '') return insertNewline(view);
        view.dispatch(view.state.replaceSelection('\n\n'));
        return true;
      },
    },
    { key: 'Shift-Enter', run: insertNewline },
  ]),
);

const markdownStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.quote, color: 'var(--text-soft)' },
  { tag: tags.link, color: 'var(--structure)' },
  { tag: tags.url, color: 'var(--muted)' },
  { tag: tags.monospace, fontFamily: 'var(--font-label)', fontSize: '0.9em' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--muted)' },
]);

const theme = EditorView.theme(
  {
    '&': { color: 'var(--text)', backgroundColor: 'transparent', fontSize: 'var(--prose-size)' },
    '.cm-content': { fontFamily: 'var(--font-body)', lineHeight: 'var(--prose-leading)', caretColor: 'var(--structure-soft)', padding: '0' },
    '.cm-line': { padding: '0' },
    '.cm-gap': { lineHeight: '0.9' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--structure-soft)', borderLeftWidth: '2px' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--structure-deep) !important' },
    '.cm-mention': { borderBottom: '1px dotted var(--accent)', cursor: 'pointer' },
    '.cm-mention-open': { backgroundColor: 'var(--accent-wash)' },
    '.cm-md-link': { color: 'var(--structure)' },
    '.cm-h1': { fontFamily: 'var(--font-display)', fontSize: '2.2em', letterSpacing: '0.02em', lineHeight: '1.2' },
    '.cm-h2, .cm-h3, .cm-h4, .cm-h5, .cm-h6': {
      fontFamily: 'var(--font-label)',
      fontSize: '12px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--structure)',
      paddingTop: '1.2em !important',
    },
    '.cm-bullet': { color: 'var(--muted)', padding: '0 0.35em 0 0.1em' },
    '.cm-rule': { display: 'inline-block', width: '100%', borderTop: '1px solid var(--rule)', verticalAlign: 'middle' },
    '.cm-quote': { borderLeft: '2px solid var(--rule-strong)', paddingLeft: '16px !important', color: 'var(--text-soft)' },
    '.cm-callout-narrator': { borderLeftColor: 'var(--structure)', backgroundColor: 'var(--surface)', color: 'var(--text)' },
    '.cm-callout-label': {
      fontFamily: 'var(--font-label)',
      fontSize: '11px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--structure)',
    },
    '.cm-outline-fold': {
      display: 'flex',
      gap: '10px',
      alignItems: 'baseline',
      margin: '4px 0 2px',
      padding: '6px 10px',
      borderLeft: '2px solid var(--structure-deep)',
      cursor: 'pointer',
      color: 'var(--muted)',
      fontSize: '14px',
      lineHeight: '1.4',
    },
    '.cm-outline-fold:hover': { borderLeftColor: 'var(--structure)', color: 'var(--text-soft)' },
    '.cm-outline-label': {
      fontFamily: 'var(--font-label)',
      fontSize: '11px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--structure)',
      flexShrink: '0',
    },
    '.cm-outline-text': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' },
    '.cm-properties': {
      fontFamily: 'var(--font-label)',
      fontSize: '11px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--muted)',
      padding: '2px 0 10px',
      cursor: 'pointer',
    },
  },
  { dark: true },
);

export function createEditor(options: {
  parent: HTMLElement;
  doc: string;
  /** The entry's title, whose heading hides because the title shows above the editor. */
  title: string;
  scanner: ScannerRef;
  onChange: (doc: string) => void;
  onMention: (id: string) => void;
  /** Called with the cursor's position whenever it moves. */
  onCursor?: (pos: number) => void;
  /** Called when a chapter's folded outline is clicked, with where its outline starts. */
  onOutline?: (at: number) => void;
}): EditorView {
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        history(),
        paragraphKeys,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        livePreview(options.title, options.onOutline ?? null),
        syntaxHighlighting(markdownStyle),
        EditorView.lineWrapping,
        paragraphGaps,
        paragraphStep,
        mentionPlugin(options.scanner, options.onMention),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) options.onChange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) options.onCursor?.(u.state.selection.main.head);
        }),
      ],
    }),
  });
}

/**
 * Scrolls `pos` to the top of the view, for jumping to a chapter. When `pos` is a
 * heading, the cursor goes to the first line of text below it, so the heading keeps
 * its finished look instead of showing its marks.
 */
export function jumpTo(view: EditorView, pos: number) {
  const doc = view.state.doc;
  const at = Math.min(pos, doc.length);
  let cursor = at;
  let line = doc.lineAt(at);
  if (/^#{1,6}\s/.test(line.text)) {
    // Past blank lines and the chapter's folded outline, to the first line of prose.
    let inOutline = false;
    while (line.number < doc.lines) {
      line = doc.line(line.number + 1);
      if (/^>\s*\[!outline\]/i.test(line.text)) inOutline = true;
      else if (inOutline && !/^>/.test(line.text)) inOutline = false;
      if (line.text.trim() !== '' && !inOutline) break;
    }
    cursor = line.from;
  }
  view.dispatch({ selection: { anchor: cursor }, effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 24 }) });
  view.focus();
}

/** Replaces the whole document, used when a file changes in another program. */
export function replaceDoc(view: EditorView, doc: string) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
}
