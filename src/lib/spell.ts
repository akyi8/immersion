/**
 * Spelling (Mike, November 21). A misspelled word is set a little greyer and nothing
 * else, and a right click on it offers what it might have been and adds it to the
 * writer's own dictionary. A world's names and a game's terms are never misspelled.
 *
 * The dictionary is American English, and a world can ask for British. It is read in a
 * worker, and a word is looked up once and remembered, so checking costs nothing while
 * typing.
 */
export type Language = 'american' | 'british';

export interface Word {
  from: number;
  to: number;
  word: string;
}

/**
 * The words of a line that can be checked. A word is letters with apostrophes inside it.
 * Words beside a digit, words all in capitals, single letters, and the parts of an
 * address or a file's name are left alone, since they are codes, initials, and labels
 * more often than they are misspellings.
 */
export function wordsIn(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/[\p{L}][\p{L}'’]*/gu)) {
    let from = m.index!;
    let word = m[0].replace(/’/g, "'");
    const before = text[from - 1] ?? '';
    const after = text[from + word.length] ?? '';
    if (/[\p{N}_@/\\]/u.test(before) || /[\p{N}_@/\\]/u.test(after)) continue;
    // A full stop with no space on either side joins the parts of an address or a file's name.
    if ((before === '.' && /\S/.test(text[from - 2] ?? ' ')) || (after === '.' && /[\p{L}\p{N}]/u.test(text[from + word.length + 1] ?? ''))) continue;
    word = word.replace(/'+$/, '');
    if (word.length < 2 || word === word.toUpperCase()) continue;
    out.push({ from, to: from + word.length, word });
  }
  return out;
}

const ON_KEY = 'immersion.spelling';

class Spell {
  on = (() => {
    try {
      return localStorage.getItem(ON_KEY) !== 'off';
    } catch {
      return true;
    }
  })();
  language: Language = 'american';
  /** Words looked up so far: true for a word the dictionary has. */
  private known = new Map<string, boolean>();
  private asked = new Set<string>();
  /** Words that are never misspelled, in lowercase, by where they came from. */
  // The American word list leaves out a spelling American writers use every day.
  private allowed = new Map<string, Set<string>>([['both', new Set(['grey', 'greys', 'greyed', 'greying', 'greyer', 'greyest', 'greyish'])]]);
  private listeners = new Set<() => void>();
  private worker: Worker | null = null;
  private waiting = new Map<number, (m: { wrong?: string[]; suggestions?: string[] }) => void>();
  private next = 1;
  /** Keeps a word the writer adds, wherever the writer's own dictionary is kept. */
  onAdd: ((word: string) => void) | null = null;
  /** Changes which English the open world is spelled in, when a world is open. */
  onLanguage: ((language: Language) => void) | null = null;

  private post(message: Record<string, unknown>): Promise<{ wrong?: string[]; suggestions?: string[] }> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; wrong?: string[]; suggestions?: string[] }>) => {
        this.waiting.get(e.data.id)?.(e.data);
        this.waiting.delete(e.data.id);
      };
      this.worker.postMessage({ id: 0, type: 'language', language: this.language });
    }
    const id = this.next++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.worker!.postMessage({ id, ...message });
    });
  }

  /** Runs when what is misspelled may have changed, so a page can draw itself again. */
  listen(run: () => void): () => void {
    this.listeners.add(run);
    return () => this.listeners.delete(run);
  }
  private changed() {
    for (const run of this.listeners) run();
  }

  setOn(on: boolean) {
    this.on = on;
    try {
      localStorage.setItem(ON_KEY, on ? 'on' : 'off');
    } catch {
      // Kept until the app closes.
    }
    this.changed();
  }

  setLanguage(language: Language) {
    if (language === this.language) return;
    this.language = language;
    this.known.clear();
    this.asked.clear();
    this.worker?.postMessage({ id: 0, type: 'language', language });
    this.changed();
  }

  /** Names a set of words that are never misspelled, such as a world's names. A later call with the same key replaces it. */
  allow(key: string, names: Iterable<string>) {
    const set = new Set<string>();
    for (const name of names) for (const w of wordsIn(name)) set.add(w.word.toLowerCase().replace(/'s$/, ''));
    this.allowed.set(key, set);
    this.changed();
  }

  private fine(word: string): boolean {
    const lower = word.toLowerCase();
    // A name's possessive is as well spelled as the name.
    const stem = lower.endsWith("'s") ? lower.slice(0, -2) : lower;
    for (const set of this.allowed.values()) if (set.has(lower) || set.has(stem)) return true;
    return false;
  }

  /** Whether a word is known to be misspelled. A word not looked up yet is not. */
  wrong(word: string): boolean {
    return this.on && this.known.get(word) === false && !this.fine(word);
  }

  /** Looks up the words that have not been looked up, and tells the listeners when the answer is in. */
  check(words: string[]) {
    if (!this.on) return;
    const fresh = [...new Set(words)].filter((w) => !this.known.has(w) && !this.asked.has(w) && !this.fine(w));
    if (!fresh.length) return;
    for (const w of fresh) this.asked.add(w);
    const language = this.language;
    void this.post({ type: 'check', words: fresh }).then((m) => {
      if (language !== this.language) return;
      const wrong = new Set(m.wrong ?? []);
      for (const w of fresh) {
        this.known.set(w, !wrong.has(w));
        this.asked.delete(w);
      }
      if (wrong.size) this.changed();
    });
  }

  async suggest(word: string): Promise<string[]> {
    return (await this.post({ type: 'suggest', word })).suggestions ?? [];
  }

  /** Adds a word to the writer's own dictionary. */
  add(word: string) {
    const mine = new Set(this.allowed.get('mine') ?? []);
    mine.add(word.toLowerCase());
    this.allowed.set('mine', mine);
    this.onAdd?.(word.toLowerCase());
    this.changed();
  }
}

export const spell = new Spell();
