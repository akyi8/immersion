/**
 * Dates as writers write them (Mike, October 25). An entry's `when:` line says when it
 * happened, in whatever form suits it, and the timeline sorts by it while showing it as
 * written:
 *
 * - a year, `2954`, `44 BCE`, `10,000 BCE`, or `AD 33`;
 * - a month or a day, `October 1066`, `14 October 1066`, `Oct 14, 1066`, `1066-10-14`, or
 *   `10/14/1066`, which reads month first, as written in the United States;
 * - a season, `spring 2088`;
 * - a decade or a century, `1920s`, `5th century BCE`;
 * - an approximate date, `c. 1200 BCE` or `around 1200 BCE`;
 * - a span, `1914 to 1918` or `1914–1918`.
 *
 * Years are counted astronomically underneath, so 1 BCE is year 0 and there is no gap
 * between 1 BCE and AD 1.
 */
export interface When {
  /** As written. */
  text: string;
  /** Where it starts and ends, in years, for sorting and for finding its era. */
  start: number;
  end: number;
  approximate: boolean;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SEASONS: Record<string, number> = { spring: 2, summer: 5, autumn: 8, fall: 8, winter: 11 };

function era(year: number, bce: boolean): number {
  return bce ? 1 - year : year;
}

/** One point or stretch of time, without a span. Returns [start, end] in years. */
function point(raw: string): [number, number] | null {
  let s = raw.trim().toLowerCase().replace(/,(?=\d{3})/g, '');
  const bce = /\b(bce|bc)\b\.?$/.test(s);
  s = s.replace(/\b(bce|bc|ce|ad)\b\.?/g, '').trim();

  let m: RegExpExecArray | null;
  // 1066-10-14, 1066-10
  if ((m = /^(-?\d{1,6})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s))) {
    const y = era(Number(m[1]), bce);
    const month = Number(m[2]) - 1;
    const day = m[3] ? Number(m[3]) - 1 : null;
    const at = y + month / 12 + (day ?? 0) / 365;
    return [at, day === null ? y + (month + 1) / 12 : at + 1 / 365];
  }
  // 10/14/1066, month first (Mike, October 26)
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(-?\d{1,6})$/.exec(s))) {
    const month = Number(m[1]) - 1;
    const day = Number(m[2]) - 1;
    if (month > 11 || day > 30) return null;
    const at = era(Number(m[3]), bce) + month / 12 + day / 365;
    return [at, at + 1 / 365];
  }
  // 1920s, 1900s
  if ((m = /^(\d{1,5})0s$/.exec(s))) {
    const y = era(Number(m[1]) * 10, bce);
    return bce ? [y - 9, y + 1] : [y, y + 10];
  }
  // 5th century, 21st century
  if ((m = /^(\d{1,3})(?:st|nd|rd|th)\s+century$/.exec(s))) {
    const c = Number(m[1]);
    return bce ? [era(c * 100, true), era((c - 1) * 100 + 1, true) + 1] : [(c - 1) * 100 + 1, c * 100 + 1];
  }
  // spring 2088
  if ((m = /^(spring|summer|autumn|fall|winter)\s+(?:of\s+)?(-?\d{1,6})$/.exec(s))) {
    const y = era(Number(m[2]), bce);
    return [y + SEASONS[m[1]] / 12, y + (SEASONS[m[1]] + 3) / 12];
  }
  // 14 October 1066, October 14 1066, October 1066
  const words = s.replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const month = words.findIndex((w) => MONTHS.some((name) => name.startsWith(w.slice(0, 3)) && w.length >= 3 && name.startsWith(w)));
  if (month >= 0 && words.length >= 2) {
    const mi = MONTHS.findIndex((name) => name.startsWith(words[month]));
    const nums = words.filter((_, i) => i !== month).map(Number);
    if (nums.every((n) => Number.isFinite(n)) && nums.length >= 1 && nums.length <= 2) {
      const year = era(nums.length === 2 ? Math.max(nums[0], nums[1]) : nums[0], bce);
      const day = nums.length === 2 ? Math.min(nums[0], nums[1]) - 1 : null;
      const at = year + mi / 12 + (day ?? 0) / 365;
      return [at, day === null ? year + (mi + 1) / 12 : at + 1 / 365];
    }
  }
  // 2954, 44
  if ((m = /^(?:year\s+)?(-?\d{1,6})$/.exec(s))) {
    const y = era(Number(m[1]), bce);
    return [y, y + 1];
  }
  return null;
}

/** Reads a `when:` value, or null when it is not a date the timeline can place. */
export function parseWhen(value: unknown): When | null {
  if (typeof value === 'number' && Number.isFinite(value)) return { text: String(value), start: value, end: value + 1, approximate: false };
  if (value instanceof Date) value = value.toISOString().slice(0, 10);
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  let s = text;
  const approximate = /^(c\.|ca\.|circa|around|about|~)\s*/i.test(s);
  s = s.replace(/^(c\.|ca\.|circa|around|about|~)\s*/i, '');
  // A span: "1914 to 1918", "1914–1918", "44 BCE - AD 14". A trailing BCE applies to both ends.
  const span = /^(.+?)\s*(?:\bto\b|–|—|\s-\s|(?<=\d)-(?=\d{3,}))\s*(.+)$/i.exec(s);
  if (span && !/^-?\d{1,6}-\d{1,2}(-\d{1,2})?$/.test(s)) {
    const [, a, b] = span;
    const sharedBce = /\b(bce|bc)\b\.?$/i.test(b) && !/\b(bce|bc|ce|ad)\b/i.test(a);
    const from = point(sharedBce ? `${a} BCE` : a);
    const to = point(b);
    if (from && to) return { text, start: Math.min(from[0], to[0]), end: Math.max(from[1], to[1]), approximate };
  }
  const at = point(s);
  return at ? { text, start: at[0], end: at[1], approximate } : null;
}

/** True when `inner` falls within `outer`, as an event falls within an era. */
export function within(inner: When, outer: When): boolean {
  return inner.start >= outer.start && inner.start < outer.end;
}
