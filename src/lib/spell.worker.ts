/// <reference lib="webworker" />
import nspell from 'nspell';

/**
 * The spelling dictionary, kept off the page's own thread so that reading it never holds
 * up typing. It answers which of some words are misspelled and what a word might have
 * been meant to be.
 */
type Checker = { correct: (word: string) => boolean; suggest: (word: string) => string[] };
let checker: Promise<Checker> | null = null;

async function load(language: 'american' | 'british'): Promise<Checker> {
  const [aff, dic] =
    language === 'british'
      ? await Promise.all([import('../../node_modules/dictionary-en-gb/index.aff?raw'), import('../../node_modules/dictionary-en-gb/index.dic?raw')])
      : await Promise.all([import('../../node_modules/dictionary-en/index.aff?raw'), import('../../node_modules/dictionary-en/index.dic?raw')]);
  return nspell(aff.default, dic.default) as Checker;
}

self.onmessage = async (e: MessageEvent<{ id: number; type: 'language' | 'check' | 'suggest'; language?: 'american' | 'british'; words?: string[]; word?: string }>) => {
  const m = e.data;
  if (m.type === 'language') {
    checker = load(m.language ?? 'american');
    return;
  }
  checker ??= load('american');
  try {
    const c = await checker;
    // A possessive is as well spelled as the word it is made from.
    const fine = (w: string) => c.correct(w) || (/'s$/i.test(w) && c.correct(w.slice(0, -2)));
    if (m.type === 'check') self.postMessage({ id: m.id, wrong: (m.words ?? []).filter((w) => !fine(w)) });
    else self.postMessage({ id: m.id, suggestions: c.suggest(m.word ?? '').slice(0, 5) });
  } catch (err) {
    self.postMessage({ id: m.id, wrong: [], suggestions: [], problem: String(err) });
  }
};
