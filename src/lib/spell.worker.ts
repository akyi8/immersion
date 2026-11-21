/// <reference lib="webworker" />
import { loadDictionary, type Checker } from './spell.dictionary';

/**
 * The spelling dictionary, kept off the page's own thread so that reading it never holds
 * up typing. It answers which of some words are misspelled and what a word might have
 * been meant to be. A dictionary that cannot be read is reported, never passed over, so
 * the page can read it for itself.
 */
let checker: Promise<Checker> | null = null;

self.onmessage = async (e: MessageEvent<{ id: number; type: 'language' | 'check' | 'suggest'; language?: 'american' | 'british'; spanish?: boolean; words?: string[]; word?: string }>) => {
  const m = e.data;
  if (m.type === 'language') {
    checker = loadDictionary(m.language ?? 'american', !!m.spanish);
    checker.catch(() => {});
    return;
  }
  checker ??= loadDictionary('american');
  try {
    const c = await checker;
    if (m.type === 'check') self.postMessage({ id: m.id, wrong: (m.words ?? []).filter((w) => !c.correct(w)) });
    else self.postMessage({ id: m.id, suggestions: c.suggest(m.word ?? '') });
  } catch (err) {
    self.postMessage({ id: m.id, problem: err instanceof Error ? err.message : String(err) });
  }
};
