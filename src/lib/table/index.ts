import { splitHeader, withHeader } from '../world.ts';
import type { WorldFs } from '../fs/types';

/**
 * The Table module's files (Mike, November 14). A world's `table` folder holds campaigns.
 * A campaign is a folder with a `campaign.md` card. It holds adventures, each a folder
 * with an `adventure.md` card, and an adventure holds sessions. A session is two files
 * that share a name: `<name>.log.md` is what happened, and `<name>.plan.md` is what the
 * game master prepared. A player's session has the log alone.
 */
export const TABLE_DIR = 'table';

export type Role = 'player' | 'gm';

export interface Link {
  name: string;
  url: string;
}

export interface Handout {
  path: string;
  name: string;
  kind: 'pdf' | 'picture' | 'text';
}

/** A file the app shows as a page of its own: a PDF or a picture. */
export const isPdf = (path: string) => /\.pdf$/i.test(path);
export const isPicture = (path: string) => /\.(png|jpe?g|webp|gif)$/i.test(path);
/** A handout made of words: a markdown file in a campaign's `handouts` folder. */
export const isTextHandout = (path: string) => /(^|\/)handouts\/[^/]+\.md$/i.test(path);

export interface Session {
  /** The session's path without `.log.md` or `.plan.md`, which is its identity. */
  stem: string;
  name: string;
  log: string | null;
  plan: string | null;
  /** The real day it was played, as written, such as 2026-11-19. */
  played: string;
  /** The date in the game, as written, such as "Spring, 485". */
  when: string;
  /** Who was at the table. */
  people: string[];
}

export interface Adventure {
  path: string;
  name: string;
  order: number;
  sessions: Session[];
}

export interface Campaign {
  path: string;
  /** The campaign's card, `campaign.md`. */
  card: string;
  name: string;
  role: Role;
  /** 'own' for the world's own game, or 'other' for any other game. */
  game: 'own' | 'other';
  /** The other game's name, such as Pendragon. */
  system: string;
  links: Link[];
  /** The campaign's rulebooks: the PDF files in its `rules` folder. */
  rules: { path: string; name: string }[];
  /** What the game master hands the table: the PDFs and pictures in its `handouts` folder. */
  handouts: Handout[];
  adventures: Adventure[];
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString().slice(0, 10) : '');

