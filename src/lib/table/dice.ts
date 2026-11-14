/**
 * Dice for the table (Mike, November 14). A roll is written the way players say it:
 * `d20`, `3d6`, `2d6+3`, `d100`, `4d6 - 1`. Dice and plain numbers are joined by plus
 * and minus. The numbers come from a source of chance the caller passes in, so a test
 * can roll the same dice twice.
 */
export interface Term {
  sign: 1 | -1;
  /** How many dice, or 0 for a plain number. */
  count: number;
  /** The sides of each die, or the plain number itself. */
  sides: number;
}

export interface Rolled {
  /** The roll as written, tidied. */
  said: string;
  /** Each group of dice, with what every die showed. */
  dice: { said: string; sign: 1 | -1; values: number[] }[];
  total: number;
}

/** A whole number from 1 to `sides`. */
export type Chance = (sides: number) => number;

/** Chance from the computer's own source of randomness, with no bias toward low numbers. */
export const chance: Chance = (sides) => {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const box = new Uint32Array(1);
  do crypto.getRandomValues(box);
  while (box[0] >= limit);
  return (box[0] % sides) + 1;
};

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** The terms of a roll, or null when the text is not a roll. */
export function parseRoll(text: string): Term[] | null {
  const tidy = text.toLowerCase().replace(/\s+/g, '');
  if (!tidy || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(tidy)) return null;
  const terms: Term[] = [];
  for (const m of tidy.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3] !== undefined) {
      const count = m[2] === '' ? 1 : Number(m[2]);
      const sides = Number(m[3]);
      if (count < 1 || count > MAX_DICE || sides < 2 || sides > MAX_SIDES) return null;
      terms.push({ sign, count, sides });
    } else terms.push({ sign, count: 0, sides: Number(m[4]) });
  }
  return terms.some((t) => t.count > 0) ? terms : null;
}

const saidTerm = (t: Term) => (t.count ? `${t.count > 1 ? t.count : ''}d${t.sides}` : String(t.sides));
export const saidRoll = (terms: Term[]) => terms.map((t, i) => `${t.sign < 0 ? (i ? ' - ' : '-') : i ? ' + ' : ''}${saidTerm(t)}`).join('');

/** A source of chance that hands back dice already thrown, group by group, such as dice that tumbled on screen. */
export function thrown(groups: number[][]): Chance {
  const left = groups.flat();
  return () => left.shift() ?? 1;
}

/** The groups of dice in a roll, in the order they are rolled. */
export const diceIn = (terms: Term[]) => terms.filter((t) => t.count > 0).map((t) => ({ qty: t.count, sides: t.sides }));

export function roll(terms: Term[], by: Chance = chance): Rolled {
  const dice: Rolled['dice'] = [];
  let total = 0;
  for (const t of terms) {
    if (!t.count) {
      total += t.sign * t.sides;
      continue;
    }
    const values = Array.from({ length: t.count }, () => by(t.sides));
    dice.push({ said: saidTerm(t), sign: t.sign, values });
    total += t.sign * values.reduce((a, b) => a + b, 0);
  }
  return { said: saidRoll(terms), dice, total };
}

/** The line a roll leaves in a session's log, such as "Rolled 3d6 for Hunting: 4, 2, 6 = 12". */
export function rollLine(r: Rolled, why = ''): string {
  const shown = r.dice.length === 1 && r.dice[0].values.length === 1 && r.said === r.dice[0].said ? '' : `${r.dice.map((d) => d.values.join(', ')).join(' | ')} = `;
  return `Rolled ${r.said}${why.trim() ? ` for ${why.trim()}` : ''}: ${shown}${r.total}`;
}

/**
 * A Beautiful Disasters roll: one eight-sided die for each point of pressure. Each die
 * below the edge is one trouble, and the 8s and the 1s are counted because they buy
 * consequences. The table decides what the trouble means.
 */
export interface TroubleRoll {
  values: number[];
  edge: number;
  trouble: number;
  eights: number;
  ones: number;
}

export function troubleRoll(pressure: number, edge: number, by: Chance = chance): TroubleRoll {
  const values = Array.from({ length: Math.max(0, Math.min(MAX_DICE, Math.floor(pressure))) }, () => by(8));
  return { values, edge, trouble: values.filter((v) => v < edge).length, eights: values.filter((v) => v === 8).length, ones: values.filter((v) => v === 1).length };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export function troubleLine(r: TroubleRoll, why = ''): string {
  const extras = [r.eights ? count(r.eights, '8', '8s') : '', r.ones ? count(r.ones, '1', '1s') : ''].filter(Boolean).join(', ');
  return `Rolled ${r.values.length}d8 at edge ${r.edge}${why.trim() ? ` for ${why.trim()}` : ''}: ${r.values.join(', ') || 'no dice'} = ${r.trouble} trouble${extras ? ` (${extras})` : ''}`;
}
