import { slugify } from '../slug.ts';
import { splitHeader, withHeader } from '../world.ts';
import { headingsOf, titleFromName } from './index.ts';

/**
 * A manuscript's title page (Mike, October 25). It is kept as fields in the header of
 * the manuscript's `book.md`, and the app draws the page from them, so the series line
 * and the copyright line are never typed by hand.
 */
export interface TitlePage {
  title: string;
  subtitle: string;
  /** The series' name, such as "Wayfarer Chronicles". */
  series: string;
  /** Its place in the series, from 1. */
  number: number | null;
  /** What one installment of the series is called: Story, Book, Novel, or Tale. */
  seriesWord: string;
  /**
   * What the book's parts are called, such as Chapter, Part, or Episode (Mike, October
   * 31). A series board sets it for every book in the series at once.
   */
  partWord: string;
  /**
   * The author profile the book is linked to (Mike, October 26), by its id in the
   * library's `immersion.md`. While it is set, the profile's names are the book's, and
   * `author` and `copyright` are not kept in the book.
   */
  profile: string;
  /** The author written out by hand, for a book with no profile. */
  author: string;
  /** Who holds the copyright, written out by hand. */
  copyright: string;
  year: number | null;
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'];

export function ordinal(n: number): string {
  if (ORDINALS[n - 1]) return ORDINALS[n - 1];
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function ordinalNumber(word: string): number | null {
  const i = ORDINALS.findIndex((o) => o.toLowerCase() === word.toLowerCase());
  if (i >= 0) return i + 1;
  const m = /^(\d+)(st|nd|rd|th)$/i.exec(word);
  return m ? Number(m[1]) : null;
}

/** "The Second Story in the Wayfarer Chronicles", or '' without a series. */
export function seriesLine(page: Pick<TitlePage, 'series' | 'number' | 'seriesWord'>): string {
  const series = page.series.trim();
  if (!series) return '';
  const name = /^the\s/i.test(series) ? series : `the ${series}`;
  const word = page.seriesWord.trim() || 'Story';
  return page.number ? `The ${ordinal(page.number)} ${word} in ${name}` : `A ${word} in ${name}`;
}

const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const whole = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : null);

export function readTitlePage(bookText: string, fallbackTitle: string): TitlePage {
  const { header, body } = splitHeader(bookText);
  const h1 = headingsOf(body).find((h) => h.level === 1);
  return {
    title: h1?.title ?? (text(header.title) || fallbackTitle),
    subtitle: text(header.subtitle),
    series: text(header.series),
    number: whole(header.number),
    seriesWord: text(header.series_word) || 'Story',
    partWord: text(header.part_word).trim() || 'Chapter',
    profile: text(header.profile),
    author: text(header.author),
    copyright: text(header.copyright),
    year: whole(header.year),
  };
}

/** Writes a title page into a `book.md`, keeping everything else in it. */
export function withTitlePage(bookText: string, page: TitlePage): string {
  const blank = (s: string) => s.trim() || undefined;
  let out = withHeader(bookText, {
    subtitle: blank(page.subtitle),
    series: blank(page.series),
    number: page.series.trim() && page.number ? page.number : undefined,
    series_word: page.series.trim() && page.seriesWord.trim() && page.seriesWord !== 'Story' ? page.seriesWord.trim() : undefined,
    part_word: page.partWord.trim() && page.partWord.trim() !== 'Chapter' ? page.partWord.trim() : undefined,
    profile: blank(page.profile),
    author: page.profile.trim() ? undefined : blank(page.author),
    copyright: page.profile.trim() ? undefined : blank(page.copyright),
    year: page.year ?? undefined,
  });
  const { body } = splitHeader(out);
  const offset = out.length - body.length;
  const h1 = /^#\s+.*$/m.exec(body);
  out = h1 ? out.slice(0, offset) + body.replace(h1[0], `# ${page.title.trim()}`) : `${out.replace(/\s*$/, '')}${out.trim() ? '\n\n' : ''}# ${page.title.trim()}\n`;
  return out;
}

/** A new `book.md` with nothing but its title page. */
export function newBook(page: TitlePage): string {
  return withTitlePage(`# ${page.title.trim()}\n`, page);
}

/** What a new book's title page starts with: a profile to link to, or names written out. */
export interface PageDefaults {
  profile?: string;
  author?: string;
  copyright?: string;
}

export function blankPage(title: string, defaults: PageDefaults = {}): TitlePage {
  const named = !!(defaults.profile || defaults.copyright);
  return { title, subtitle: '', series: '', number: null, seriesWord: 'Story', partWord: 'Chapter', profile: defaults.profile ?? '', author: defaults.author ?? '', copyright: defaults.copyright ?? '', year: named ? new Date().getFullYear() : null };
}

const FRONT = /^(dedication|epigraph|foreword|preface|contents|table of contents|copyright)$/i;
const BACK = /^(acknowledge?ments?|about the author|afterword|author'?s note|a note from the author|glossary|appendix\b.*|also by\b.*)$/i;
const MACHINE = ['manuscript', 'shelved'];
/** The longest italic line under a title that is still read as its subtitle. */
const SUBTITLE_WORDS = 15;

/**
 * Turns a manuscript kept as one file into the files of a manuscript folder (Mike,
 * October 25): `book.md` with the title page, a file for each chapter, and pages such as
 * a dedication in `front/` and `back/`. A title page typed out as text under the title
 * becomes the title page's fields. Paths are relative to the new folder.
 */
export function fileToFolder(source: string, fileName: string): { title: string; files: Record<string, string> } {
  const { header, body } = splitHeader(source);
  const headings = headingsOf(body);
  const tops = headings.filter((h) => h.level === 1);
  const level = tops.length > 1 ? 1 : 2;
  const titleHeading = tops.length === 1 ? tops[0] : null;
  const title = titleHeading?.title ?? (text(header.title) || titleFromName(fileName));
  const chapters = headings.filter((h) => h.level === level);

  const startOfPreamble = titleHeading ? body.indexOf('\n', titleHeading.offset) + 1 || body.length : 0;
  const preamble = body.slice(startOfPreamble, chapters[0]?.offset ?? body.length);

  // The title page, when it was typed out under the title.
  const page = blankPage(title);
  const kept: string[] = [];
  for (const line of preamble.split('\n')) {
    const t = line.trim();
    let m: RegExpExecArray | null;
    if ((m = /^\*(?:The\s+)?(\w+)\s+(Story|Book|Novel|Tale)\s+in\s+(?:the\s+)?(.+?)\*$/i.exec(t)) && ordinalNumber(m[1])) {
      page.number = ordinalNumber(m[1]);
      page.seriesWord = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
      page.series = m[3].trim();
    } else if ((m = /^\*\*by\s+(.+?)\*\*$/i.exec(t))) page.author = m[1].trim();
    else if ((m = /^copyright\s*(?:©|\(c\))?\s*(\d{4})?\s*(.*)$/i.exec(t))) {
      page.year = m[1] ? Number(m[1]) : null;
      page.copyright = m[2].trim();
    } else if (/^all rights reserved\.?$/i.test(t)) continue;
    // Only a short italic line is a subtitle. A longer one is a note, and stays with the text.
    else if ((m = /^\*([^*].*?)\*$/.exec(t)) && !page.subtitle && !kept.some((k) => k.trim()) && m[1].trim().split(/\s+/).length <= SUBTITLE_WORDS) page.subtitle = m[1].trim();
    else kept.push(line);
  }

  const keptHeader: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(header)) if (!MACHINE.includes(key) && key !== 'title') keptHeader[key] = value;
  let book = withTitlePage(withHeader(`# ${title}\n`, keptHeader), page);
  const notes = kept.join('\n').trim();
  if (notes) book = `${book.replace(/\s*$/, '')}\n\n${notes}\n`;

  // A chapter's own headings move up one level, because its title becomes the file's top heading.
  const promote = (s: string) => (level === 2 ? s.replace(/^#(#{2,6}\s)/gm, '$1') : s);
  const blocks = chapters.map((h, i) => {
    const end = chapters[i + 1]?.offset ?? body.length;
    const rest = body.slice(body.indexOf('\n', h.offset) + 1 || end, end).trim();
    return { title: h.title, content: `# ${h.title}\n\n${rest ? promote(rest) + '\n' : ''}` };
  });
  if (!blocks.length) {
    const rest = kept.join('\n').trim();
    blocks.push({ title: 'Chapter 1', content: `# Chapter 1\n\n${rest ? rest + '\n' : ''}` });
    book = withTitlePage(withHeader(`# ${title}\n`, keptHeader), page);
  }

  // Pages like a dedication before the first chapter of the story, and acknowledgements after the last.
  let first = blocks.findIndex((b) => !FRONT.test(b.title));
  if (first < 0) first = blocks.length;
  let last = blocks.length - 1;
  while (last >= first && BACK.test(blocks[last].title)) last--;

  const files: Record<string, string> = { 'book.md': book };
  const n = (i: number) => String(i + 1).padStart(2, '0');
  const name = (b: { title: string }, i: number) => `${n(i)}-${slugify(b.title) || 'chapter'}.md`;
  blocks.slice(0, first).forEach((b, i) => (files[`front/${name(b, i)}`] = b.content));
  blocks.slice(first, last + 1).forEach((b, i) => (files[name(b, i)] = b.content));
  blocks.slice(last + 1).forEach((b, i) => (files[`back/${name(b, i)}`] = b.content));
  return { title, files };
}
