import { ui } from './ui.svelte';

/**
 * How one document is shown (Mike, November 10): the width of its column, the size of
 * its text, whether its picture shows, and whether the paragraph being written is lit
 * while the others fall back. Each document remembers how it was left, because a session
 * plan read for reference, a chapter being written, and a wiki entry being built want
 * different rooms. The choices are kept by this computer, like every other memory of
 * how a panel was left, so opening a document never writes to the library.
 */
export interface DocView {
  /** A book's line of about sixty-six characters, or the pane's full reading width. */
  column: 'book' | 'wide';
  text: 'normal' | 'small';
  picture: boolean;
  lit: boolean;
}

export const DEFAULT_VIEW: DocView = { column: 'book', text: 'normal', picture: true, lit: false };

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
    column: saved?.column === 'wide' || saved?.column === 'book' ? saved.column : usual.column,
    text: saved?.text === 'small' || saved?.text === 'normal' ? saved.text : usual.text,
    picture: typeof saved?.picture === 'boolean' ? saved.picture : usual.picture,
    lit: typeof saved?.lit === 'boolean' ? saved.lit : usual.lit,
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
 * While the writer types, everything but the page steps back (Mike, November 10), and
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

  set(on: boolean) {
    this.on = on;
    if (!on) this.typing = false;
    try {
      localStorage.setItem(QUIET_KEY, on ? 'on' : 'off');
    } catch {
      // Kept until the app closes.
    }
  }

  typed() {
    if (this.on) this.typing = true;
  }

  /** Listens for what brings the room back. */
  start() {
    let from: { x: number; y: number } | null = null;
    window.addEventListener('mousemove', (e) => {
      if (!this.typing) {
        from = null;
        return;
      }
      // A nudge of the desk is not a reach for the mouse.
      from ??= { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > 12) {
        this.typing = false;
        from = null;
      }
    });
    window.addEventListener('blur', () => (this.typing = false));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') this.typing = false;
    });
    document.addEventListener('focusout', (e) => {
      // A page that closes while it holds the keyboard loses it in the middle of being
      // taken down, where nothing may be changed, so the room comes back a moment later.
      if ((e.target as HTMLElement | null)?.closest?.('.cm-editor')) setTimeout(() => (this.typing = false), 0);
    });
  }
}

export const quiet = new Quiet();
