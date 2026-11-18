/**
 * Picture framing for wiki entries (Mike, November 1). A picture file is never changed.
 * Instead, the entry's header remembers how it is framed: the point of the picture that
 * sits in view, as percentages across and down, and how far it is zoomed in. A portrait
 * (3 by 4) and a banner (wide, across the top of the entry) are framed separately, so
 * one photograph can be a face in one and a skyline in the other.
 *
 * Header fields: `portrait_frame: 50 30 1.4` and `banner_frame: 50 40 1`, read as
 * across, down, and zoom. `picture: banner` or `picture: portrait` overrides the
 * category's default, which is a portrait for people and a banner for everything else.
 *
 * A third shape lays the picture behind the page (Mike, November 10): `picture: behind`,
 * framed by `behind_frame:`. The page is then set like a card from the Radiance Adventure
 * Engine, with its name up the spine, over the picture, which stands down the page's left side and fades toward the text.
 */

export interface Frame {
  /** The point in view, from 0 (left edge) to 100 (right edge). */
  x: number;
  /** The point in view, from 0 (top edge) to 100 (bottom edge). */
  y: number;
  /** 1 fills the frame; larger numbers zoom in. */
  zoom: number;
}

export type Shape = 'portrait' | 'banner' | 'behind';

export const CENTERED: Frame = { x: 50, y: 50, zoom: 1 };
export const MAX_ZOOM = 4;

/** A banner's shape, as width over height. */
export const BANNER_RATIO = 16 / 7;

/**
 * The shape of the picture behind a page, as width over height: a tall strip down the
 * page's left side, behind the name on the spine (Mike, November 10). It is the same on
 * every page.
 */
export const BEHIND_RATIO = 10 / 17;

/**
 * How the picture behind a page fades (Mike, November 10). It stands clear along the
 * page's left edge, where the name runs up the spine over it, and goes out quickly toward
 * the text. The name and the picture share one side, which leaves the rest to the words. Its top and its outer edge are softened so it has no hard edge.
 * The page and the framing dialog use these same two values, and so show the same fade.
 */
const SIDE = 'linear-gradient(to left, transparent 0%, rgb(0 0 0 / 0.07) 22%, rgb(0 0 0 / 0.26) 42%, rgb(0 0 0 / 0.62) 56%, black 68%, black 88%, transparent 100%)';
const TOP = 'linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.5) 14%, black 30%)';
export const BEHIND_FADE = `-webkit-mask-image: ${SIDE}; mask-image: ${SIDE};`;
/** The same fade turned to face the pages, for the picture down the right edge of the Radiance room. */
const ROOM_SIDE = 'linear-gradient(to right, transparent 0%, rgb(0 0 0 / 0.07) 22%, rgb(0 0 0 / 0.26) 42%, rgb(0 0 0 / 0.62) 56%, black 68%)';
export const ROOM_FADE = `-webkit-mask-image: ${ROOM_SIDE}; mask-image: ${ROOM_SIDE};`;
export const BEHIND_TOP = `-webkit-mask-image: ${TOP}; mask-image: ${TOP};`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Reads a frame from a header value such as `50 30 1.4`. Anything unreadable is no frame. */
export function readFrame(value: unknown): Frame | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parts = String(value).trim().split(/[\s,]+/).map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return tidy({ x: parts[0], y: parts[1], zoom: parts[2] ?? 1 });
}

/** Keeps a frame inside the picture and within the zoom range. */
export function tidy(frame: Frame): Frame {
  return { x: round(clamp(frame.x, 0, 100), 1), y: round(clamp(frame.y, 0, 100), 1), zoom: round(clamp(frame.zoom, 1, MAX_ZOOM), 2) };
}

/** Writes a frame for the header, or nothing when it is the plain centered frame. */
export function writeFrame(frame: Frame | null): string | undefined {
  if (!frame) return undefined;
  const f = tidy(frame);
  if (f.x === 50 && f.y === 50 && f.zoom === 1) return undefined;
  return `${f.x} ${f.y} ${f.zoom}`;
}

/** Reads a `picture:` override. */
export function readShape(value: unknown): Shape | null {
  return value === 'banner' || value === 'portrait' || value === 'behind' ? value : null;
}

export const isPerson = (category: string) => category.toLowerCase() === 'people';

/** The shape a category's pictures take unless an entry says otherwise. */
/**
 * A world can say how all its pictures show (Mike, November 10), in `world.md` as
 * `pictures: behind`, `banner`, or `portrait`. An entry's own `picture:` still wins, and
 * without either the category decides.
 */
export const defaultShape = (category: string, world: Shape | null = null): Shape => world ?? (isPerson(category) ? 'portrait' : 'banner');