export function titleFromSlug(slug: string): string {
  return slug
    .replace(/^\d+[-_ ]+/, '')
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function slugOf(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

function people(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((p) => text(p)).filter(Boolean);
  return text(v)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function links(v: unknown): Link[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((l) => {
    const name = text((l as Link)?.name);
    const url = text((l as Link)?.url);
    return url ? [{ name: name || url, url }] : [];
  });
}

async function header(fs: WorldFs, path: string): Promise<Record<string, unknown>> {
  try {
    return splitHeader(await fs.readText(path)).header;
  } catch {
    return {};
  }
}

const SIDE = /\.(log|plan)\.md$/i;

async function sessionsIn(fs: WorldFs, dir: string): Promise<Session[]> {
  const stems = new Map<string, { log: string | null; plan: string | null }>();
  for (const e of await fs.readDir(dir)) {
    const side = SIDE.exec(e.name);
    if (e.isDir || !side) continue;
    const stem = `${dir}/${e.name.slice(0, side.index)}`;
    const pair = stems.get(stem) ?? { log: null, plan: null };
    pair[side[1].toLowerCase() as 'log' | 'plan'] = `${dir}/${e.name}`;
    stems.set(stem, pair);
  }
  const out: Session[] = [];
  for (const [stem, pair] of stems) {
    // The log carries the session's facts. A session planned and not yet played has only the plan.
    const h = await header(fs, pair.log ?? pair.plan!);
    out.push({ stem, name: text(h.name) || titleFromSlug(stem.split('/').pop()!), log: pair.log, plan: pair.plan, played: text(h.played), when: text(h.when), people: people(h.table) });
  }
  return out.sort((a, b) => a.played.localeCompare(b.played) || a.stem.localeCompare(b.stem, undefined, { numeric: true }));
}

export async function readTable(fs: WorldFs, dir = TABLE_DIR): Promise<Campaign[]> {
  if (!(await fs.exists(dir))) return [];
  const out: Campaign[] = [];
  for (const c of await fs.readDir(dir)) {
    if (!c.isDir || c.name.startsWith('.') || c.name === 'archive' || c.name === 'decks') continue;
    const path = `${dir}/${c.name}`;
    const card = `${path}/campaign.md`;
    const h = await header(fs, card);
    const adventures: Adventure[] = [];
    for (const a of await fs.readDir(path)) {
      if (!a.isDir || a.name.startsWith('.') || a.name === 'archive' || a.name === 'rules' || a.name === 'decks' || a.name === 'handouts') continue;
      const ah = await header(fs, `${path}/${a.name}/adventure.md`);
      adventures.push({ path: `${path}/${a.name}`, name: text(ah.name) || titleFromSlug(a.name), order: Number(ah.order) || 0, sessions: await sessionsIn(fs, `${path}/${a.name}`) });
    }
    const rules: Campaign['rules'] = [];
    if (await fs.exists(`${path}/rules`)) {
      for (const r of await fs.readDir(`${path}/rules`)) if (!r.isDir && isPdf(r.name)) rules.push({ path: `${path}/rules/${r.name}`, name: bookName(r.name) });
      rules.sort((a, b) => a.name.localeCompare(b.name));
    }
    const handouts: Handout[] = [];
    if (await fs.exists(`${path}/handouts`)) {
      for (const f of await fs.readDir(`${path}/handouts`)) {
        const file = `${path}/handouts/${f.name}`;
        if (f.isDir) continue;
        if (isPdf(f.name) || isPicture(f.name)) handouts.push({ path: file, name: bookName(f.name), kind: isPdf(f.name) ? 'pdf' : 'picture' });
        // A handout made of words is a markdown file, named in its header.
        else if (/\.md$/i.test(f.name)) handouts.push({ path: file, name: text((await header(fs, file)).name) || titleFromSlug(f.name.replace(/\.md$/i, '')), kind: 'text' });
      }
      handouts.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
    adventures.sort((a, b) => a.order - b.order || a.path.localeCompare(b.path, undefined, { numeric: true }));
    out.push({
      path,
      card,
      name: text(h.name) || titleFromSlug(c.name),
      role: text(h.role).toLowerCase() === 'gm' ? 'gm' : 'player',
      game: text(h.game).toLowerCase() === 'own' ? 'own' : 'other',
      system: text(h.system),
      links: links(h.links),
      rules,
      handouts,
      adventures,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The name of a rulebook or a handout: its file's name without the ending, with underscores read as spaces. */
export const bookName = (file: string) => file.replace(/\.[a-z0-9]+$/i, '').replace(/_+/g, ' ').trim();

/** Renames a rulebook or a handout by renaming its file, and returns the file's new path. */
export async function renameBook(fs: WorldFs, path: string, name: string): Promise<string> {
  const clean = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^\.+|\.+$/g, '').trim();
  if (!clean) throw new Error('It needs a name.');
  const ending = /\.[a-z0-9]+$/i.exec(path)?.[0] ?? '';
  const to = `${path.slice(0, path.lastIndexOf('/'))}/${clean}${ending}`;
  if (to === path) return path;
  if (to.toLowerCase() !== path.toLowerCase() && (await fs.exists(to))) throw new Error(`There is already a file named ${clean}.`);
  await fs.move(path, to);
  return to;
}

/** A path nothing uses yet, made from a name. */
async function freePath(fs: WorldFs, dir: string, name: string, taken: (path: string) => Promise<boolean>): Promise<string> {
  const base = slugOf(name);
  for (let n = 1; ; n++) {
    const path = `${dir}/${n === 1 ? base : `${base}-${n}`}`;
    if (!(await taken(path))) return path;
  }
}

const card = (facts: Record<string, unknown>, body = '') => withHeader(body, facts);

export async function createCampaign(fs: WorldFs, facts: { name: string; role: Role; game: 'own' | 'other'; system: string }, dir = TABLE_DIR): Promise<string> {
  const path = await freePath(fs, dir, facts.name, (p) => fs.exists(p));
  await fs.writeText(`${path}/campaign.md`, card({ name: facts.name.trim(), role: facts.role, game: facts.game, ...(facts.system.trim() ? { system: facts.system.trim() } : {}) }));
  return path;
}

export async function createAdventure(fs: WorldFs, campaign: Campaign, name: string): Promise<string> {
  const path = await freePath(fs, campaign.path, name, (p) => fs.exists(p));
  const order = Math.max(0, ...campaign.adventures.map((a) => a.order)) + 1;
  await fs.writeText(`${path}/adventure.md`, card({ name: name.trim(), order }));
  return path;
}

/** Starts a session: its log, and its plan too when the writer runs the game. Returns the session's stem. */
export async function createSession(fs: WorldFs, campaign: Campaign, adventure: Adventure, name: string, today: string): Promise<string> {
  const stem = await freePath(fs, adventure.path, name, async (p) => (await fs.exists(`${p}.log.md`)) || (await fs.exists(`${p}.plan.md`)));
  const last = adventure.sessions.at(-1);
  await fs.writeText(`${stem}.log.md`, card({ name: name.trim(), played: today, when: last?.when ?? '', table: last?.people ?? [] }));
  if (campaign.role === 'gm') await fs.writeText(`${stem}.plan.md`, card({ name: name.trim() }));
  return stem;
}

/** Changes facts in a card or a session file's header, leaving the rest of the file as it is. */
export async function setFacts(fs: WorldFs, path: string, facts: Record<string, unknown>): Promise<void> {
  let source = '';
  try {
    source = await fs.readText(path);
  } catch {
    // A card that is missing is written fresh.
  }
  await fs.writeText(path, withHeader(source, facts));
}

/**
 * Archives a file or a folder: it moves into an `archive` folder beside it, which the app
 * leaves out. Nothing is deleted, and moving it back out restores it. Returns the new path.
 */
export async function archivePath(fs: WorldFs, path: string): Promise<string> {
  const at = path.lastIndexOf('/');
  const dir = `${path.slice(0, at)}/archive`;
  const name = path.slice(at + 1);
  const dot = name.search(/(\.(log|plan))?\.[a-z0-9]+$/i);
  const [stem, ending] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  await fs.createDir(dir);
  for (let n = 1; ; n++) {
    const to = `${dir}/${n === 1 ? stem : `${stem}-${n}`}${ending}`;
    if (await fs.exists(to)) continue;
    await fs.move(path, to);
    return to;
  }
}

/** Archives a session: its log and its plan together, under one name. */
export async function archiveSession(fs: WorldFs, session: Session): Promise<void> {
  const dir = `${session.stem.slice(0, session.stem.lastIndexOf('/'))}/archive`;
  const base = session.stem.slice(session.stem.lastIndexOf('/') + 1);
  await fs.createDir(dir);
  let stem = base;
  for (let n = 2; (await fs.exists(`${dir}/${stem}.log.md`)) || (await fs.exists(`${dir}/${stem}.plan.md`)); n++) stem = `${base}-${n}`;
  if (session.log) await fs.move(session.log, `${dir}/${stem}.log.md`);
  if (session.plan) await fs.move(session.plan, `${dir}/${stem}.plan.md`);
}

/** Where the session before this one ended: the last plain paragraph of its log. */
export function lastWords(log: string, limit = 320): string {
  const paragraphs = splitHeader(log)
    .body.split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(>|#|---|\*\*\*)/.test(p));
  const last = (paragraphs.at(-1) ?? '').replace(/\s+/g, ' ');
  return last.length > limit ? `${last.slice(0, limit).replace(/\s+\S*$/, '')}…` : last;
}

export const sessionOf = (campaigns: Campaign[], path: string) => {
  for (const c of campaigns) for (const a of c.adventures) for (const s of a.sessions) if (s.log === path || s.plan === path || s.stem === path) return { campaign: c, adventure: a, session: s };
  return null;
};
