import nspell from 'nspell';

/** What reads a dictionary: whether a word is in it, and what a word might have been. */
export interface Checker {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
}

type Files = [{ default: string }, { default: string }];
const english = (language: 'american' | 'british'): Promise<Files> =>
  language === 'british'
    ? Promise.all([import('../../node_modules/dictionary-en-gb/index.aff?raw'), import('../../node_modules/dictionary-en-gb/index.dic?raw')])
    : Promise.all([import('../../node_modules/dictionary-en/index.aff?raw'), import('../../node_modules/dictionary-en/index.dic?raw')]);
const spanishFiles = (): Promise<Files> => Promise.all([import('../../node_modules/dictionary-es-mx/index.aff?raw'), import('../../node_modules/dictionary-es-mx/index.dic?raw')]);

/** A word without its accents, to tell a missing accent from a different word. */
const bare = (w: string) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Reads the word list for one kind of English, and with `spanish` the Mexican Spanish
 * list beside it (Mike, November 21, whose city speaks both). A word is then well spelled
 * if either language has it. What a misspelled word might have been comes from both,
 * with a missing accent first, so that pequena offers pequeña before anything else. The
 * lists are large files, so each is only fetched when asked for.
 */
export async function loadDictionary(language: 'american' | 'british', spanish = false): Promise<Checker> {
  const [[aff, dic], es] = await Promise.all([english(language), spanish ? spanishFiles() : null]);
  const en = nspell(aff.default, dic.default);
  const second = es ? nspell(es[0].default, es[1].default) : null;
  // A possessive is as well spelled as the word it is made from.
  const inEnglish = (w: string) => en.correct(w) || (/'s$/i.test(w) && en.correct(w.slice(0, -2)));
  return {
    correct: (w) => inEnglish(w) || !!second?.correct(w),
    suggest: (w) => {
      const theirs = second?.suggest(w) ?? [];
      const accents = theirs.filter((s) => bare(s) === bare(w));
      const ours = en.suggest(w).slice(0, 4);
      // Spanish guesses at an English slip are noise, so they are offered only where English has none.
      return [...new Set([...accents, ...ours, ...(ours.length ? [] : theirs.slice(0, 4))])].slice(0, 6);
    },
  };
}
