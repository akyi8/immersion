/**
 * A short record of things that went wrong on this computer, so a problem that cannot be
 * made to happen again still leaves something to read (Mike, November 13: typing stopped
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
  const say = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    noteTrouble('console', args.map((a) => (a instanceof Error ? `${a.message}\n${(a.stack ?? '').split('\n').slice(0, 5).join('\n')}` : String(a))).join(' '));
    say(...args);
  };
}
