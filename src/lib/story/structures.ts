import { splitHeader, withHeader } from '../world.ts';

/**
 * Story structures on a board (Mike, October 28): Kishōtenketsu, the Story Circle, and
 * Four Acts. A structure gives a board one header band per part, in story order, and
 * cards are dragged under them. A board starts with no structure.
 *
 * The parts' names, overviews, guidance, and prompts come from `structure-guidance.md`,
 * which Mike edits. Each structure and part also has a fixed id here, matched to the
 * file by order, so renaming a part in the guidance never loses the chapters placed in it.
 */

export interface Stage {
  name: string;
  essence: string;
}

export interface Part {
  id: string;
  name: string;
  /** What the part does. */
  about: string;
  prompts: string[];
  /** In Four Acts, the Hero's Journey stages that can happen inside the act. */
  recommended: Stage[];
  optional: Stage[];
}

export interface Structure {
  id: string;
  name: string;
  overview: string;
  parts: Part[];
}

/** Each structure's id and its parts' ids, in the order the guidance file gives them. */
const IDS: [string, string[]][] = [
  ['kishotenketsu', ['ki', 'sho', 'ten', 'ketsu']],
  ['story-circle', ['you', 'need', 'go', 'search', 'find', 'take', 'return', 'change']],
  ['four-acts', ['act-1', 'act-2', 'act-3', 'act-4']],
];

export const STRUCTURE_IDS = IDS.map(([id]) => id);

/** Reads the guidance file into the structures, keeping each part's fixed id. */
export function readStructures(markdown: string): Structure[] {
  const sections = markdown.split(/^## /m).slice(1);
  return IDS.map(([id, partIds], s) => {
    const section = sections[s] ?? '';
    const [head, ...partTexts] = section.split(/^### /m);
    const name = head.split('\n')[0].trim() || id;
    const parts = partIds.map((pid, p) => readPart(pid, partTexts[p] ?? pid));
    return { id, name, overview: paragraphs(head.split('\n').slice(1).join('\n')).join('\n\n'), parts };
  });
}

function readPart(id: string, text: string): Part {
  const lines = text.split('\n');
  const name = lines[0].trim();
  const body = lines.slice(1).join('\n').replace(/^---\s*$/m, '');
  const prompts: string[] = [];
  const recommended: Stage[] = [];
  const optional: Stage[] = [];
  let list: Stage[] | null = null;
  const prose: string[] = [];
  for (const line of body.split('\n')) {
    if (/^\*\*Recommended stages\*\*/.test(line)) list = recommended;
    else if (/^\*\*Optional stages\*\*/.test(line)) list = optional;
    else if (/^- /.test(line)) {
      const item = line.slice(2).trim();
      const stage = /^\*\*(.+?)\*\*\s*(.*)$/.exec(item);
      if (list && stage) list.push({ name: stage[1].replace(/\.$/, ''), essence: stage[2] });
      else prompts.push(item);
    } else if (!list) prose.push(line);
  }
  return { id, name, about: paragraphs(prose.join('\n')).join('\n\n'), prompts, recommended, optional };
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p && p !== '---');
}

/** The part a card holds in a structure, from the parts it has recorded. */
export function partIn(structure: Structure | null, stages: Record<string, string>): string | null {
  if (!structure) return null;
  const id = stages[structure.id];
  return id && structure.parts.some((p) => p.id === id) ? id : null;
}

/** A band on the board: one part and the cards in it, or the cards in no part. */
export interface Band {
  part: Part | null;
  /** Indexes into the board's cards, in the order they are shown. */
  cards: number[];
}

/**
 * The board's bands, in story order, with the Unassigned band last. Within a band,
 * cards keep their order on disk.
 */
export function bands(structure: Structure, stagesOf: Record<string, string>[]): Band[] {
  const out: Band[] = structure.parts.map((part) => ({ part, cards: [] }));
  const loose: Band = { part: null, cards: [] };
  stagesOf.forEach((stages, i) => {
    const id = partIn(structure, stages);
    const band = id ? out.find((b) => b.part!.id === id) : undefined;
    (band ?? loose).cards.push(i);
  });
  return [...out, loose];
}

/**
 * The reading order after placing card `card` in part `part` (null for Unassigned),
 * just before card `before`, or at the end of that band when `before` is null.
 */
export function placed(list: Band[], card: number, part: string | null, before: number | null): number[] {
  const next = list.map((b) => ({ id: b.part?.id ?? null, cards: b.cards.filter((c) => c !== card) }));
  const band = next.find((b) => b.id === part) ?? next[next.length - 1];
  const at = before === null ? -1 : band.cards.indexOf(before);
  if (at < 0) band.cards.push(card);
  else band.cards.splice(at, 0, card);
  return next.flatMap((b) => b.cards);
}

/** The parts a card has recorded, from the header of its file, keyed by structure. */
export function readStages(text: string, key = 'stages'): Record<string, string> {
  const value = splitHeader(text).header[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** The text with the card's part in a structure recorded, or cleared when `part` is null. */
export function withStage(text: string, structure: string, part: string | null, key = 'stages'): string {
  const stages = readStages(text, key);
  if (part) stages[structure] = part;
  else delete stages[structure];
  return withHeader(text, { [key]: Object.keys(stages).length ? stages : undefined });
}
