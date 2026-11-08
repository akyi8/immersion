import { Document } from 'yaml';
import { splitHeader } from '../world.ts';

/**
 * The Game module's data (Mike, November 7). A game's rules are kept as separate
 * elements, one markdown file each. An element is one aspect, such as a piece of gear or
 * a need, or one rule, such as a keyword. Its structured fields live in the file's YAML
 * header and its flavor text is the body, so the same file reads well in any editor and
 * can be edited as a form in the app.
 *
 * Each kind of element has a shape, kept in `kinds/<kind>.md`: the fields every element
 * of that kind carries, and the order they print in. The engine defines the core kinds,
 * and a world can bring kinds of its own, such as chrome.
 */

/** A field's type, which decides how it is edited. */
export type FieldType = 'line' | 'text' | 'list';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  /** A line of help shown under the field in the editor. */
  hint?: string;
}

export interface Kind {
  id: string;
  name: string;
  /** What the kind is called in a heading, such as "Gear" or "Needs". */
  plural: string;
  fields: Field[];
  /** The order the element prints in, with `flavor` and `rules` among the field keys. */
  layout: string[];
  /** What the kind is, from the shape file's body. */
  about: string;
  /** What an element's body is called in the form, such as Text for a module. Flavor when unsaid. */
  body?: string;
}

export interface Element {
  /** The file's path inside its folder, such as `elements/gear/nine-rivers-c-3.md`. */
  path: string;
  /** A stable id: the file's name without `.md`. */
  id: string;
  name: string;
  kind: string;
  tags: string[];
  /** The id of the vendor that sells it, for gear and chrome. */
  vendor: string;
  /** For a reskin: the id of the core element whose mechanics it uses. */
  reskins: string;
  /** Every other field, by key: text for line and text fields, a list for list fields. */
  fields: Record<string, string | string[]>;
  /** The flavor text: the file's body. */
  flavor: string;
}

const RESERVED = new Set(['name', 'kind', 'tags', 'vendor', 'reskins']);

const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Reads one element file. */
export function readElement(path: string, source: string): Element {
  const { header, body } = splitHeader(source);
  const fields: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(header)) {
    if (RESERVED.has(k)) continue;
    fields[k] = Array.isArray(v) ? v.map(text) : text(v);
  }
  const tags = Array.isArray(header.tags)
    ? header.tags.map(text).filter(Boolean)
    : text(header.tags)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
  const id = path.split('/').pop()!.replace(/\.md$/i, '');
  return {
    path,
    id,
    name: text(header.name) || id,
    kind: text(header.kind) || path.split('/').slice(-2, -1)[0] || 'element',
    tags,
    vendor: text(header.vendor),
    reskins: text(header.reskins),
    fields,
    flavor: body.replace(/^\n+/, '').replace(/\n+$/, ''),
  };
}

/**
 * Writes an element file. The header lists the name, kind, and tags first, then the
 * vendor and the core element it reskins, then its fields in the kind's order, so every
 * file of a kind reads the same way.
 */
export function writeElement(e: Element, kind: Kind | null): string {
  const doc = new Document({});
  doc.set('name', e.name);
  doc.set('kind', e.kind);
  const tags = doc.createNode(e.tags);
  tags.flow = true;
  doc.set('tags', tags);
  if (e.vendor) doc.set('vendor', e.vendor);
  if (e.reskins) doc.set('reskins', e.reskins);
  const order = [...(kind?.fields.map((f) => f.key) ?? []), ...Object.keys(e.fields).sort()];
  const done = new Set<string>();
  for (const key of order) {
    if (done.has(key) || RESERVED.has(key)) continue;
    done.add(key);
    const v = e.fields[key];
    if (v === undefined || (Array.isArray(v) ? v.length === 0 : v === '')) continue;
    doc.set(key, v);
  }
  const head = doc.toString({ lineWidth: 0 }).trim();
  return `---\n${head}\n---\n${e.flavor ? `\n${e.flavor}\n` : ''}`;
}

/** Reads a kind's shape file, `kinds/<id>.md`. */
export function readKind(id: string, source: string): Kind {
  const { header, body } = splitHeader(source);
  const fields: Field[] = [];
  for (const f of Array.isArray(header.fields) ? header.fields : []) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>;
    const key = text(r.key);
    if (!key || RESERVED.has(key)) continue;
    const type = r.type === 'text' || r.type === 'list' ? r.type : 'line';
    const hint = text(r.hint);
    fields.push(hint ? { key, label: text(r.label) || key, type, hint } : { key, label: text(r.label) || key, type });
  }
  const name = text(header.name) || id;
  const layout = Array.isArray(header.layout) ? header.layout.map(text).filter(Boolean) : ['flavor', ...fields.map((f) => f.key)];
  const kind: Kind = { id, name, plural: text(header.plural) || name, fields, layout, about: body.trim() };
  if (text(header.body)) kind.body = text(header.body);
  return kind;
}

/** Writes a kind's shape file. */
export function writeKind(k: Kind): string {
  const doc = new Document({});
  doc.set('name', k.name);
  if (k.plural !== k.name) doc.set('plural', k.plural);
  doc.set(
    'fields',
    k.fields.map((f) => {
      const node = doc.createNode(f.hint ? { key: f.key, label: f.label, type: f.type, hint: f.hint } : { key: f.key, label: f.label, type: f.type });
      node.flow = true;
      return node;
    }),
  );
  const layout = doc.createNode(k.layout);
  layout.flow = true;
  doc.set('layout', layout);
  if (k.body) doc.set('body', k.body);
  return `---\n${doc.toString({ lineWidth: 0 }).trim()}\n---\n${k.about ? `\n${k.about}\n` : ''}`;
}

/** A new, empty element of a kind, named and placed in its kind's folder. */
export function newElement(name: string, kind: Kind, taken: Set<string>): Element {
  const base = slugify(name) || 'element';
  let id = base;
  for (let n = 2; taken.has(`${kind.id}/${id}`); n++) id = `${base}-${n}`;
  return { path: `elements/${kind.id}/${id}.md`, id, name, kind: kind.id, tags: [kind.id], vendor: '', reskins: '', fields: {}, flavor: '' };
}

/** Reads `game.md`, where a world records the core elements it sets aside. */
export function readGameFile(source: string | null): { setAside: string[] } {
  if (!source) return { setAside: [] };
  const { header } = splitHeader(source);
  const list = Array.isArray(header.set_aside) ? header.set_aside.map(text).filter(Boolean) : [];
  return { setAside: list };
}
