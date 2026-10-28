import { EditorState, RangeSet, StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
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

/**
 * A chapter's outline, folded to one quiet line in the writing view (Mike, October 25).
 * Clicking it opens outline view at that chapter. The outline itself is edited there,
 * so the writing view never shows the callout's markup.
 */
class OutlineWidget extends WidgetType {
  constructor(
    private summary: string,
    private at: number,
    private onOutline: ((at: number) => void) | null,
    private thread = '',
  ) {
    super();
  }
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-outline-fold';
    const label = document.createElement('span');
    label.className = 'cm-outline-label';
    label.textContent = this.thread || 'Beat';
    const text = document.createElement('span');
    text.className = 'cm-outline-text';
    text.textContent = this.summary;
    el.append(label, text);
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.onOutline?.(this.at);
    });
    return el;
  }
  eq(other: OutlineWidget) {
    return other.summary === this.summary && other.at === this.at && other.thread === this.thread;
  }
  ignoreEvent() {
    return true;
  }
}

/**
 * Header keys the app writes for itself or shows in a place of its own, such as an entry's
 * date under its name, which the writer never needs to see as raw header lines.
 */
const MACHINE_KEYS = new Set(['manuscript', 'shelved', 'threads', 'when', 'era', 'stages']);

/** True when every key in the YAML header is one the app keeps for itself. */
function machineOnly(state: EditorState, header: { from: number; to: number }): boolean {
  const lines = state.doc.sliceString(header.from, header.to).split('\n').slice(1, -1);
  const keys = lines.map((l) => /^([\w-]+)\s*:/.exec(l)?.[1]).filter((k): k is string => !!k);
  // Indented lines belong to the key above them, such as the parts under `stages:`.
  return keys.length > 0 && keys.every((k) => MACHINE_KEYS.has(k)) && lines.every((l) => l.trim() === '' || /^[\w-]+\s*:/.test(l) || /^\s+\S/.test(l));
}

/**
 * The zones the writing view protects: each outline callout, and a header the app
 * hides, together with the blank lines after them, up to the start of the next line.
 */
function outlineZones(state: EditorState): { from: number; to: number }[] {
  const zones: { from: number; to: number }[] = [];
  const doc = state.doc;
  const header = headerRange(state);
  if (header && machineOnly(state, header)) {
    let after = doc.lineAt(header.to).number + 1;
    while (after <= doc.lines && doc.line(after).text.trim() === '') after++;
    // Starting before the document means nothing can be typed in front of the header either.
    zones.push({ from: -1, to: after <= doc.lines ? doc.line(after).from : doc.length });
  }
  for (let n = 1; n <= doc.lines; n++) {
    if (!/^>\s*\[!outline\]/i.test(doc.line(n).text)) continue;
    let end = n;
    while (end + 1 <= doc.lines && /^>/.test(doc.line(end + 1).text)) end++;
    let before = n - 1;
    while (before >= 1 && doc.line(before).text.trim() === '') before--;
    let after = end + 1;
    while (after <= doc.lines && doc.line(after).text.trim() === '') after++;
    zones.push({
      from: before >= 1 ? doc.line(before).to : 0,
      to: after <= doc.lines ? doc.line(after).from : doc.length,
    });
    n = end;
  }
  return zones;
}

/**
 * The top of a file whose title heading is hidden: any hidden header, the title, and the
 * blank lines after them, up to the first line of text. The title already shows above
 * the editor and has its own Rename, so the cursor steps past this zone and typing
 * cannot reach it (Mike, October 25: the title flashed as the cursor passed through).
 */
function titleZone(state: EditorState, title: string): { from: number; to: number } | null {
  const doc = state.doc;
  const header = headerRange(state);
  let n = header ? doc.lineAt(header.to).number + 1 : 1;
  while (n <= doc.lines && doc.line(n).text.trim() === '') n++;
  if (n > doc.lines || doc.line(n).text.replace(/^#\s+/, '').trim() !== title || !/^#\s/.test(doc.line(n).text)) return null;
  let after = n + 1;
  while (after <= doc.lines && doc.line(after).text.trim() === '') after++;
  const visibleHeader = header && !machineOnly(state, header);
  return {
    // A header that shows stays editable, so the zone starts below it.
    from: visibleHeader ? header.to : -1,
    to: after <= doc.lines ? doc.line(after).from : doc.length,
  };
}

/**
 * Typing and deleting in the writing view never touch an outline (Mike, October 25).
 * A change that would cut into an outline or the blank lines around it is refused
 * whole, because removing even one of those blank lines would pull the next paragraph
 * into the outline. Typing at the end of the heading or the start of the paragraph
 * still works, and outline view edits the outline itself.
 */
const protectZones = (title: string) =>
  EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || (!tr.isUserEvent('input') && !tr.isUserEvent('delete') && !tr.isUserEvent('move'))) return tr;
  const zones = outlineZones(tr.startState);
  const top = titleZone(tr.startState, title);
  if (top) zones.push(top);
  if (!zones.length) return tr;
  let blocked = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    for (const z of zones) {
      if (toA > fromA ? fromA < z.to && toA > z.from : fromA > z.from && fromA < z.to) blocked = true;
    }
  });
  return blocked ? [] : tr;
  });

/** The cursor steps over the top zone instead of landing inside the hidden title. */
const skipTitle = (title: string) =>
  EditorView.atomicRanges.of((view) => {
    const zone = titleZone(view.state, title);
    if (!zone || zone.to <= Math.max(0, zone.from)) return RangeSet.empty;
    return RangeSet.of([Decoration.mark({}).range(Math.max(0, zone.from), zone.to)]);
  });

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

function build(state: EditorState, title: string, onOutline: ((at: number) => void) | null): DecorationSet {
  const marks: Range<Decoration>[] = [];
  const lines: Range<Decoration>[] = [];
  const doc = state.doc;

  // The YAML header shrinks to a single quiet line until the cursor enters it. A header
  // that holds only what the app keeps for itself, such as `manuscript: true`, is hidden.
  const header = headerRange(state);
  if (header && machineOnly(state, header)) {
    marks.push(Decoration.replace({ block: true }).range(header.from, header.to));
  } else if (header && !touched(state, header.from, header.to)) {
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
        if (level === 1 && text === title) {
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
        if (kind === 'outline') {
          const summary = doc
            .sliceString(doc.line(Math.min(first.number + 1, last.number)).from, last.to)
            .replace(/^>\s?/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
          marks.push(
            Decoration.replace({
              widget: new OutlineWidget(first.number === last.number ? '' : summary, first.from, onOutline, /^>\s*\[!outline\][-+]?[ \t]*(.*)$/i.exec(first.text)?.[1].trim() ?? ''),
              block: true,
            }).range(
              first.from,
              last.to,
            ),
          );
          return false;
        }
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
export function livePreview(title: string, onOutline: ((at: number) => void) | null = null): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => build(state, title, onOutline),
    update(value, tr) {
      if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocus))) return build(tr.state, title, onOutline);
      return value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [focused, EditorView.focusChangeEffect.of((_state, isFocused) => setFocus.of(isFocused)), field, protectZones(title), skipTitle(title)];
}
