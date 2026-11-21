import nspell from 'nspell';

/** What reads a dictionary: whether a word is in it, and what a word might have been. */
export interface Checker {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
}

/** Reads the word list for one kind of English. It is a large file, so it is only fetched when asked for. */
export async function loadDictionary(language: 'american' | 'british'): Promise<Checker> {
  const [aff, dic] =
    language === 'british'
      ? await Promise.all([import('../../node_modules/dictionary-en-gb/index.aff?raw'), import('../../node_modules/dictionary-en-gb/index.dic?raw')])
      : await Promise.all([import('../../node_modules/dictionary-en/index.aff?raw'), import('../../node_modules/dictionary-en/index.dic?raw')]);
  const c = nspell(aff.default, dic.default);
  // A possessive is as well spelled as the word it is made from.
  return { correct: (w) => c.correct(w) || (/'s$/i.test(w) && c.correct(w.slice(0, -2))), suggest: (w) => c.suggest(w).slice(0, 5) };
}
