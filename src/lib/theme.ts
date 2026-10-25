/**
 * World themes (Mike, October 25). A world names two colors in its `world.md`: a base,
 * which carries structure such as rules, labels, focus, and selected states, and a
 * highlight, which marks names and primary actions. Every other color the app uses is
 * worked out from those two, so a theme stays readable with no further choices. A world
 * can also override the background and the text color when the worked-out ones look
 * wrong, and it chooses a heading font and a prose font from a curated set bundled with
 * the app. A world without a theme uses Night, the hand-tuned theme in `theme.css`.
 */

export interface ThemeSpec {
  base: string;
  highlight: string;
  /** Optional overrides, as hex colors. */
  background?: string;
  text?: string;
  /** Names from HEADING_FONTS and PROSE_FONTS. */
  headings?: string;
  prose?: string;
  /**
   * Overrides for the light side. Without them, the light side is worked out from the
   * same two colors: a pale background, dark text, and a highlight deep enough to read.
   */
  light?: SideOverrides;
}

export interface SideOverrides {
  base?: string;
  highlight?: string;
  background?: string;
  text?: string;
}

/** Each theme has a dark side and a light side, and one switch picks between them (Mike, October 25). */
export type Mode = 'dark' | 'light';

export interface FontChoice {
  name: string;
  kind: 'Sans' | 'Serif' | 'Mono' | 'Display';
  stack: string;
}

/** Heading faces. Each is bundled at the one weight that suits headings. */
export const HEADING_FONTS: FontChoice[] = [
  { name: 'Bebas Neue', kind: 'Sans', stack: "'Bebas Neue', sans-serif" },
  { name: 'Oxanium', kind: 'Sans', stack: "'Oxanium', sans-serif" },
  { name: 'Rajdhani', kind: 'Sans', stack: "'Rajdhani', sans-serif" },
  { name: 'Oswald', kind: 'Sans', stack: "'Oswald', sans-serif" },
  { name: 'Alata', kind: 'Sans', stack: "'Alata', sans-serif" },
  { name: 'Cinzel', kind: 'Serif', stack: "'Cinzel', serif" },
  { name: 'Playfair Display', kind: 'Serif', stack: "'Playfair Display', serif" },
  { name: 'Josefin Slab', kind: 'Serif', stack: "'Josefin Slab', serif" },
  { name: 'Vollkorn SC', kind: 'Serif', stack: "'Vollkorn SC', serif" },
  { name: 'IM Fell English SC', kind: 'Serif', stack: "'IM Fell English SC', serif" },
  { name: 'Space Mono', kind: 'Mono', stack: "'Space Mono', monospace" },
  { name: 'IBM Plex Mono', kind: 'Mono', stack: "'IBM Plex Mono', monospace" },
  { name: 'Special Elite', kind: 'Mono', stack: "'Special Elite', monospace" },
  { name: 'Averia Libre', kind: 'Display', stack: "'Averia Libre', sans-serif" },
  { name: 'Pirata One', kind: 'Display', stack: "'Pirata One', serif" },
  { name: 'Henny Penny', kind: 'Display', stack: "'Henny Penny', serif" },
  { name: 'Comforter Brush', kind: 'Display', stack: "'Comforter Brush', cursive" },
];

/**
 * Prose faces, for reading and writing. Each is bundled with whatever italic and bold
 * it has. Alata, Special Elite, Baloo 2, Dosis, and Quattrocento have no italic, and
 * Alata, Special Elite, and IM Fell English have no bold, so the browser slants or
 * thickens them itself.
 */
export const PROSE_FONTS: FontChoice[] = [
  { name: 'Atkinson Hyperlegible', kind: 'Sans', stack: "'Atkinson Hyperlegible', sans-serif" },
  { name: 'Inter', kind: 'Sans', stack: "'Inter', sans-serif" },
  { name: 'Source Sans 3', kind: 'Sans', stack: "'Source Sans 3', sans-serif" },
  { name: 'Alata', kind: 'Sans', stack: "'Alata', sans-serif" },
  { name: 'Josefin Sans', kind: 'Sans', stack: "'Josefin Sans', sans-serif" },
  { name: 'Baloo 2', kind: 'Sans', stack: "'Baloo 2', sans-serif" },
  { name: 'Dosis', kind: 'Sans', stack: "'Dosis', sans-serif" },
  { name: 'Ubuntu', kind: 'Sans', stack: "'Ubuntu', sans-serif" },
  { name: 'Literata', kind: 'Serif', stack: "'Literata', serif" },
  { name: 'EB Garamond', kind: 'Serif', stack: "'EB Garamond', serif" },
  { name: 'Source Serif 4', kind: 'Serif', stack: "'Source Serif 4', serif" },
  { name: 'Vollkorn', kind: 'Serif', stack: "'Vollkorn', serif" },
  { name: 'Quattrocento', kind: 'Serif', stack: "'Quattrocento', serif" },
  { name: 'IM Fell English', kind: 'Serif', stack: "'IM Fell English', serif" },
  { name: 'IBM Plex Mono', kind: 'Mono', stack: "'IBM Plex Mono', monospace" },
  { name: 'JetBrains Mono', kind: 'Mono', stack: "'JetBrains Mono', monospace" },
  { name: 'Special Elite', kind: 'Mono', stack: "'Special Elite', monospace" },
  { name: 'Averia Libre', kind: 'Display', stack: "'Averia Libre', sans-serif" },
];

