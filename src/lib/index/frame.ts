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
 * Engine, with its name up the spine and the picture low on the page, fading upward.
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

/** The shape of the picture behind a page, as width over height. */
export const BEHIND_RATIO = 16 / 10;

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
export const defaultShape = (category: string): Shape => (isPerson(category) ? 'portrait' : 'banner');

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
