<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { Navigator } from '../lib/nav.svelte';

  /**
   * Sliding panes, after Andy Matuschak's notes (Mike, October 24). Entries open side by
   * side, left to right. When the row is wider than the screen, it scrolls sideways, and
   * the panes that slide off the left edge stack into narrow spines with their titles
   * running upward. Clicking a spine brings its pane back into view. Each module decides
   * what its panes hold, through the `pane` snippet.
   */
  let {
    nav,
    ids,
    label,
    pane,
  }: {
    nav: Navigator;
    /** What is open, left to right. */
    ids: string[];
    /** The name on a pane's spine and close button. */
    label: (id: string) => string;
    pane: Snippet<[id: string, i: number, next: string | null]>;
  } = $props();

  /** How much of a covered pane still shows: its spine. */
  const SPINE = 44;

  const panes = $derived(ids);

  let strip: HTMLDivElement | undefined = $state();
  let spined = $state<boolean[]>([]);
  // Two panes fit side by side with room for the spines, whatever the window's size.
  let width = $state(560);

  function fit() {
    if (strip) width = Math.round(Math.min(680, Math.max(420, (strip.clientWidth - 2 * SPINE) / 2)));
    measure();
  }

  /** Which panes are covered so far that only their spine should show. */
  function measure() {
    if (!strip) return;
    const els = [...strip.querySelectorAll<HTMLElement>('.pane')];
    const lefts = els.map((el) => el.getBoundingClientRect().left);
    // A pane with less than about half its width showing reads as a sliver of cut-off
    // text, so it folds to its spine too.
    spined = els.map((el, i) => i < els.length - 1 && lefts[i + 1] - lefts[i] < el.offsetWidth * 0.4);
  }

  /** Scrolls so the pane at `i` shows in full, with only the spines before it stacked. */
  function show(i: number, smooth = true) {
    if (!strip) return;
    const els = [...strip.querySelectorAll<HTMLElement>('.pane')];
    if (!els.length) return;
    const last = Math.min(i, els.length - 1);
    // Where the pane would sit if nothing were stuck: the widths of the panes before it.
    const natural = els.slice(0, last).reduce((sum, el) => sum + el.offsetWidth, 0);
    const left = i >= els.length - 1 ? strip.scrollWidth : natural - last * SPINE;
    strip.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
  }

  // A newly opened pane slides into view beside the pane it was opened from. Any other
  // change to the row, such as Back or a close, shows the end of the row.
  let before: string[] = [];
  $effect(() => {
    const now = [...panes];
    const added = now.findIndex((id) => !before.includes(id));
    before = now;
    tick().then(() => {
      fit();
      show(added > 0 && added < now.length - 1 ? added - 1 : Infinity);
    });
  });

  // Following a name that is already open brings its pane into view.
  $effect(() => {
    const r = nav.reveal;
    if (!r) return;
    const i = panes.indexOf(r.id);
    if (i >= 0) show(i);
  });
</script>

<svelte:window onresize={fit} />

<div class="strip" bind:this={strip} onscroll={measure} style:--pane-width="{width}px">
  <div class="row">
    {#each panes as id, i (id)}
      {@const name = label(id)}
      <section class="pane" class:spined={spined[i]} class:last={i === panes.length - 1} style:left="{i * SPINE}px" aria-label={name}>
        <div class="spine" aria-hidden={!spined[i]}>
          <button type="button" class="spine-title" tabindex={spined[i] ? 0 : -1} onclick={() => show(i)}>
            <span>{name}</span>
          </button>
          <button type="button" class="spine-close" tabindex={spined[i] ? 0 : -1} aria-label="Close {name}" title="Close" onclick={() => nav.close(id)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
          </button>
        </div>
        <div class="body">
          <button type="button" class="close" aria-label="Close {name}" title="Close" onclick={() => nav.close(id)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
          </button>
          {@render pane(id, i, panes[i + 1] ?? null)}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .strip {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    display: flex;
  }
  .row {
    display: flex;
    flex: 1 0 auto;
    min-height: 100%;
  }
  .pane {
    position: sticky;
    flex: 0 0 var(--pane-width);
    width: var(--pane-width);
    height: 100%;
    box-sizing: border-box;
    background: var(--bg);
    border-left: 1px solid var(--rule);
    box-shadow: -10px 0 18px -14px rgba(0, 0, 0, 0.9);
  }
  .pane:first-child {
    border-left: 0;
    box-shadow: none;
  }
  /* The last pane takes whatever room is left, so a single entry reads at full width. */
  .pane.last {
    flex: 1 0 var(--pane-width);
  }
  .body {
    position: relative;
    height: 100%;
    overflow-y: auto;
    padding: 32px 40px 60px;
    box-sizing: border-box;
    transition: opacity 120ms;
  }
  .spined .body {
    opacity: 0;
    pointer-events: none;
  }
  .spine {
    display: none;
    position: absolute;
    inset: 0 auto 0 0;
    width: 44px;
    z-index: 1;
    flex-direction: column;
    background: var(--bg);
  }
  .spined .spine {
    display: flex;
  }
  .spine button {
    display: flex;
    justify-content: center;
    background: none;
    border: 0;
    color: var(--text-soft);
  }
  .spine-title {
    flex: 1;
    min-height: 0;
    padding: 20px 0 8px;
  }
  .spine-close {
    flex: 0 0 44px;
    align-items: center;
    color: var(--muted) !important;
  }
  .spine button:hover {
    color: var(--text) !important;
    background: var(--surface);
  }
  .spine span {
    writing-mode: vertical-rl;
    font-family: var(--font-label);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 100%;
  }
  .close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 0;
    z-index: 1;
  }
  .close:hover {
    color: var(--text);
    background: var(--surface);
  }
</style>
