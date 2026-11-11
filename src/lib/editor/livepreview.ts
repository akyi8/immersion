import { EditorSelection, EditorState, Prec, RangeSet, StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { hasNoProse, startWriting } from './writeHere';

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
 * A quiet "Start writing here" below a chapter that has only its beat so far, so it is
 * clear where the writing goes (Mike, November 1). Clicking it starts the writing there.
 */
class WriteHereWidget extends WidgetType {
  toDOM(view: EditorView) {
    const el = document.createElement('div');
    el.className = 'cm-write-here';
    el.textContent = 'Start writing here';
    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      startWriting(view);
    });
    return el;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

/**
 * Header keys the app writes for itself or shows in a place of its own, such as an entry's
 * date under its name, which the writer never needs to see as raw header lines.
 */
type Zone = { from: number; to: number };

/** The start of the line after `n`, past one blank separator line if there is one. */
function pastSeparator(state: EditorState, n: number): number {
  const doc = state.doc;
  let after = n + 1;
  if (after <= doc.lines && doc.line(after).text.trim() === '') after++;
  return after <= doc.lines ? doc.line(after).from : doc.length;
}

/**
 * The zones the writing view protects: a header the app hides, each outline callout
 * (a chapter's beat), and the blank lines that keep them apart from the writing. Only
 * the one blank line after a beat is protected, because a line typed straight after a
 * beat would join its quote. Further blank lines are the writer's own, so pressing
 * Enter above the first paragraph makes room to write there (Mike, November 1).
 */
function outlineZones(state: EditorState): Zone[] {
  const zones: Zone[] = [];
  const doc = state.doc;
  const header = headerRange(state);
  if (header) {
    // Starting before the document means nothing can be typed in front of the header either.
    zones.push({ from: -1, to: pastSeparator(state, doc.lineAt(header.to).number) });
  }
  for (let n = 1; n <= doc.lines; n++) {
    if (!/^>\s*\[!outline\]/i.test(doc.line(n).text)) continue;
    let end = n;
    while (end + 1 <= doc.lines && /^>/.test(doc.line(end + 1).text)) end++;
    let before = n - 1;
    while (before >= 1 && doc.line(before).text.trim() === '') before--;
    zones.push({ from: before >= 1 ? doc.line(before).to : -1, to: pastSeparator(state, end) });
    n = end;
  }
  return zones;
}

/**
 * The top of a file whose title heading is hidden: any hidden header, the title, and the
 * blank line after it. The title already shows above the editor and has its own Rename,
 * so the cursor steps past this zone and typing cannot reach it (Mike, October 25: the
 * title flashed as the cursor passed through).
 */
function titleZone(state: EditorState, title: string): Zone | null {
  const doc = state.doc;
  const header = headerRange(state);
  let n = header ? doc.lineAt(header.to).number + 1 : 1;
  while (n <= doc.lines && doc.line(n).text.trim() === '') n++;
  if (n > doc.lines || doc.line(n).text.replace(/^#\s+/, '').trim() !== title || !/^#\s/.test(doc.line(n).text)) return null;
  return {
    from: -1,
    to: pastSeparator(state, n),
  };
}

/** The bold `**Aliases:**` line near the top of a file, if there is one. */
function aliasLine(state: EditorState): { from: number; to: number; n: number } | null {
  const doc = state.doc;
  const header = headerRange(state);
  const first = header ? doc.lineAt(header.to).number + 1 : 1;
  for (let n = first; n <= Math.min(doc.lines, first + 12); n++) {
    const line = doc.line(n);
    if (/^[ \t]*\*\*\s*aliases\s*:?\s*\*\*/i.test(line.text)) {
      // The blank line after it goes with it, so the hidden line leaves no gap behind.
      const next = n < doc.lines ? doc.line(n + 1) : null;
      return { from: line.from, to: next && next.text.trim() === '' ? next.to : line.to, n };
    }
  }
  return null;
}

/**
 * A rule drawn straight under the title, before any text, such as the `---` many wiki
 * entries open with. It only repeats the edge the page already has, so it is hidden
 * (Mike, November 10). The file keeps it.
 */
function openingRule(state: EditorState): { from: number; to: number; n: number } | null {
  const doc = state.doc;
  const header = headerRange(state);
  let n = header ? doc.lineAt(header.to).number + 1 : 1;
  const blanks = () => {
    while (n <= doc.lines && doc.line(n).text.trim() === '') n++;
  };
  blanks();
  if (n <= doc.lines && /^#\s/.test(doc.line(n).text)) n++;
  blanks();
  if (n <= doc.lines && /^[ \t]*\*\*\s*aliases\s*:?\s*\*\*/i.test(doc.line(n).text)) n++;
  blanks();
  if (n > doc.lines || !/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(doc.line(n).text)) return null;
  const line = doc.line(n);
  const next = n < doc.lines ? doc.line(n + 1) : null;
  return { from: line.from, to: next && next.text.trim() === '' ? next.to : line.to, n };
}

function zonesOf(state: EditorState, title: string): Zone[] {
  const zones = outlineZones(state);
  const top = titleZone(state, title);
  if (top) zones.push(top);
  const rule = openingRule(state);
  if (rule) zones.push({ from: rule.n > 1 ? state.doc.line(rule.n - 1).to : -1, to: pastSeparator(state, rule.n) });
  // The hidden names line is a zone too, so the cursor never rests in it.
  const names = aliasLine(state);
  if (names) zones.push({ from: names.n > 1 ? state.doc.line(names.n - 1).to : -1, to: pastSeparator(state, names.n) });
  return zones.sort((a, b) => a.from - b.from);
}

/** Whether a position is inside a zone, where the cursor never rests. */
const inside = (z: Zone, pos: number) => pos > z.from && pos < z.to;

/** Moves a position out of every zone, to the zone's end, where the writing begins. */
function clamp(zones: Zone[], pos: number): number {
  for (let moved = true; moved; ) {
    moved = false;
    for (const z of zones) {
      if (inside(z, pos)) {
        pos = z.to;
        moved = true;
      }
    }
  }
  return pos;
}

/** Where the writing starts: the end of the zones at the top of the file. */
function writingStart(state: EditorState, zones: Zone[]): number {
  let start = 0;
  for (const z of zones) {
    if (z.from <= start || state.doc.sliceString(start, z.from).trim() === '') start = Math.max(start, z.to);
    else break;
  }
  return start;
}

/**
 * Typing and deleting in the writing view never touch an outline (Mike, October 25).
 * A change that would cut into an outline or the blank line after it is refused whole,
 * because removing that blank line would pull the next paragraph into the outline.
 * Typing at the end of the heading or the start of the paragraph still works, and
 * outline view edits the outline itself. When a file ends inside a beat, what is typed
 * there starts a paragraph of its own below it instead.
 */
const protectZones = (title: string) =>
  EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || (!tr.isUserEvent('input') && !tr.isUserEvent('delete') && !tr.isUserEvent('move'))) return tr;
    const zones = zonesOf(tr.startState, title);
    if (!zones.length) return tr;
    const doc = tr.startState.doc;
    let blocked = false;
    let atEnd: string | null = null;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      for (const z of zones) {
        if (toA > fromA ? fromA < z.to && toA > z.from : inside(z, fromA)) blocked = true;
        else if (toA === fromA && fromA === z.to && z.to === doc.length && doc.lineAt(z.to).from < z.to) atEnd = inserted.toString();
      }
    });
    if (blocked) return [];
    if (atEnd !== null) {
      const text = (atEnd as string).replace(/^\n+/, '');
      return { changes: { from: doc.length, insert: '\n\n' + text }, selection: { anchor: doc.length + 2 + text.length }, userEvent: 'input.type' };
    }
    return tr;
  });

