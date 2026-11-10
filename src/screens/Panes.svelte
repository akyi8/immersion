<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { Navigator } from '../lib/nav.svelte';
  import { ui } from '../lib/ui.svelte';
  import { beats } from '../lib/beats.svelte';
  import { views } from '../lib/view.svelte';

  /**
   * Sliding panes, after Andy Matuschak's notes (Mike, October 24). Entries open side by
   * side, left to right. When the row is wider than the screen, it scrolls sideways, and
   * the panes that slide off the left edge stack into narrow spines with their titles
   * running upward. Clicking a spine brings its pane back into view. Each module decides
   * what its panes hold, through the `pane` snippet.
   *
   * Every document carries the same toolbar in its top corner (Mike, October 26): full
   * screen, a new window, and close. Beats live in the pane's own actions row (Mike,
   * October 31), and show up here only in full screen, where that row is hidden. Full screen shows
   * one pane alone, and the others stay open behind it, so nothing loses its place.
   */
  let {
    nav,
    ids,
    label,
    pane,
    onWindow,
    hasBeats,
    canWindow = () => true,
    hasPicture = () => false,
    canCard = () => false,
  }: {
    nav: Navigator;
    /** What is open, left to right. */
    ids: string[];
    /** The name on a pane's spine and close button. */
    label: (id: string) => string;
    pane: Snippet<[id: string, i: number, next: string | null, full: boolean]>;
    /** Moves a pane into a reading window of its own. */
    onWindow?: (id: string) => void;
    /** Whether a pane's document has beats to show beside it. */
    hasBeats?: (id: string) => boolean;
    /** Whether a pane may move to a reading window. The vault never may. */
    canWindow?: (id: string) => boolean;
    /** Whether a pane's document can carry a picture, which its view can then hide. */
    hasPicture?: (id: string) => boolean;
    /** Whether a pane's page can be laid out as a card, with its picture behind it. */
    canCard?: (id: string) => boolean;
  } = $props();

  const full = $derived(ui.full && ids.includes(ui.full) ? ui.full : null);

  // Each document remembers how it is shown (Mike, November 10): its column, the size of
  // its text, its picture, and whether the paragraph being written is lit. The choices
  // sit behind one button in the document's toolbar, the same for every kind of document.
  let viewing = $state<string | null>(null);
  function outsideView(e: MouseEvent) {
    if (viewing && !(e.target as HTMLElement).closest('.view-menu, .view-button')) viewing = null;
  }

  function leaveFull() {
    const was = full;
    ui.full = null;
    if (was) tick().then(() => show(panes.indexOf(was), false));
  }

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
    // The row is made again after every save. The same panes in the same order are no
    // change, and the row stays where the writer left it.
    if (now.length === before.length && now.every((id, i) => id === before[i])) return;
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

<svelte:window
  onresize={fit}
  onkeydown={(e) => {
    if (e.key === 'Escape' && viewing) viewing = null;
    else if (e.key === 'Escape' && full) leaveFull();
  }}
  onmousedown={outsideView} />

