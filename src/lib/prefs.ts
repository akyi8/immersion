/**
 * Small choices about the interface that this computer remembers: which way a board
 * runs, which folders are folded, how wide a column is. They live in the browser's
 * storage, never in a world's files, and losing one is harmless, so a computer whose
 * storage is unavailable falls back to the default without a word.
 *
 * `word` and `keepWord` hold a plain word such as 'across'. `kept` and `keep` hold a
 * list or a record, as JSON.
 */
export function word(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function keepWord(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering the choice is harmless.
  }
}

export function kept<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function keep(key: string, value: unknown): void {
  keepWord(key, JSON.stringify(value));
}
