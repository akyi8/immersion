/**
 * The activity heatmap (design: writing statistics, with no streaks). Each day of the
 * past weeks becomes a square whose shade shows how many words were written that day.
 */
export interface Activity {
  /** Words added on each day that had commits, as `YYYY-MM-DD` and a count. */
  days: [string, number][];
  /** Words written since the last commit, which count toward today. */
  uncommitted: number;
}

export interface Day {
  date: string;
  words: number;
  /** 0 for no writing, then 1 to 4 by fixed word thresholds. */
  level: number;
  future: boolean;
}

/** Shade thresholds in words. They are fixed, so a level means the same thing every week. */
const LEVELS = [1, 250, 750, 1500];

export function levelOf(words: number): number {
  return LEVELS.filter((t) => words >= t).length;
}

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Words per day, with uncommitted words added to today. */
export function wordsByDay(activity: Activity, today: Date): Map<string, number> {
  const map = new Map(activity.days);
  if (activity.uncommitted > 0) {
    const key = dayKey(today);
    map.set(key, (map.get(key) ?? 0) + activity.uncommitted);
  }
  return map;
}

/**
 * The last `weeks` weeks as columns of seven days, Monday first, ending with the week
 * that holds today. Days after today are marked as future and stay blank.
 */
export function heatmapWeeks(activity: Activity, today: Date, weeks: number): Day[][] {
  const words = wordsByDay(activity, today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Back to this week's Monday, then back the remaining whole weeks.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * (weeks - 1));
  const todayKey = dayKey(today);
  const out: Day[][] = [];
  const cursor = new Date(start);
  let future = false;
  for (let w = 0; w < weeks; w++) {
    const week: Day[] = [];
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor);
      const count = future ? 0 : (words.get(key) ?? 0);
      week.push({ date: key, words: count, level: future ? 0 : levelOf(count), future });
      if (key === todayKey) future = true;
      cursor.setDate(cursor.getDate() + 1);
    }
    out.push(week);
  }
  return out;
}

/** Totals for today, the last seven days, and the last 365 days. */
export function totals(activity: Activity, today: Date): { today: number; week: number; year: number } {
  const words = wordsByDay(activity, today);
  const sumSince = (days: number) => {
    let total = 0;
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (let i = 0; i < days; i++) {
      total += words.get(dayKey(d)) ?? 0;
      d.setDate(d.getDate() - 1);
    }
    return total;
  };
  return { today: sumSince(1), week: sumSince(7), year: sumSince(365) };
}
