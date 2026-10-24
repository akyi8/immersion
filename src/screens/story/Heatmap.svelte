<script lang="ts">
  import { heatmapWeeks, totals, type Activity } from '../../lib/story/activity';

  // The activity heatmap: one square per day, shaded by words written. It shows how the
  // writing has gone, with no streaks to keep (Mike).
  let { activity, weeks, months = false }: { activity: Activity; weeks: number; months?: boolean } = $props();

  const today = new Date();
  const grid = $derived(heatmapWeeks(activity, today, weeks));
  const sums = $derived(totals(activity, today));
  // A month's name sits above the first week that starts in it, unless the next name
  // follows too closely to fit, as it does for a month cut short at the left edge.
  const labels = $derived.by(() => {
    const out = grid.map((week, i) => {
      const first = new Date(week[0].date + 'T12:00');
      const prev = i > 0 ? new Date(grid[i - 1][0].date + 'T12:00') : null;
      return !prev || prev.getMonth() !== first.getMonth() ? first.toLocaleDateString(undefined, { month: 'short' }) : '';
    });
    return out.map((label, i) => (label && (out[i + 1] || out[i + 2]) ? '' : label));
  });

  function describe(date: string, words: number): string {
    const d = new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `${d}: ${words ? `${words.toLocaleString()} words` : 'no writing'}`;
  }
</script>

<figure class="heatmap" aria-label="Words written per day">
  {#if months}
    <div class="months" style:grid-template-columns="repeat({weeks}, var(--cell))">
      {#each labels as label}<span>{label}</span>{/each}
    </div>
  {/if}
  <div class="grid" style:grid-template-columns="repeat({weeks}, var(--cell))">
    {#each grid as week}
      {#each week as day}
        <span class="day level-{day.level}" class:future={day.future} title={day.future ? '' : describe(day.date, day.words)}></span>
      {/each}
    {/each}
  </div>
  <figcaption>
    <span><b>{sums.today.toLocaleString()}</b> today</span>
    <span><b>{sums.week.toLocaleString()}</b> this week</span>
    {#if months}<span><b>{sums.year.toLocaleString()}</b> this year</span>{/if}
  </figcaption>
</figure>

<style>
  .heatmap {
    --cell: 11px;
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-rows: repeat(7, var(--cell));
    grid-auto-flow: column;
    gap: 3px;
    width: max-content;
  }
  .months {
    display: grid;
    column-gap: 3px;
    margin-bottom: 4px;
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
  }
  .day {
    border-radius: 2px;
    background: var(--surface);
    outline: 1px solid var(--rule);
    outline-offset: -1px;
  }
  .day.future {
    background: transparent;
    outline-color: transparent;
  }
  .level-1 {
    background: rgb(241 158 43 / 0.25);
    outline: 0;
  }
  .level-2 {
    background: rgb(241 158 43 / 0.5);
    outline: 0;
  }
  .level-3 {
    background: rgb(241 158 43 / 0.75);
    outline: 0;
  }
  .level-4 {
    background: var(--accent);
    outline: 0;
  }
  figcaption {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  b {
    font-weight: 700;
    color: var(--text);
  }
</style>
