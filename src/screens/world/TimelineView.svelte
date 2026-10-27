<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { buildTimeline } from '../../lib/time/timeline';
  import { parseWhen } from '../../lib/time/when';
  import { createEntry } from '../../lib/index/create';
  import { withHeader } from '../../lib/world';
  import { saveNow } from '../../lib/saves';
  import Portrait from './Portrait.svelte';
  import Dialog from '../shelf/Dialog.svelte';

  /**
   * The wiki's timeline (Mike, October 25). Every entry with a `when:` line is an event,
   * laid out in order, not to scale. Eras are entries with `era: true` and a span, and
   * they show as bands beside every moment they cover. Flip turns dates down the page
   * into dates across it.
   */
  let {
    index,
    fs,
    onOpen,
    rebuild,
  }: {
    index: WikiIndex;
    fs: WorldFs;
    /** Opens an entry beside the timeline. */
    onOpen: (id: string) => void;
    rebuild: () => Promise<void>;
  } = $props();

  const timeline = $derived(buildTimeline(index.all()));
  const W = $derived(timeline.moments.length);

  function savedFlip(): boolean {
    try {
      return localStorage.getItem('immersion.timelineFlip') === 'across';
    } catch {
      return false;
    }
  }
  /** False: dates run down the page. True: dates run across. */
  let across = $state(savedFlip());
  function flip() {
    across = !across;
    try {
      localStorage.setItem('immersion.timelineFlip', across ? 'across' : 'down');
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  // Grid positions. Down: era lanes, then the date, then the events, as columns.
  // Across: era lanes, then the dates, then the events, as rows.
  const lanes = $derived(timeline.lanes);
  function cell(moment: number, part: number): string {
    return across ? `grid-column: ${moment + 1}; grid-row: ${part + 1}` : `grid-row: ${moment + 1}; grid-column: ${part + 1}`;
  }
  function band(from: number, to: number, lane: number): string {
    return across ? `grid-column: ${from + 1} / ${to + 2}; grid-row: ${lane + 1}` : `grid-row: ${from + 1} / ${to + 2}; grid-column: ${lane + 1}`;
  }

  /** Writes a new `when:` into an entry, from its date on the timeline. */
  async function setWhen(id: string, value: string) {
    const v = value.trim();
    if (!v) return;
    problem = '';
    if (!parseWhen(v)) {
      problem = `The timeline can't place "${v}". Try a year such as 2057 or 44 BCE, a date such as 14 October 1066, a decade such as 1920s, or a span such as 2045 to 2060.`;
      return;
    }
    await saveNow(id);
    await fs.writeText(id, withHeader(await fs.readText(id), { when: v }));
    await rebuild();
  }

  // New events and eras.
  let making = $state<'event' | 'era' | null>(null);
  let name = $state('');
  let when = $state('');
  let folder = $state('');
  let busy = $state(false);
  let problem = $state('');
  const places = $derived([{ path: index.root.path, label: 'Unfiled' }, ...index.root.folders.map((f) => ({ path: f.path, label: folderLabel(f.name) }))]);

  function startMaking(kind: 'event' | 'era') {
    making = kind;
    name = '';
    when = '';
    problem = '';
    folder = index.root.folders.find((f) => /^(history|events?|timelines?|eras?)$/i.test(f.name))?.path ?? index.root.path;
  }

  const whenReady = $derived(!!parseWhen(when) && (making !== 'era' || /\bto\b|[–—]|\s-\s|s$|century/i.test(when)));

  async function make() {
    if (!name.trim() || !whenReady) return;
    busy = true;
    problem = '';
    try {
      const path = await createEntry(fs, name.trim(), folder);
      await fs.writeText(path, withHeader(await fs.readText(path), { when: when.trim(), era: making === 'era' ? true : undefined }));
      await rebuild();
      making = null;
      onOpen(path);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="timeline-view">
  <header>
    <div class="label">Timeline</div>
    <h1>Timeline</h1>
    <div class="row">
      <span class="meta">
        {timeline.moments.reduce((n, m) => n + m.events.length, 0)} events · {timeline.eras.length}
        {timeline.eras.length === 1 ? 'era' : 'eras'}
      </span>
      <button type="button" class="tool strong" onclick={() => startMaking('event')}>+ Event</button>
      <button type="button" class="tool" onclick={() => startMaking('era')}>+ Era</button>
      <button type="button" class="tool" onclick={flip} title="Turn the dates {across ? 'down the page' : 'across the page'}">Flip</button>
    </div>
    {#if problem && !making}<p class="problem" role="alert">{problem}</p>{/if}
  </header>

  {#if W === 0}
    <p class="empty">
      Nothing is dated yet. Any entry with a <code>when:</code> line in its header becomes an event here, such as <code>when: 2057</code> or
      <code>when: 14 October 1066</code>. An era is an entry with a span and <code>era: true</code>, such as <code>when: 2045 to 2060</code>.
    </p>
  {:else}
    <div
      class="grid"
      class:across
      style:grid-template-columns={across ? `repeat(${W}, 230px)` : `${lanes ? `repeat(${lanes}, 34px) ` : ''}150px minmax(0, 1fr)`}
      style:grid-template-rows={across ? `${lanes ? `repeat(${lanes}, 34px) ` : ''}auto auto` : ''}>
      {#each timeline.eras as b (b.era.id)}
        <button type="button" class="era" style={band(b.from, b.to, b.lane)} title="{b.era.name}, {b.era.when?.text}" onclick={() => onOpen(b.era.id)}>
          <span>{b.era.name}</span>
        </button>
      {/each}
      {#each timeline.moments as m, i (m.at)}
        <div class="date" style={cell(i, lanes)}>{m.label}</div>
        <div class="events" style={cell(i, lanes + 1)}>
          {#each m.events as e (e.id)}
            <div class="event">
              <button type="button" class="face" onclick={() => onOpen(e.id)} aria-label="Open {e.name}">
                <Portrait url={e.imagePath ? fs.imageUrl(e.imagePath) : null} name={e.name} size="face" />
              </button>
              <div class="about">
                <button type="button" class="name" onclick={() => onOpen(e.id)}>{e.name}</button>
                <input
                  class="when"
                  value={e.when?.text ?? ''}
                  aria-label="When {e.name} happened"
                  onkeydown={(ev) => ev.key === 'Enter' && (ev.currentTarget as HTMLInputElement).blur()}
                  onblur={(ev) => {
                    const v = (ev.currentTarget as HTMLInputElement).value;
                    if (v.trim() !== e.when?.text) setWhen(e.id, v);
                  }} />
                {#if e.summary}<p class="summary">{e.summary}</p>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if making}
  <Dialog title={making === 'era' ? 'New era' : 'New event'} action="Create" ready={!!name.trim() && whenReady} {busy} {problem} onSubmit={make} onCancel={() => (making = null)}>
    <label for="tl-name" class="label">Name</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="tl-name" type="text" bind:value={name} autofocus autocomplete="off" placeholder={making === 'era' ? 'The Gen X Years' : 'The Big One'} />
    <label for="tl-when" class="label">When</label>
    <input id="tl-when" type="text" bind:value={when} autocomplete="off" placeholder={making === 'era' ? '2045 to 2060' : '2057, or 14 October 1066, or c. 1200 BCE'} />
    <p class="hint">
      {#if when.trim() && !parseWhen(when)}
        The timeline can't place that yet.
      {:else if making === 'era'}
        An era needs a span, such as 2045 to 2060, the 1920s, or the 5th century BCE. Every event inside it belongs to it.
      {:else}
        A year, a date, a season, a decade, or a span.
      {/if}
    </p>
    <label for="tl-folder" class="label">Category</label>
    <select id="tl-folder" bind:value={folder}>
      {#each places as p}<option value={p.path}>{p.label}</option>{/each}
    </select>
  </Dialog>
{/if}

<style>
  .timeline-view {
    padding: 0 0 40px;
  }
  header {
    margin-bottom: 22px;
  }
  h1 {
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(60px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
    color: var(--title);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .meta {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .tool {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tool:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .tool.strong {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 700;
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  .empty {
    max-width: 560px;
    font-size: var(--prose-size);
    line-height: 1.6;
    color: var(--text-soft);
  }
  .grid {
    display: grid;
    column-gap: 0;
    row-gap: 0;
  }
  .grid.across {
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .era {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    margin: 2px;
    padding: 8px 4px;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--selected-fg);
    background: var(--selected-bg);
    border: 1px solid color-mix(in srgb, var(--selected-border) 45%, transparent);
    overflow: hidden;
  }
  .grid:not(.across) .era span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    position: sticky;
    top: 12px;
  }
  .grid.across .era {
    justify-content: flex-start;
    align-items: center;
    padding: 4px 10px;
  }
  .grid.across .era span {
    position: sticky;
    left: 10px;
    white-space: nowrap;
  }
  .era:hover {
    color: var(--text);
  }
  .date {
    padding: 14px 14px 14px 12px;
    font-family: var(--font-label);
    font-size: calc(13px * var(--type));
    color: var(--structure);
    border-top: 1px solid var(--line);
  }
  .grid.across .date {
    border-top: 0;
    border-left: 1px solid var(--line);
    padding: 10px 12px 6px;
  }
  .events {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 0 16px;
    border-top: 1px solid var(--line);
    min-height: 24px;
  }
  .grid.across .events {
    border-top: 0;
    border-left: 1px solid var(--line);
    padding: 6px 12px 16px;
  }
  .event {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }
  .face {
    padding: 0;
    border: 0;
    background: none;
  }
  .face :global(.portrait span) {
    font-size: calc(16px * var(--type));
  }
  .about {
    min-width: 0;
  }
  .name {
    display: block;
    text-align: left;
    font-family: var(--font-display);
    font-size: calc(24px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.1;
    color: var(--title);
    background: none;
    border: 0;
    padding: 0;
  }
  .when {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 2px 0;
    width: 100%;
  }
  .when:hover {
    border-bottom-color: var(--edge);
  }
  .when:focus {
    outline: none;
    color: var(--text);
    border-bottom-color: var(--structure);
  }
  .summary {
    margin: 4px 0 0;
    font-size: calc(14px * var(--type));
    line-height: 1.5;
    color: var(--text-soft);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  select,
  input[type='text'] {
    font: inherit;
    font-size: calc(16px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 10px 12px;
  }
</style>
