/**
 * The quick finder (Mike, October 31): one box, opened with Ctrl or Cmd and K, that finds
 * anything in the world by name, such as an entry, a chapter, a note, or a board, along
 * with a few actions. This part does the matching, so it can be tested on its own.
 */
export interface Findable {
  /** What it is, shown beside its name, such as Entry or Chapter. */
  kind: string;
  name: string;
  /** Where it is or what it belongs to, such as People or The Wreckage. */
  detail: string;
  /** Other names that find it too, such as an entry's aliases. */
  also?: string[];
  run: () => void;
}

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * The things that match a query, best first. Every word of the query must appear in the
 * name, another name, or the detail. A name that starts with the query ranks first, then
 * a name holding the query's first word whole, then one with a word starting with it,
 * then any other match. Among equals, shorter names come first.
 */
export function find(items: Findable[], query: string, limit = 40): Findable[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = words.join(' ');
  const scored: { item: Findable; score: number; at: number }[] = [];
  items.forEach((item, at) => {
    const names = [item.name, ...(item.also ?? [])].map(fold);
    const hay = [...names, fold(item.detail)].join(' \u0000 ');
    if (!words.every((w) => hay.includes(w))) return;
    const parts = names.flatMap((n) => n.split(/[\s"'(—-]+/));
    let score = 4;
    if (names.some((n) => n.startsWith(q))) score = 0;
    else if (parts.includes(words[0])) score = 1;
    else if (parts.some((part) => part.startsWith(words[0]))) score = 2;
    else if (names.some((n) => n.includes(q))) score = 3;
    scored.push({ item, score, at });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.item.name.length - b.item.name.length || a.at - b.at)
    .slice(0, limit)
    .map((s) => s.item);
}
