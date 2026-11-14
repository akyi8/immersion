/**
 * Dice that tumble across the screen (Mike, November 14), drawn and thrown by Dice-Box,
 * a 3D dice library with its own physics. The dice land where the physics puts them, so
 * the numbers come from the throw itself. The library loads the first time dice are
 * thrown, and a computer that cannot draw them falls back to the plain roll.
 */
import { noteTrouble } from '../trouble';

export interface Throw {
  qty: number;
  sides: number;
}

interface Box {
  init(): Promise<unknown>;
  roll(dice: (Throw & { themeColor?: string })[]): Promise<{ sides: number | string; groupId?: number; rolls?: { value: number }[]; value: number }[]>;
  clear(): void;
  updateConfig(config: Record<string, unknown>): Promise<unknown>;
}

const STAGE = 'dice-stage';
let box: Promise<Box> | null = null;
let broken = false;
let clearing: ReturnType<typeof setTimeout> | null = null;

/** A color written any way CSS allows, as the six-digit hex the dice want. */
function hex(color: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return '#888888';
  ctx.fillStyle = '#888888';
  ctx.fillStyle = color.trim();
  const out = ctx.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(out)) return out;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(out);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#888888';
}

/** The world's own color for the dice: its highlight. */
const themeColor = () => hex(getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#888888');

function stage(): HTMLElement {
  let el = document.getElementById(STAGE);
  if (!el) {
    el = document.createElement('div');
    el.id = STAGE;
    document.body.append(el);
  }
  return el;
}

function start(): Promise<Box> {
  box ??= (async () => {
    stage();
    const { default: DiceBox } = (await import('@3d-dice/dice-box')) as unknown as { default: new (config: Record<string, unknown>) => Box };
    const made = new DiceBox({
      container: `#${STAGE}`,
      assetPath: new URL('dicebox/', document.baseURI).pathname,
      theme: 'default',
      themeColor: themeColor(),
      scale: 5,
      gravity: 2,
      settleTimeout: 4000,
    });
    await made.init();
    return made;
  })();
  return box;
}

export const canTumble = () => !broken;

/**
 * Throws the dice and returns what each landed on, group by group. Null when the dice
 * could not be drawn, and the caller then rolls the plain way.
 */
export async function tumble(dice: Throw[]): Promise<number[][] | null> {
  if (broken) return null;
  try {
    const b = await start();
    if (clearing) clearTimeout(clearing);
    stage().classList.add('on');
    await b.updateConfig({ themeColor: themeColor() });
    const landed = await b.roll(dice);
    // The dice lie where they fell for a moment, and then the table is cleared.
    clearing = setTimeout(() => {
      b.clear();
      stage().classList.remove('on');
    }, 3500);
    const out = dice.map(() => [] as number[]);
    // The library answers one line for each die, marked with the group it was thrown in.
    for (const die of landed) {
      const at = Number.isInteger(die.groupId) && die.groupId! < out.length ? die.groupId! : dice.findIndex((d, i) => d.sides === Number(die.sides) && out[i].length < d.qty);
      if (at < 0) continue;
      if (die.rolls?.length) out[at].push(...die.rolls.map((r) => r.value));
      else out[at].push(die.value);
    }
    if (out.some((values, i) => values.length !== dice[i].qty || values.some((v) => !Number.isInteger(v) || v < 1 || v > dice[i].sides))) throw new Error(`The dice came back unreadable: ${JSON.stringify(landed).slice(0, 300)}`);
    return out;
  } catch (e) {
    broken = true;
    box = null;
    document.getElementById(STAGE)?.classList.remove('on');
    noteTrouble('dice', e instanceof Error ? e : String(e));
    return null;
  }
}
