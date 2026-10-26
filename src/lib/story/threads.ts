import { splitHeader, withHeader } from '../world.ts';

/**
 * Threads (Mike, October 25): the plotlines, character arcs, or timeline branches that
 * run alongside a manuscript's chapters. A manuscript's header keeps their order as
 * `threads:`, and the first name there is the main thread's, whose beats carry no label.
 * A thread found in the chapters but missing from the header joins the end of the list.
 */
export interface Thread {
  /** The label on the thread's outline callouts, or '' for the main thread. */
  key: string;
  name: string;
}

export const MAIN_THREAD = 'Main plot';

/** The thread names listed in a header's `threads:`, or an empty list. */
export function listedThreads(headerText: string): string[] {
  const { header } = splitHeader(headerText);
  return namesIn(header.threads);
}

export function namesIn(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim()) : [];
}

export function threadsFrom(headerText: string, found: Iterable<string>): Thread[] {
  return threadsFromNames(listedThreads(headerText), found);
}

/** The full thread list from the names kept in order and the thread keys found in the beats. */
export function threadsFromNames(listed: string[], found: Iterable<string>): Thread[] {
  const main = listed[0] ?? MAIN_THREAD;
  const others = listed.slice(1);
  for (const key of found) if (key && !others.includes(key)) others.push(key);
  return [{ key: '', name: main }, ...others.map((name) => ({ key: name, name }))];
}

/** Writes a thread list into a header, leaving it out while there is only the default main thread. */
export function withThreads(text: string, threads: Thread[]): string {
  const plain = threads.length === 1 && threads[0].name === MAIN_THREAD;
  return withHeader(text, { threads: plain ? undefined : threads.map((t) => t.name) });
}
