declare module 'nspell' {
  /** A Hunspell-compatible spelling checker, made from a dictionary's affix and word files. */
  export default function nspell(aff: string, dic: string): { correct(word: string): boolean; suggest(word: string): string[] };
}