<div class="strip sheet" class:full={!!full} bind:this={strip} onscroll={measure} style:--pane-width="{width}px">
  <div class="row">
    {#each panes as id, i (id)}
      {@const name = label(id)}
      {@const look = views.of(id)}
      <section
        class="pane"
        class:spined={spined[i] && !full}
        class:last={i === panes.length - 1}
        class:alone={full === id}
        class:hidden={!!full && full !== id}
        style:left="{full ? 0 : i * SPINE}px"
        aria-label={name}>
        <div class="spine" aria-hidden={!spined[i]}>
          <button type="button" class="spine-title" tabindex={spined[i] ? 0 : -1} onclick={() => show(i)}>
            <span>{name}</span>
          </button>
          <button type="button" class="spine-close" tabindex={spined[i] ? 0 : -1} aria-label="Close {name}" title="Close" onclick={() => nav.close(id)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
          </button>
        </div>
        <div class="body" class:carded={look.picture === 'behind' && canCard(id)} data-column={look.column} data-text={look.text} data-lit={look.lit ? 'on' : 'off'}>
          <div class="tools" role="toolbar" aria-label="{name} tools">
            <button type="button" class="view-button" class:on={viewing === id} aria-label="How {name} is shown" aria-expanded={viewing === id} title="How this page is shown" onclick={() => (viewing = viewing === id ? null : id)}>
              <svg width="15" height="13" viewBox="0 0 15 13" aria-hidden="true"><path d="M1 11 L4.5 2 L8 11 M2.4 7.6 H6.6 M9.5 11 L11.7 5.5 L14 11 M10.3 9 H13.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
            </button>
            {#if full === id && hasBeats?.(id)}
              <button type="button" class="beats" class:on={beats.on} aria-pressed={beats.on} title="This chapter's beats, beside the writing" onclick={() => beats.set(!beats.on)}>Beats</button>
            {/if}
            {#if full === id}
              <button type="button" aria-label="Leave full screen" title="Leave full screen (Esc)" onclick={leaveFull}>
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M5 1.5 V5 H1.5 M8 1.5 V5 H11.5 M5 11.5 V8 H1.5 M8 11.5 V8 H11.5" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
              </button>
            {:else}
              <button type="button" aria-label="Show {name} full screen" title="Full screen" onclick={() => (ui.full = id)}>
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M1.5 5 V1.5 H5 M8 1.5 H11.5 V5 M1.5 8 V11.5 H5 M8 11.5 H11.5 V8" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
              </button>
            {/if}
            {#if onWindow && !full && canWindow(id)}
              <button type="button" aria-label="Open {name} in a new window" title="Open in a new window" onclick={() => onWindow(id)}>
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M5 2 H11 V8 M11 2 L5.5 7.5 M9 9.5 V11 H2 V4 H3.5" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
              </button>
            {/if}
            {#if !full}
              <button type="button" aria-label="Close {name}" title="Close" onclick={() => nav.close(id)}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
              </button>
            {/if}
          </div>
          {#if viewing === id}
            <div class="view-menu" role="group" aria-label="How {name} is shown">
              <div class="label">Column</div>
              <div class="pair">
                <button type="button" aria-pressed={look.column === 'book'} onclick={() => views.set(id, { column: 'book' })}>Book</button>
                <button type="button" aria-pressed={look.column === 'wide'} onclick={() => views.set(id, { column: 'wide' })}>Wide</button>
              </div>
              <div class="label">Text</div>
              <div class="pair">
                <button type="button" aria-pressed={look.text === 'small'} onclick={() => views.set(id, { text: 'small' })}>Smaller</button>
                <button type="button" aria-pressed={look.text === 'normal'} onclick={() => views.set(id, { text: 'normal' })}>Usual</button>
              </div>
              {#if hasPicture(id)}
                <div class="label">Picture</div>
                <div class="pair">
                  <button type="button" aria-pressed={look.picture === 'show'} onclick={() => views.set(id, { picture: 'show' })}>Show</button>
                  <button type="button" aria-pressed={look.picture === 'hide'} onclick={() => views.set(id, { picture: 'hide' })}>Hide</button>
                  {#if canCard(id)}
                    <button type="button" class="wide" aria-pressed={look.picture === 'behind'} onclick={() => views.set(id, { picture: 'behind' })}>Behind the page</button>
                  {/if}
                </div>
              {/if}
              <div class="label">While writing</div>
              <label class="check"><input type="checkbox" checked={look.lit} onchange={(e) => views.set(id, { lit: e.currentTarget.checked })} /> Light the paragraph I am in</label>
              <p class="hint">This page remembers these on this computer.</p>
            </div>
          {/if}
          {@render pane(id, i, panes[i + 1] ?? null, full === id)}
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
    border-left: 1px solid var(--line);
    box-shadow: -10px 0 18px -14px var(--shadow);
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
    /* Room at the top for the document toolbar, so a long label never runs under it. */
    padding: 56px 40px 60px;
    box-sizing: border-box;
    transition: opacity 120ms;
  }
  /* A book's line holds about sixty-six characters, and follows the size of the text. */
  .body[data-text='small'] {
    --prose-size: calc(var(--prose-base) * 0.88);
  }
  .body[data-column='book'] {
    --measure: calc(var(--prose-size) * 33);
  }
  /* The lit paragraph: the others fall back while the writing has the keyboard, and the
     page eases to keep the line in place, with room below the last line to do it. */
  .body[data-lit='on'] {
    scroll-behavior: smooth;
    padding-bottom: 55vh;
  }
  .body[data-lit='on'] :global(.cm-focused .cm-line) {
    opacity: 0.4;
    transition: opacity 350ms ease;
  }
  .body[data-lit='on'] :global(.cm-focused .cm-activeLine) {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .body[data-lit='on'] {
      scroll-behavior: auto;
    }
  }
  .tools .view-button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .view-menu {
    position: absolute;
    top: 52px;
    right: 14px;
    z-index: 3;
    width: 220px;
    padding: 14px 16px 12px;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round-box, 0);
    box-shadow: var(--lift, 0 12px 30px -12px var(--shadow));
    display: grid;
    gap: 6px;
  }
  .pane.alone .view-menu {
    position: fixed;
    right: 18px;
  }
  .view-menu .label {
    margin-top: 6px;
  }
  .view-menu .label:first-child {
    margin-top: 0;
  }
  .view-menu .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
  .view-menu .pair button {
    padding: 6px 0;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    background: none;
    border: 1px solid var(--edge);
  }
  .view-menu .pair .wide {
    grid-column: 1 / -1;
  }
  .view-menu .pair button[aria-pressed='true'] {
    color: var(--selected-fg);
    background: var(--selected-bg);
    border-color: var(--selected-border);
  }
  .view-menu .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
  }
  .view-menu .hint {
    margin: 8px 0 0;
    font-size: calc(12px * var(--type));
    color: var(--muted);
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
    font-size: calc(12px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 100%;
  }
  .tools {
    position: absolute;
    top: 14px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 2px;
    z-index: 2;
  }
  .tools button {
    min-width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 0;
  }
  .tools .beats {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0 8px;
    margin-right: 4px;
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .tools .beats.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    border-color: var(--selected-border);
  }
  .tools button:hover {
    color: var(--text);
    background: var(--surface);
  }
  /* Full screen: one pane alone, with the others kept open but out of sight. */
  .pane.hidden {
    display: none;
  }
  .pane.alone {
    flex: 1 0 100%;
    width: 100%;
    border-left: 0;
    box-shadow: none;
  }
  .pane.alone .body {
    padding: 12vh 32px 30vh;
  }
  .pane.alone .tools {
    position: fixed;
    top: 14px;
    right: 18px;
    opacity: 0.25;
    transition: opacity 200ms;
  }
  .pane.alone .tools:hover,
  .pane.alone .tools:focus-within {
    opacity: 1;
  }
  /* A card fills its pane in full screen too, with the same margins its foot counts on. */
  .pane.alone .body.carded {
    padding: 56px 40px 60px;
  }
  .pane.alone .body.carded > :global(*:not(.tools)) {
    margin-left: 0;
    margin-right: 0;
  }
  .pane.alone .body > :global(*:not(.tools)) {
    margin-left: auto;
    margin-right: auto;
  }
  .strip.full {
    overflow-x: hidden;
  }
</style>