/**
 * The cursor stays where text can be written (Mike, November 1). A click or a key that
 * would put it inside a hidden header, the hidden title, or a beat moves it to where the
 * writing continues below them, so typing always shows.
 */
const keepCursorOut = (title: string) =>
  EditorState.transactionFilter.of((tr) => {
    if (!tr.selection || !tr.isUserEvent('select')) return tr;
    const zones = zonesOf(tr.state, title);
    if (!zones.length) return tr;
    const sel = tr.newSelection;
    let changed = false;
    const ranges = sel.ranges.map((r) => {
      const anchor = clamp(zones, r.anchor);
      const head = clamp(zones, r.head);
      if (anchor !== r.anchor || head !== r.head) changed = true;
      return EditorSelection.range(anchor, head);
    });
    return changed ? [tr, { selection: EditorSelection.create(ranges, sel.mainIndex), sequential: true }] : tr;
  });

/** The cursor steps over every zone instead of landing inside it. */
const skipZones = (title: string) =>
  EditorView.atomicRanges.of((view) => {
    const zones = zonesOf(view.state, title)
      .map((z) => ({ from: Math.max(0, z.from), to: z.to }))
      .filter((z) => z.to > z.from);
    return zones.length ? RangeSet.of(zones.map((z) => Decoration.mark({}).range(z.from, z.to)), true) : RangeSet.empty;
  });