/**
 * How a name stands on a card's spine: one word large, and the rest small beside it.
 * Which word is the large one is the writer's choice (Mike, November 15), because no rule
 * can tell that Lou Lewandowski wants the surname and Sister Agnes wants Agnes. The
 * writer clicks a word on the spine to choose it, and the entry's `spine:` line keeps the
 * choice. Until then the app guesses: a nickname in quotes first, and otherwise the first
 * word that is not an article, a title, or a joining word. An article straight before
 * the large word stays with it, so The Docks reads whole.
 */
export interface SpineWord {
  /** The word as it shows, without quotes. */
  text: string;
  /** Whether this word stands large. */
  big: boolean;
  /** Whether the writer or the guess picked this word, as against an article that rides with one. */
  chosen: boolean;
  /** Whether a click can choose this word. Articles and joining words cannot be chosen. */
  choice: boolean;
}

export interface Spine {
  /** The large line. */
  main: string;
  /** The small line: the other words, in the order the name has them. */
  rest: string;
  words: SpineWord[];
  /** The word the app would choose on its own. */
  guess: string;
}

const ARTICLE = /^(the|a|an)$/i;
const JOINING = /^(of|and|de|del|della|di|da|du|la|le|von|van|der|den|ap|ab|bin|ibn|al|el|y|in|on|at|for)$/i;
const TITLE = /^(sir|dame|lord|lady|king|queen|prince|princess|duke|duchess|earl|count|countess|baron|baroness|saint|st\.?|sister|brother|father|mother|abbot|abbess|bishop|captain|commander|general|major|sergeant|officer|detective|doctor|dr\.?|professor|prof\.?|mr\.?|mrs\.?|ms\.?|miss|master|mistress|madame|don|doña|dona)$/i;
const QUOTED = /^["“‘'](.+?)["”’']$/;
const bare = (word: string) => word.replace(/^["“‘']|["”’',.;:]+$/g, '');
const sameWord = (a: string, b: string) => bare(a).toLowerCase() === bare(b).toLowerCase();

export function spineName(name: string, chosen: string | null = null): Spine {
  const raw = name.trim().split(/\s+/).filter(Boolean);
  if (!raw.length) return { main: '', rest: '', words: [], guess: '' };
  const plain = (w: string) => ARTICLE.test(bare(w)) || JOINING.test(bare(w));
  const nickname = raw.findIndex((w) => QUOTED.test(w) && bare(w).length > 0);
  const firstReal = raw.findIndex((w) => !plain(w) && !TITLE.test(bare(w)));
  const guessAt = nickname >= 0 ? nickname : firstReal >= 0 ? firstReal : Math.max(0, raw.findIndex((w) => !plain(w)));
  // The writer may choose more than one word, such as Salt Market (Mike, November 15).
  const wanted = (chosen ?? '').trim().split(/\s+/).filter(Boolean);
  const picked = new Set<number>();
  for (const word of wanted) {
    const at = raw.findIndex((w, i) => !picked.has(i) && sameWord(w, word));
    if (at >= 0) picked.add(at);
  }
  if (!picked.size) picked.add(guessAt);
  const big = new Set(picked);
  for (const at of picked) {
    // An article straight before a large word rides with it, and so does a joining word
    // caught between two large words, so Chantry of Pain reads whole.
    if (at > 0 && ARTICLE.test(bare(raw[at - 1]))) big.add(at - 1);
    for (let j = at + 1; j < raw.length && plain(raw[j]); j++) {
      if (picked.has(j + 1)) for (let k = at + 1; k <= j; k++) big.add(k);
    }
  }
  const words = raw.map((w, i) => ({ text: bare(w) || w, big: big.has(i), chosen: picked.has(i), choice: !plain(w) }));
  return {
    main: words.filter((w) => w.big).map((w) => w.text).join(' '),
    rest: words.filter((w) => !w.big).map((w) => w.text).join(' '),
    words,
    guess: bare(raw[guessAt]),
  };
}

/**
 * The style that frames an `<img>` filling its box. The picture covers the box, its
 * (x, y) point sits at the box's (x, y) point, and it is zoomed about that point, so the
 * picture never leaves a gap at any frame.
 */
export function frameStyle(frame: Frame | null | undefined): string {
  const f = frame ?? CENTERED;
  const at = `${f.x}% ${f.y}%`;
  return `object-fit: cover; object-position: ${at}; transform-origin: ${at}; transform: scale(${f.zoom});`;
}

/**
 * Moves a frame by a drag of (dx, dy) pixels over a box of the given size, for a picture
 * of the given natural size, so the picture follows the pointer exactly.
 */
export function dragged(frame: Frame, dx: number, dy: number, box: { width: number; height: number }, picture: { width: number; height: number }): Frame {
  const cover = Math.max(box.width / picture.width, box.height / picture.height) * frame.zoom;
  const spareX = picture.width * cover - box.width;
  const spareY = picture.height * cover - box.height;
  return tidy({
    ...frame,
    x: spareX > 0.5 ? frame.x - (dx / spareX) * 100 : frame.x,
    y: spareY > 0.5 ? frame.y - (dy / spareY) * 100 : frame.y,
  });
}
