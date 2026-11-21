import { syntaxTree } from '@codemirror/language';
import { StateEffect, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { contextMenu, type MenuEntry } from '../contextMenu.svelte';
import { spell, wordsIn, type Word } from '../spell';

/**
 * Spelling in the editor (Mike, November 21). A misspelled word is drawn a little greyer.
 * A word is looked up only after the typing pauses, and the word the cursor is in is
 * left alone, so nothing turns grey under the hand. A right click on a greyed word
 * offers what it might have been, adds it to the writer's dictionary, and switches the
 * world between American and British spelling.
 */
const redraw = StateEffect.define<null>();
const mark = Decoration.mark({ class: 'cm-misspelled' });
/** What is written in these is not prose: addresses, code, and markup. */
const SKIP = new Set(['URL', 'Autolink', 'InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'HTMLTag', 'HTMLBlock', 'LinkLabel', 'CommentBlock', 'ProcessingInstruction']);
const PAUSE = 600;

class Spelling {
  decorations: DecorationSet = Decoration.none;
  /** The misspelled words on screen, for the right click. */
  found: Word[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stop: () => void;

  constructor(private view: EditorView) {
    this.stop = spell.listen(() => this.view.dispatch({ effects: redraw.of(null) }));
    this.draw(true);
  }

  update(u: ViewUpdate) {
    const asked = u.transactions.some((t) => t.effects.some((e) => e.is(redraw)));
    if (u.docChanged) {
      // What is drawn moves with the text, and new words wait for a pause in the typing.
      this.decorations = this.decorations.map(u.changes);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.view.dispatch({ effects: redraw.of(null) }), PAUSE);
    }
    if (asked || u.viewportChanged || (u.selectionSet && !u.docChanged)) this.draw(asked || u.viewportChanged);
  }

  /** Draws what is known to be misspelled, and with `look` asks about the words not looked up yet. */
  private draw(look: boolean) {
    const { state } = this.view;
    if (!spell.on) {
      this.decorations = Decoration.none;
      this.found = [];
      return;
    }
    const doc = state.doc;
    // The header of a file is settings, between its two rules, and is never prose.
    const header = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(doc.sliceString(0, Math.min(doc.length, 4000)))?.[0].length ?? 0;
    const cursor = state.selection.main.head;
    const marks: Range<Decoration>[] = [];
    const found: Word[] = [];
    const ask: string[] = [];
    for (const { from, to } of this.view.visibleRanges) {
      const skip: [number, number][] = [];
      syntaxTree(state).iterate({ from, to, enter: (n) => void (SKIP.has(n.name) && skip.push([n.from, n.to])) });
      for (let pos = from; pos <= to; ) {
        const line = doc.lineAt(pos);
        if (line.to > header) {
          for (const w of wordsIn(line.text)) {
            const a = line.from + w.from;
            const b = line.from + w.to;
            if (a < header || skip.some(([s, e]) => a < e && b > s)) continue;
            // The word being typed is not finished, so it is not judged.
            if (cursor >= a && cursor <= b && this.view.hasFocus) continue;
            if (spell.wrong(w.word)) {
              marks.push(mark.range(a, b));
              found.push({ from: a, to: b, word: w.word });
            } else ask.push(w.word);
          }
        }
        pos = line.to + 1;
      }
    }
    this.decorations = Decoration.set(marks, true);
    this.found = found;
    if (look) spell.check(ask);
  }

  destroy() {
    this.stop();
    if (this.timer) clearTimeout(this.timer);
  }
}

async function menu(view: EditorView, word: Word, event: MouseEvent) {
  const at = { x: event.clientX, y: event.clientY };
  const suggestions = await spell.suggest(word.word);
  // The text may have moved while the suggestions were found.
  const still = () => view.state.sliceDoc(word.from, word.to) === word.word;
  const items: MenuEntry[] = suggestions.length
    ? suggestions.map((s) => ({ label: s, run: () => still() && (view.dispatch({ changes: { from: word.from, to: word.to, insert: s }, userEvent: 'input.spelling' }), view.focus()) }))
    : [{ label: 'No suggestions', run: () => {}, disabled: true }];
  items.push('separator', { label: `Add “${word.word}” to my dictionary`, run: () => spell.add(word.word) });
  if (spell.onLanguage) {
    const other = spell.language === 'american' ? 'british' : 'american';
    items.push('separator', { label: other === 'british' ? 'Use British spelling in this world' : 'Use American spelling in this world', run: () => spell.onLanguage?.(other) });
  }
  if (spell.onSpanish) items.push({ label: spell.spanish ? 'Stop accepting Spanish in this world' : 'Accept Spanish too in this world', run: () => spell.onSpanish?.(!spell.spanish) });
  contextMenu.show(event, items, at);
}

export const spelling = [
  ViewPlugin.fromClass(Spelling, {
    decorations: (p) => p.decorations,
    eventHandlers: {
      contextmenu(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null || !spell.on) return false;
        // The word is read from the text under the pointer, and not from what is drawn. On
        // Windows a right click first puts the cursor in the word, and the word the cursor
        // is in is not drawn as misspelled, so asking what is drawn found nothing there.
        const line = view.state.doc.lineAt(pos);
        const hit = wordsIn(line.text).find((w) => pos >= line.from + w.from && pos <= line.from + w.to);
        const word = hit && spell.wrong(hit.word) ? { from: line.from + hit.from, to: line.from + hit.to, word: hit.word } : undefined;
        if (!word) return false;
        event.preventDefault();
        void menu(view, word, event);
        return true;
      },
    },
  }),
  EditorView.baseTheme({
    // A little greyer and nothing else: no underline and no color, so the page still reads as a page.
    '.cm-misspelled': { opacity: '0.55' },
  }),
];