export const NIGHT: Required<Pick<ThemeSpec, 'base' | 'highlight' | 'headings' | 'prose'>> = {
  base: '#2aa3a6',
  highlight: '#f19e2b',
  headings: 'Bebas Neue',
  prose: 'Atkinson Hyperlegible',
};

// Colors are worked out in OKLCH, where lightness matches what the eye sees, so a navy
// base and a teal base at the same lightness read as equally bright.

type Oklch = { l: number; c: number; h: number };

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim());
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch([r, g, b]: [number, number, number]): Oklch {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(a, B), h: ((Math.atan2(B, a) * 180) / Math.PI + 360) % 360 };
}

function oklchToRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLinear) as [number, number, number];
}

/** An OKLCH color as hex, with its chroma reduced until it fits on a screen. */
function hex(color: Oklch): string {
  let c = color.c;
  let rgb = oklchToRgb({ ...color, c });
  while (c > 0 && rgb.some((v) => v < -0.0005 || v > 1.0005)) {
    c = Math.max(0, c - 0.004);
    rgb = oklchToRgb({ ...color, c });
  }
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}

function luminance(hexColor: string): number {
  const [r, g, b] = hexToRgb(hexColor).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Lightens a color until it reaches `ratio` against `against`. */
function readable(color: Oklch, against: string, ratio: number): Oklch {
  let c = { ...color };
  while (c.l < 0.98 && contrast(hex(c), against) < ratio) c = { ...c, l: c.l + 0.01 };
  return c;
}

/** Darkens a color until it reaches `ratio` against `against`, for the light side. */
function inked(color: Oklch, against: string, ratio: number): Oklch {
  let c = { ...color };
  while (c.l > 0.05 && contrast(hex(c), against) < ratio) c = { ...c, l: c.l - 0.01 };
  return c;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Every color token the app uses, worked out from a theme's colors for one side. */
export function palette(spec: ThemeSpec, mode: Mode = 'dark'): Record<string, string> {
  return mode === 'light' ? lightPalette(spec) : darkPalette(spec);
}

function lightPalette(spec: ThemeSpec): Record<string, string> {
  const own = spec.light ?? {};
  const base = rgbToOklch(hexToRgb(isHex(own.base) ? own.base : isHex(spec.base) ? spec.base : NIGHT.base));
  const high = rgbToOklch(hexToRgb(isHex(own.highlight) ? own.highlight : isHex(spec.highlight) ? spec.highlight : NIGHT.highlight));
  const tint = Math.min(base.c, 0.16);
  const bgSeed = isHex(own.background) ? rgbToOklch(hexToRgb(own.background)) : { l: 0.965, c: tint * 0.12, h: base.h };
  const bg = hex(bgSeed);
  const at = (dl: number, chroma = bgSeed.c) => hex({ l: clamp(bgSeed.l + dl, 0, 1), c: chroma, h: bgSeed.h });

  // A highlight chosen by hand is kept as chosen. A worked-out one deepens until it reads on the pale page.
  const accent = isHex(own.highlight) ? high : inked({ l: clamp(high.l, 0.35, 0.6), c: high.c, h: high.h }, bg, 4.6);
  const structure = isHex(own.base) ? base : inked({ l: clamp(base.l, 0.35, 0.55), c: base.c, h: base.h }, bg, 4.6);
  const text = isHex(own.text) ? own.text : hex(inked({ l: 0.24, c: Math.min(high.c, 0.08) * 0.2, h: high.h }, bg, 12));
  const soft = hex(inked({ l: 0.4, c: tint * 0.45, h: base.h }, bg, 7));
  const deep = { l: clamp(bgSeed.l - 0.07, 0.6, 0.93), c: tint * 0.3, h: base.h };

  return {
    '--bg': bg,
    '--bg-deep': at(-0.025),
    '--surface': at(0.025, bgSeed.c * 0.5),
    '--surface-alt': at(0.012),
    '--text': text,
    '--text-soft': soft,
    '--muted': hex(inked({ l: 0.5, c: tint * 0.1, h: base.h }, bg, 4.6)),
    '--rule': hex(deep),
    '--rule-strong': hex({ ...deep, l: deep.l - 0.12, c: tint * 0.4 }),
    '--accent': hex(accent),
    '--accent-deep': hex({ ...accent, l: accent.l - 0.08 }),
    '--accent-ink': contrast(hex(accent), bg) >= contrast(hex(accent), '#000000') ? bg : '#000000',
    '--accent-wash': `color-mix(in srgb, ${hex(accent)} 14%, transparent)`,
    '--structure': hex(structure),
    '--structure-soft': soft,
    '--structure-deep': hex(deep),
  };
}

function darkPalette(spec: ThemeSpec): Record<string, string> {
  const base = rgbToOklch(hexToRgb(isHex(spec.base) ? spec.base : NIGHT.base));
  const high = rgbToOklch(hexToRgb(isHex(spec.highlight) ? spec.highlight : NIGHT.highlight));
  // A grey base has no hue to carry, so its tints stay grey.
  const tint = Math.min(base.c, 0.16);
  const bgSeed = isHex(spec.background) ? rgbToOklch(hexToRgb(spec.background)) : { l: 0.15, c: tint * 0.28, h: base.h };
  const bg = hex(bgSeed);
  const at = (dl: number, chroma = bgSeed.c) => hex({ l: clamp(bgSeed.l + dl, 0, 1), c: chroma, h: bgSeed.h });

  const structure = readable({ l: clamp(base.l, 0.6, 0.78), c: base.c, h: base.h }, bg, 4.5);
  const accent = readable({ l: clamp(high.l, 0.72, 0.9), c: high.c, h: high.h }, bg, 6);
  const text = isHex(spec.text) ? spec.text : hex(readable({ l: 0.93, c: Math.min(high.c, 0.08) * 0.15, h: high.h }, bg, 12));
  const soft = hex(readable({ l: 0.82, c: tint * 0.4, h: base.h }, bg, 9));
  const deep = { l: clamp(bgSeed.l + 0.12, 0.2, 0.4), c: tint * 0.45, h: base.h };

  return {
    '--bg': bg,
    '--bg-deep': at(-0.025),
    '--surface': at(0.04),
    '--surface-alt': at(0.02),
    '--text': text,
    '--text-soft': soft,
    '--muted': hex(readable({ l: 0.64, c: tint * 0.08, h: base.h }, bg, 4.5)),
    '--rule': hex(deep),
    '--rule-strong': hex({ ...deep, l: deep.l + 0.1, c: tint * 0.5 }),
    '--accent': hex(accent),
    '--accent-deep': hex({ ...accent, l: accent.l - 0.08 }),
    '--accent-ink': contrast(hex(accent), bg) >= contrast(hex(accent), '#ffffff') ? bg : '#ffffff',
    '--accent-wash': `color-mix(in srgb, ${hex(accent)} 16%, transparent)`,
    '--structure': hex(structure),
    '--structure-soft': soft,
    '--structure-deep': hex(deep),
  };
}

export function fontStack(list: FontChoice[], name: string | undefined, fallback: string): string {
  return (list.find((f) => f.name === name) ?? list.find((f) => f.name === fallback)!).stack;
}

/** Reads a theme from a world's header, or null when it has none. */
export function themeFrom(header: Record<string, unknown>): ThemeSpec | null {
  const t = header.theme;
  if (!t || typeof t !== 'object') return null;
  const o = t as Record<string, unknown>;
  if (!isHex(o.base) || !isHex(o.highlight)) return null;
  const name = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    base: o.base.trim(),
    highlight: o.highlight.trim(),
    background: isHex(o.background) ? o.background.trim() : undefined,
    text: isHex(o.text) ? o.text.trim() : undefined,
    headings: name(o.headings),
    prose: name(o.prose),
    light: sideFrom(o.light),
  };
}

function sideFrom(v: unknown): SideOverrides | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const side: SideOverrides = {};
  for (const key of ['base', 'highlight', 'background', 'text'] as const) {
    const value = o[key];
    if (isHex(value)) side[key] = value.trim();
  }
  return Object.keys(side).length ? side : undefined;
}

