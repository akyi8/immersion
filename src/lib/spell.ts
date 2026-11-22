/**
 * Spelling (Cerys, November 21). A misspelled word is set a little greyer and nothing
 * else, and a right click on it offers what it might have been and adds it to the
 * writer's own dictionary. A world's names and a game's terms are never misspelled.
 *
 * The dictionary is American English, and a world can ask for British. It is read in a
 * worker, and a word is looked up once and remembered, so checking costs nothing while
 * typing.
 */
import { noteTrouble } from './trouble.ts';

export type Language = 'american' | 'british';

type Message = { type: 'check' | 'suggest'; words?: string[]; word?: string };
type Answer = { wrong?: string[]; suggestions?: string[]; unread?: boolean };
type Checker = { correct: (word: string) => boolean; suggest: (word: string) => string[] };

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
  /** Whether Spanish words are well spelled too, for a world written in both. */
  spanish = false;
  /** Words looked up so far: true for a word the dictionary has. */
  private known = new Map<string, boolean>();
  private asked = new Set<string>();
  /** Words that are never misspelled, in lowercase, by where they came from. */
  // The American word list leaves out a spelling American writers use every day.
  private allowed = new Map<string, Set<string>>([['both', new Set(['grey', 'greys', 'greyed', 'greying', 'greyer', 'greyest', 'greyish'])]]);
  private listeners = new Set<() => void>();
  private worker: Worker | null = null;
  private waiting = new Map<number, { resolve: (m: Answer) => void; message: Message }>();
  private next = 1;
  /** Keeps a word the writer adds, wherever the writer's own dictionary is kept. */
  onAdd: ((word: string) => void) | null = null;
  /** Changes which English the open world is spelled in, when a world is open. */
  onLanguage: ((language: Language) => void) | null = null;
  /** Changes whether the open world is spelled in Spanish as well, when a world is open. */
  onSpanish: ((on: boolean) => void) | null = null;

  /** How the dictionary is being read: in its worker, on the page itself, or not at all. */
  status: 'starting' | 'worker' | 'page' | 'failed' = 'starting';
  /** Why the worker could not be used, or the dictionary could not be read at all. */
  problem = '';
  private local: Promise<Checker> | null = null;

  /**
   * The worker could not read the dictionary, or never answered (Cerys, November 21: no
   * word was ever marked in the desktop app, and nothing said why). The page reads the
   * dictionary itself from here on, which costs a moment once and then works the same.
   */
  private fallBack(reason: string) {
    if (this.local) return;
    this.problem = reason;
    noteTrouble('spelling', `The spelling dictionary could not be read in its worker (${reason}), so the page is reading it itself.`);
    this.worker?.terminate();
    this.worker = null;
    this.local = import('./spell.dictionary.ts').then((m) => m.loadDictionary(this.language, this.spanish));
    this.local.then(
      () => (this.status = 'page'),
      (e) => {
        this.status = 'failed';
        this.problem = e instanceof Error ? e.message : String(e);
        noteTrouble('spelling', `The spelling dictionary could not be read at all: ${this.problem}`);
      },
    );
    // What was asked of the worker is asked again here.
    const asked = [...this.waiting.values()];
    this.waiting.clear();
    for (const w of asked) void this.answer(w.message).then(w.resolve);
    this.asked.clear();
    this.changed();
  }

  private async answer(message: Message): Promise<Answer> {
    try {
      const c = await this.local!;
      return message.type === 'check' ? { wrong: (message.words ?? []).filter((w) => !c.correct(w)) } : { suggestions: c.suggest(message.word ?? '') };
    } catch {
      return { wrong: [], suggestions: [], unread: true };
    }
  }

  private post(message: Message): Promise<Answer> {
    if (this.local) return this.answer(message);
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
      } catch (e) {
        this.fallBack(e instanceof Error ? e.message : String(e));
        return this.answer(message);
      }
      this.worker.onmessage = (e: MessageEvent<Answer & { id: number; problem?: string }>) => {
        if (e.data.problem) return this.fallBack(e.data.problem);
        this.waiting.get(e.data.id)?.resolve(e.data);
        this.waiting.delete(e.data.id);
      };
      this.worker.onerror = (e) => this.fallBack(e.message || 'the worker failed to start');
      this.worker.postMessage({ id: 0, type: 'language', language: this.language, spanish: this.spanish });
      // The worker proves itself on two words before it is trusted: one any dictionary
      // has and one none does. No answer in good time counts as none.
      const proof = setTimeout(() => this.status === 'starting' && this.fallBack('it did not answer'), 12000);
      void this.post({ type: 'check', words: ['the', 'zzxqjv'] }).then((m) => {
        clearTimeout(proof);
        if (this.local) return;
        if (m.wrong?.length === 1 && m.wrong[0] === 'zzxqjv') this.status = 'worker';
        else this.fallBack('it gave a wrong answer to a test word');
      });
    }
    const id = this.next++;
    return new Promise((resolve) => {
      this.waiting.set(id, { resolve, message });
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

  setLanguage(language: Language, spanish = false) {
    if (language === this.language && spanish === this.spanish) return;
    this.language = language;
    this.spanish = spanish;
    this.known.clear();
    this.asked.clear();
    this.worker?.postMessage({ id: 0, type: 'language', language, spanish });
    if (this.local) this.local = import('./spell.dictionary.ts').then((m) => m.loadDictionary(language, spanish));
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
    const language = `${this.language}${this.spanish}`;
    void this.post({ type: 'check', words: fresh }).then((m) => {
      if (language !== `${this.language}${this.spanish}`) return;
      // A dictionary that could not be read answers nothing, and the words are asked again later.
      if (m.unread) return void fresh.forEach((w) => this.asked.delete(w));
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
