import type { Entry } from '../index/wiki.ts';
import { within, type When } from './when.ts';

/**
 * The wiki's timeline (Mike, October 25): every entry with a `when:` line, in order, with
 * eras as bands over the stretch of time they cover. Moments are laid out in order, not
 * to scale, so a thousand years and a single day take the same room.
 */
export interface Moment {
  /** Where it sorts. */
  at: number;
  /** As written on the first entry placed here. */
  label: string;
  events: Entry[];
}

export interface EraBand {
  era: Entry;
  /** The first and last moments it covers, as indexes into the moments. */
  from: number;
  to: number;
  /** Which band row it sits in, so eras that overlap stack instead of colliding. */
  lane: number;
}

export interface Timeline {
  moments: Moment[];
  eras: EraBand[];
  lanes: number;
}

/** Rounds a start to the day, so events on the same date share a moment. */
const key = (w: When) => Math.round(w.start * 365) / 365;

/** Lays out the dated entries among `entries`, which is usually every entry in the wiki. */
export function buildTimeline(entries: Entry[]): Timeline {
  const all = entries.filter((e) => e.when);
  const events = all.filter((e) => !e.era);
  const eras = all.filter((e) => e.era).sort((a, b) => a.when!.start - b.when!.start || a.when!.end - b.when!.end);

  // Each era's start is a moment too, so an era with no events yet still has a place.
  const byKey = new Map<number, Moment>();
  for (const e of [...events, ...eras]) {
    const k = key(e.when!);
    // A moment made by an era alone is labelled with where the era begins.
    const m = byKey.get(k) ?? { at: k, label: e.era ? e.when!.text.split(/\s+to\s+|\s*[–—]\s*|\s-\s/i)[0].trim() : e.when!.text, events: [] };
    if (!e.era) {
      if (!m.events.length) m.label = e.when!.text;
      m.events.push(e);
    }
    byKey.set(k, m);
  }
  const moments = [...byKey.values()].sort((a, b) => a.at - b.at);
  for (const m of moments) m.events.sort((a, b) => a.when!.start - b.when!.start || a.name.localeCompare(b.name));

  const laneEnds: number[] = [];
  const bands: EraBand[] = [];
  for (const era of eras) {
    const inside = moments.map((m, i) => (m.at >= key(era.when!) && within({ ...era.when!, start: m.at }, era.when!) ? i : -1)).filter((i) => i >= 0);
    const from = inside.length ? inside[0] : moments.findIndex((m) => m.at >= key(era.when!));
    const to = inside.length ? inside[inside.length - 1] : from;
    let lane = laneEnds.findIndex((end) => end < from);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(to);
    } else laneEnds[lane] = to;
    bands.push({ era, from, to, lane });
  }
  return { moments, eras: bands, lanes: laneEnds.length };
}
