import { spell } from './spell';
import { ui } from './ui.svelte';

/**
 * How one document is shown (Cerys, November 10): the size of
 * its text and whether its picture shows. Each document remembers how it was left, because a session
 * plan read for reference, a chapter being written, and a wiki entry being built want
 * different rooms. The choices are kept by this computer, like every other memory of
 * how a panel was left, so opening a document never writes to the library.
 */
export interface DocView {
  text: 'normal' | 'small';
  /** Whether the page's picture shows. How it is shaped and framed is kept in the page's file. */
  picture: 'show' | 'hide';
}

export const DEFAULT_VIEW: DocView = { text: 'normal', picture: 'show' };

const KEY = 'immersion.views';
const QUIET_KEY = 'immersion.quiet';

type Saved = Record<string, Partial<DocView>>;

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/** Only what differs from the usual is kept, so a later change to the usual reaches old documents. */
export function changesFrom(view: DocView, usual: DocView = DEFAULT_VIEW): Partial<DocView> {
  const out: Partial<DocView> = {};
  for (const k of Object.keys(usual) as (keyof DocView)[]) if (view[k] !== usual[k]) (out as Record<string, unknown>)[k] = view[k];
  return out;
}

export function viewFrom(saved: Partial<DocView> | undefined, usual: DocView = DEFAULT_VIEW): DocView {
  return {
    text: saved?.text === 'small' || saved?.text === 'normal' ? saved.text : usual.text,
    // A picture put away was first kept as `false`. Any other value shows it.
    picture: saved?.picture === 'hide' || (saved?.picture as unknown) === false ? 'hide' : usual.picture,
  };
}

class Views {
  private saved = $state<Saved>(load());

  private key(id: string): string {
    return `${ui.world?.path ?? ''}\n${id}`;
  }

  of(id: string): DocView {
    return viewFrom(this.saved[this.key(id)]);
  }

  set(id: string, change: Partial<DocView>) {
    const key = this.key(id);
    const kept = changesFrom({ ...this.of(id), ...change });
    const next = { ...this.saved };
    if (Object.keys(kept).length) next[key] = kept;
    else delete next[key];
    this.saved = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // A computer that keeps nothing still shows the choice until the app closes.
    }
  }
}

export const views = new Views();

/**
 * While the writer types, everything but the page steps back (Cerys, November 10), and
 * it returns when the pointer moves or the writing loses the keyboard. Thinking with
 * still hands brings nothing back. Each computer can turn this off in Settings.
 */
class Quiet {
  on = $state(
    (() => {
      try {
        return localStorage.getItem(QUIET_KEY) !== 'off';
      } catch {
        return true;
      }
    })(),
  );
  typing = $state(false);
  // The room steps back a moment after the typing starts and returns a moment after the
  // pointer moves (Cerys, November 21), so a pause, or a glance with the mouse, does not
  // make it flash out and in.
  private stepBack: ReturnType<typeof setTimeout> | null = null;
  private comeBack: ReturnType<typeof setTimeout> | null = null;
  private static readonly WAIT = 1000;

  set(on: boolean) {
    this.on = on;
    if (!on) this.back();
    try {
      localStorage.setItem(QUIET_KEY, on ? 'on' : 'off');
    } catch {
      // Kept until the app closes.
    }
  }

  /** The writer typed, or moved through the text with the keyboard. */
  typed() {
    if (!this.on) return;
    if (this.comeBack) clearTimeout(this.comeBack);
    this.comeBack = null;
    if (this.typing || this.stepBack) return;
    this.stepBack = setTimeout(() => {
      this.stepBack = null;
      this.typing = true;
    }, Quiet.WAIT);
  }

  /** The room returns at once: the keyboard left the text, or the window lost it. */
  private back() {
    if (this.stepBack) clearTimeout(this.stepBack);
    if (this.comeBack) clearTimeout(this.comeBack);
    this.stepBack = this.comeBack = null;
    this.typing = false;
  }

  /** The room returns after a moment, unless the typing starts again first. */
  private soon() {
    if (this.stepBack) clearTimeout(this.stepBack);
    this.stepBack = null;
    if (!this.typing || this.comeBack) return;
    this.comeBack = setTimeout(() => {
      this.comeBack = null;
      this.typing = false;
    }, Quiet.WAIT);
  }

  /** Listens for what brings the room back, and for the keys that move through a text. */
  start() {
    let from: { x: number; y: number } | null = null;
    window.addEventListener('mousemove', (e) => {
      if (!this.typing && !this.stepBack) {
        from = null;
        return;
      }
      // A nudge of the desk is not a reach for the mouse.
      from ??= { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > 12) {
        this.soon();
        from = null;
      }
    });
    window.addEventListener('blur', () => this.back());
    const MOVES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete']);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') this.back();
      // Moving through the text with the keyboard is still being in the text, so it keeps
      // the quiet as typing does.
      else if (MOVES.has(e.key) && (e.target as HTMLElement | null)?.closest?.('.cm-content')) this.typed();
    });
    document.addEventListener('focusout', (e) => {
      // A page that closes while it holds the keyboard loses it in the middle of being
      // taken down, where nothing may be changed, so the room comes back a moment later.
      if ((e.target as HTMLElement | null)?.closest?.('.cm-editor')) setTimeout(() => this.back(), 0);
    });
  }
}


export const quiet = new Quiet();

/** Whether misspelled words are set a little greyer (Cerys, November 21). Each computer chooses. */
class SpellingChoice {
  on = $state(spell.on);
  set(on: boolean) {
    this.on = on;
    spell.setOn(on);
  }
}
export const spellingChoice = new SpellingChoice();
