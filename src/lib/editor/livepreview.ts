import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';

/**
 * Live preview. The file stays plain markdown, and this extension only changes how it
 * looks: the marks around a phrase (`*`, `**`, `#`, `>`, link brackets) are hidden, and
 * they reappear while the cursor is inside that phrase so they can be edited (Mike,
 * October 24: marks reappear for the phrase the cursor is in, not the whole line).
 *
 * Nothing here edits the document. Every change is a decoration drawn over the text.
 */

/** Phrases whose marks hide when the cursor is elsewhere. */
const INLINE = new Set(['Emphasis', 'StrongEmphasis', 'Strikethrough', 'InlineCode', 'Link']);
const INLINE_MARKS = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark', 'LinkMark', 'URL', 'LinkTitle']);

const hide = Decoration.replace({});

class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-bullet';
    el.textContent = '•';
    return el;
  }
  eq() {
    return true;
  }
}

class RuleWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-rule';
    return el;
  }
  eq() {
    return true;
  }
}

/** The YAML header, folded to one line. Clicking it opens the header for editing. */
class PropertiesWidget extends WidgetType {
  constructor(private at: number) {
    super();
  }
  toDOM(view: EditorView) {
    const el = document.createElement('div');
    el.className = 'cm-properties';
    el.textContent = 'Properties';
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.at } });
      view.focus();
    });
    return el;
  }
  eq(other: PropertiesWidget) {
    return other.at === this.at;
  }
  ignoreEvent() {
    return true;
  }
}

class LabelWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-callout-label';
    el.textContent = this.text;
    return el;
  }
  eq(other: LabelWidget) {
    return other.text === this.text;
  }
}

/** Whether the editor has focus. An unfocused editor shows every phrase finished. */
const setFocus = StateEffect.define<boolean>();
const focused = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFocus)) return e.value;
    return value;
  },
});

/** True when the cursor or selection touches the range, so its marks should show. */
function touched(state: EditorState, from: number, to: number): boolean {
  if (!state.field(focused, false)) return false;
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** The YAML header at the very top of the file, if there is one. */
function headerRange(state: EditorState): { from: number; to: number } | null {
  const doc = state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return null;
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() === '---') return { from: 0, to: doc.line(n).to };
  }
  return null;
}

function build(state: EditorState, title: string): DecorationSet {
  const marks: Range<Decoration>[] = [];
  const lines: Range<Decoration>[] = [];
  const doc = state.doc;

  // The YAML header shrinks to a single quiet line until the cursor enters it.
  const header = headerRange(state);
  if (header && !touched(state, header.from, header.to)) {
    marks.push(Decoration.replace({ widget: new PropertiesWidget(doc.line(2).from), block: true }).range(header.from, header.to));
  }

  const tree = ensureSyntaxTree(state, doc.length, 200);
  if (!tree) return Decoration.set([...marks, ...lines], true);

  tree.iterate({
    enter(node) {
      const name = node.name;

      if (INLINE.has(name) && !touched(state, node.from, node.to)) {
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (INLINE_MARKS.has(cursor.name)) {
              // A link keeps its text and hides the brackets and the address.
              if (cursor.to > cursor.from) marks.push(hide.range(cursor.from, cursor.to));
            }
          } while (cursor.nextSibling());
        }
        if (name === 'Link') marks.push(Decoration.mark({ class: 'cm-md-link' }).range(node.from, node.to));
        return;
      }

      if (/^ATXHeading[1-6]$/.test(name)) {
        const line = doc.lineAt(node.from);
        const level = Number(name.slice(-1));
        const text = line.text.replace(/^#+\s*/, '').trim();
        // The entry's own title is already shown above the editor, so its heading hides.
        if (level === 1 && text === title && !touched(state, line.from, line.to)) {
          marks.push(Decoration.replace({ block: true }).range(line.from, line.to));
          return false;
        }
        lines.push(Decoration.line({ class: `cm-h${level}` }).range(line.from));
        const markEnd = line.from + (line.text.match(/^#+\s*/)?.[0].length ?? 0);
        if (!touched(state, line.from, line.to) && markEnd > line.from) marks.push(hide.range(line.from, markEnd));
        return false;
      }

      if (name === 'HorizontalRule' && !touched(state, node.from, node.to)) {
        marks.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
        return false;
      }

      if (name === 'ListMark') {
        const line = doc.lineAt(node.from);
        const bullet = /^[-*+]$/.test(doc.sliceString(node.from, node.to));
        if (bullet && !touched(state, line.from, line.to)) {
          marks.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
        }
        return;
      }

      if (name === 'Blockquote') {
        const first = doc.lineAt(node.from);
        const last = doc.lineAt(node.to);
        const callout = /^\s*>\s*\[!(\w+)\]/.exec(first.text);
        const kind = callout?.[1].toLowerCase();
        const cls = kind ? `cm-quote cm-callout cm-callout-${kind}` : 'cm-quote';
        for (let n = first.number; n <= last.number; n++) {
          const line = doc.line(n);
          lines.push(Decoration.line({ class: cls }).range(line.from));
          if (touched(state, line.from, line.to)) continue;
          const quoteMark = /^\s*>\s?/.exec(line.text);
          if (n === first.number && callout) {
            // "> [!narrator]" becomes a small label, like the reading view's callout.
            const markerEnd = line.from + callout[0].length;
            const label = kind === 'narrator' ? 'Narrator only' : kind!;
            marks.push(Decoration.replace({ widget: new LabelWidget(label) }).range(line.from, markerEnd));
          } else if (quoteMark && quoteMark[0].length > 0) {
            marks.push(hide.range(line.from, line.from + quoteMark[0].length));
          }
        }
        return;
      }
    },
  });

  return Decoration.set([...marks, ...lines], true);
}

/** Live preview for an editor whose entry is titled `title`. */
export function livePreview(title: string): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => build(state, title),
    update(value, tr) {
      if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocus))) return build(tr.state, title);
      return value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [focused, EditorView.focusChangeEffect.of((_state, isFocused) => setFocus.of(isFocused)), field];
}
