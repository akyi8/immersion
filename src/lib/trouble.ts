/**
 * A short record of things that went wrong on this computer, so a problem that cannot be
 * made to happen again still leaves something to read (Cerys, November 13: typing stopped
 * in a game page and nothing said why). It keeps the last sixty notes in this computer's
 * own storage. Nothing here leaves the computer unless the writer copies it from Settings.
 */
const KEY = 'immersion.trouble';
const LIMIT = 60;

export interface Trouble {
  at: string;
  kind: string;
  detail: string;
}

function load(): Trouble[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

let notes: Trouble[] = load();

export function noteTrouble(kind: string, detail: unknown) {
  let text: string;
  if (detail instanceof Error) text = `${detail.message}\n${(detail.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
  else if (typeof detail === 'string') text = detail;
  else {
    try {
      text = JSON.stringify(detail);
    } catch {
      text = String(detail);
    }
  }
  const last = notes[notes.length - 1];
  // The same trouble many times over is kept once, so one fault cannot push out the rest.
  if (last && last.kind === kind && last.detail === text) return;
  notes = [...notes, { at: new Date().toISOString(), kind, detail: text.slice(0, 2000) }].slice(-LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // A computer that keeps nothing still holds the notes until the app closes.
  }
}

export const troubles = (): Trouble[] => notes;

export function clearTroubles() {
  notes = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing was kept, so nothing is left to clear.
  }
}

export const troubleText = (): string => notes.map((n) => `${n.at}  ${n.kind}\n${n.detail}`).join('\n\n');

let started = false;
/** Begins listening for errors nothing else caught. */
export function watchForTrouble() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('error', (e) => noteTrouble('error', e.error instanceof Error ? e.error : e.message));
  window.addEventListener('unhandledrejection', (e) => noteTrouble('unhandled', e.reason instanceof Error ? e.reason : String(e.reason)));
  watchFocus();
  const say = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    noteTrouble('console', args.map((a) => (a instanceof Error ? `${a.message}\n${(a.stack ?? '').split('\n').slice(0, 5).join('\n')}` : String(a))).join(' '));
    say(...args);
  };
}

/**
 * A short name for where the keyboard is: which open page by its number, and what kind
 * of field. It never holds a page's title or any of its words (code review, November 21).
 * This record is kept unencrypted and can be copied out, and the page may be a private
 * story in the vault.
 */
function placeOf(el: Element | null): string {
  if (!el || el === document.body) return 'nothing (the window itself)';
  const panes = [...document.querySelectorAll('section.pane')];
  const at = panes.findIndex((p) => p.contains(el));
  const pane = at >= 0 ? `page ${at + 1} of ${panes.length}` : 'outside the pages';
  const kind = el.classList.contains('cm-content') ? 'the text' : el.matches('input, textarea') ? 'a field' : el.matches('button') ? 'a button' : el.tagName.toLowerCase();
  return `${pane}, ${kind} (${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''})`;
}

/**
 * Notes when the keyboard leaves a field in the middle of typing with no click, Tab, or
 * Escape to explain it, and when the row of pages moves on its own (Cerys, November 21).
 * Both are things the writer never asked for, and the note says what took the keyboard
 * and whether the field typed in was thrown away and made again.
 */
function watchFocus() {
  let key = 0;
  let keyName = '';
  let pointer = 0;
  let last = 0;
  const typing = () => Date.now() - key < 4000 && Date.now() - pointer > 800 && !['Tab', 'Escape', 'Enter'].includes(keyName);
  window.addEventListener('keydown', (e) => ((key = Date.now()), (keyName = e.key)), true);
  for (const kind of ['pointerdown', 'wheel', 'touchstart']) window.addEventListener(kind, () => (pointer = Date.now()), { capture: true, passive: true });
  window.addEventListener(
    'focusout',
    (e) => {
      if (!typing() || Date.now() - last < 2000) return;
      const from = e.target as Element;
      const was = placeOf(from);
      const since = Date.now() - key;
      setTimeout(() => {
        if (document.activeElement === from) return;
        last = Date.now();
        noteTrouble(
          'focus',
          `The keyboard left ${was} ${since} ms after a key, with no click.\nIt went to ${placeOf(document.activeElement)}.\nThe field typed in ${from.isConnected ? 'is still on the page' : 'was removed from the page'}. The app's window ${document.hasFocus() ? 'still has' : 'lost'} the keyboard.`,
        );
      }, 30);
    },
    true,
  );
  let moved = 0;
  document.addEventListener(
    'scroll',
    (e) => {
      const strip = e.target as Element;
      if (!(strip instanceof Element) || !strip.classList.contains('strip') || !typing() || Date.now() - moved < 2000) return;
      moved = Date.now();
      noteTrouble('scroll', `The row of pages moved on its own ${Date.now() - key} ms after a key, to ${Math.round(strip.scrollLeft)} of ${Math.round(strip.scrollWidth - strip.clientWidth)}. The keyboard is in ${placeOf(document.activeElement)}.`);
    },
    true,
  );
}