/** Select all takes the writing only, never the hidden header, title, or beat above it. */
const selectWriting = (title: string) =>
  Prec.high(
    keymap.of([
      {
        key: 'Mod-a',
        run: (view) => {
          const start = writingStart(view.state, zonesOf(view.state, title));
          if (start <= 0 || start >= view.state.doc.length) return false;
          view.dispatch({ selection: { anchor: start, head: view.state.doc.length }, userEvent: 'select' });
          return true;
        },
      },
    ]),
  );

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

  // The YAML header is never shown (Mike, November 10). What it holds is offered by the
  // page itself, such as its other names, its date, and its picture, so nobody has to
  // edit a file's header by hand inside the app.
  const header = headerRange(state);
  if (header) marks.push(Decoration.replace({ block: true }).range(header.from, header.to));
  // Other names written as a bold line show in the page's header, where they are also
  // added and removed, so the line itself is hidden from the text.
  const names = aliasLine(state);
  if (names) marks.push(Decoration.replace({ block: true }).range(names.from, names.to));
  const opening = openingRule(state);
  if (opening) marks.push(Decoration.replace({ block: true }).range(opening.from, opening.to));

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

      if (name === 'HorizontalRule' && opening && node.from >= opening.from && node.to <= opening.to) return false;
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

  // Underlined text, written <u> and </u>, shows underlined with its tags hidden until
  // the cursor reaches it (Mike, November 1).
  if (doc.length < 400000) {
    const text = doc.toString();
    for (const m of text.matchAll(/<u>([^<\n]+?)<\/u>/g)) {
      const from = m.index!;
      const to = from + m[0].length;
      marks.push(Decoration.mark({ class: 'cm-underline' }).range(from + 3, to - 4));
      if (!touched(state, from, to)) {
        marks.push(hide.range(from, from + 3));
        marks.push(hide.range(to - 4, to));
      }
    }
  }

  // A chapter (one with a beat to fold) with no prose yet shows where the writing goes.
  // A long chapter surely has prose, so it is not read again on every keystroke.
  if (onOutline && doc.length < 4000 && hasNoProse(doc.toString())) {
    marks.push(Decoration.widget({ widget: new WriteHereWidget(), block: true, side: 1 }).range(doc.length));
  }

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
  return [focused, EditorView.focusChangeEffect.of((_state, isFocused) => setFocus.of(isFocused)), field, protectZones(title), keepCursorOut(title), skipZones(title), selectWriting(title)];
}