/** The theme as it is written into `world.md`, leaving out what is not set. */
export function themeHeader(spec: ThemeSpec): Record<string, unknown> {
  const out: Record<string, unknown> = { base: spec.base, highlight: spec.highlight };
  if (spec.background) out.background = spec.background;
  if (spec.text) out.text = spec.text;
  if (spec.headings && spec.headings !== NIGHT.headings) out.headings = spec.headings;
  if (spec.prose && spec.prose !== NIGHT.prose) out.prose = spec.prose;
  const light = sideFrom(spec.light);
  if (light) out.light = light;
  return out;
}

/**
 * Puts a theme on the page, on its dark or light side. Without a theme the page wears
 * Night, or Ink and Paper on the light side, both hand-tuned in `theme.css`.
 */
export function applyTheme(spec: ThemeSpec | null, mode: Mode = 'dark', root: HTMLElement = document.documentElement) {
  root.dataset.mode = mode;
  const names = [...Object.keys(palette(NIGHT)), '--font-display', '--font-body'];
  for (const n of names) root.style.removeProperty(n);
  if (!spec) return;
  for (const [n, v] of Object.entries(palette(spec, mode))) root.style.setProperty(n, v);
  root.style.setProperty('--font-display', fontStack(HEADING_FONTS, spec.headings, NIGHT.headings));
  root.style.setProperty('--font-body', fontStack(PROSE_FONTS, spec.prose, NIGHT.prose));
}
