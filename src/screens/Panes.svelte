<script lang="ts">
  import Pick from './Pick.svelte';
  import { tick, untrack, type Snippet } from 'svelte';
  import type { Navigator } from '../lib/nav.svelte';
  import { ui } from '../lib/ui.svelte';
  import { beats } from '../lib/beats.svelte';
  import { views } from '../lib/view.svelte';
  import { saveAll } from '../lib/saves';
  import { pageActions, pictureActions } from '../lib/pane.svelte';
  import { contextMenu } from '../lib/contextMenu.svelte';
  import PaneScope from './PaneScope.svelte';
  import { room } from '../lib/room.svelte';

  /**
   * Sliding panes, after Andy Matuschak's notes (Cerys, October 24). Entries open side by
   * side, left to right. When the row is wider than the screen, it scrolls sideways, and
   * the panes that slide off the left edge stack into narrow spines with their titles
   * running upward. Clicking a spine brings its pane back into view. Each module decides
   * what its panes hold, through the `pane` snippet.
   *
   * Every document carries the same toolbar in its top corner (Cerys, October 26, and the
   * interface's rules of November 15), in one order: ⋯ for what is done to the page, Aa
   * for how it looks, full screen, a new window, and close. A page's title is one size
   * alone and a smaller one when pages share the row. Beats live in the pane's own actions row (Cerys,
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
    isCard = () => false,
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
    /** Whether a pane's page is laid out as a card, with its picture behind it. */
    isCard?: (id: string) => boolean;
  } = $props();

  const full = $derived(ui.full && ids.includes(ui.full) ? ui.full : null);

  // Each document remembers how it is shown (Cerys, November 10): the size of
  // its text and its picture. The choices
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
  // The Radiance room shows the picture of the page in use, so it is told which pages are open.
  let wereOpen: string[] = [];
  $effect(() => {
    // A page just opened is the page in use.
    const fresh = ids.find((id) => !wereOpen.includes(id));
    if (fresh && wereOpen.length) room.focus = fresh;
    wereOpen = [...ids];
    room.open = ids;
    return () => (room.open = []);
  });

  let strip: HTMLDivElement | undefined = $state();
  let spined = $state<boolean[]>([]);
  // Two panes fit side by side with room for the spines, whatever the window's size.
  let width = $state(560);

  function fit() {
    if (strip) {
      const room = strip.clientWidth;
      // Two panes side by side need about 420 each. In a narrower window one pane takes the
      // room and the others stack as spines, so no page is cut off mid-word.
      const half = (room - 2 * SPINE) / 2;
      width = Math.round(half >= 420 ? Math.min(680, half) : Math.max(320, Math.min(680, room - 2 * SPINE)));
    }
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

  // Following a name that is already open brings its pane into view. Only a new request
  // does this. The row of pages is made again after every save, and reading it here would
  // run this again and pull the row back to the page last asked for, away from the page
  // being written in (Cerys, November 21).
  $effect(() => {
    const r = nav.reveal;
    if (!r) return;
    const i = untrack(() => panes.indexOf(r.id));
    if (i >= 0) show(i);
  });

  /**
   * Escape closes the page the writer is in, after everything is saved (Cerys, November 11).
   * With no page holding the keyboard, it closes the last one. It stands aside while
   * anything else that answers Escape is open: a dialog, a menu, Settings, the finder, or
   * a field being typed in.
   */
  const ESCAPE_TAKEN = 'form.dialog, .settings, .finder, aside.panel, [role="menu"], [role="dialog"], [aria-modal="true"]';
  async function closeCurrent(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, select, textarea') || document.querySelector(ESCAPE_TAKEN)) return;
    if (!strip?.isConnected || !panes.length) return;
    const sections = [...strip.querySelectorAll<HTMLElement>(':scope > .row > .pane')];
    const held = sections.findIndex((el) => el.contains(document.activeElement));
    const id = panes[held >= 0 ? held : panes.length - 1];
    await saveAll();
    nav.close(id);
  }
</script>

<svelte:window
  onresize={fit}
  onkeydown={(e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (viewing) viewing = null;
    else if (full) leaveFull();
    // Anything else that answers Escape marks the key as handled, whichever listener
    // runs first, so this waits a moment and looks again before closing a page.
    else setTimeout(() => !e.defaultPrevented && void closeCurrent(e), 0);
  }}
  onmousedown={outsideView} />

<div class="strip sheet" class:full={!!full} bind:this={strip} onscroll={measure} style:--pane-width="{width}px">
  <div class="row" class:many={panes.length > 1 && !full}>
    {#each panes as id, i (id)}
      {@const name = label(id)}
      {@const look = views.of(id)}
      {@const offers = pictureActions.of(id)}
      <section
        class="pane"
        class:spined={spined[i] && !full}
        class:last={i === panes.length - 1}
        class:alone={full === id}
        class:hidden={!!full && full !== id}
        style:left="{full ? 0 : i * SPINE}px"
        onpointerdown={() => (room.focus = id)}
        onfocusin={() => (room.focus = id)}
        aria-label={name}>
        <div class="spine" aria-hidden={!spined[i]}>
          <button type="button" class="spine-title" tabindex={spined[i] ? 0 : -1} onclick={() => show(i)}>
            <span>{name}</span>
          </button>
          <button type="button" class="spine-close" tabindex={spined[i] ? 0 : -1} aria-label="Close {name}" title="Close" onclick={() => nav.close(id)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
          </button>
        </div>
        <div class="body" class:carded={isCard(id)} data-text={look.text}>
          <div class="tools" role="toolbar" aria-label="{name} tools">
            {#if pageActions.of(id).length && !full}
              <button
                type="button"
                aria-label="More for {name}"
                aria-haspopup="menu"
                title="More"
                onclick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  contextMenu.show(e, pageActions.of(id), { x: r.left, y: r.bottom + 4 });
                }}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
              </button>
            {/if}
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
              <div class="label">Text</div>
              <Pick fill label="Text size" value={look.text} onpick={(text) => views.set(id, { text })} options={[['small', 'Smaller'], ['normal', 'Usual']] as const} />
              <div class="rule" role="separator"></div>
              {#if offers.length}
                {@const choices = offers.filter((o) => o.pressed !== undefined)}
                {@const actions = offers.filter((o) => o.pressed === undefined)}
                <div class="label">Picture</div>
                {#if choices.length}
                  <Pick fill label="Picture" value={choices.find((c) => c.pressed)?.label ?? null} onpick={(l) => choices.find((c) => c.label === l)?.run()} options={choices.map((c) => [c.label, c.label] as const)} />
                {/if}
                {#if actions.length}
                  <div class="offers">
                    {#each actions as offer (offer.label)}
                      <button type="button" onclick={() => ((viewing = null), offer.run())}>{offer.label}</button>
                    {/each}
                  </div>
                {/if}
              {/if}
              <p class="hint">The text size and a hidden picture are remembered for this page on this computer. The picture and its shape are kept with the page.</p>
            </div>
          {/if}
          <PaneScope {id}>{@render pane(id, i, panes[i + 1] ?? null, full === id)}</PaneScope>
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
  /* Pages that share the row carry the smaller of the two title sizes. */
  .row.many {
    --title-size: 40px;
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
  .body[data-text='small'] {
    --prose-size: calc(var(--prose-base) * 0.88);
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
    border-radius: var(--round);
    /* The same surface as the app's menus, so every menu reads as one kind of thing. */
    box-shadow: 0 10px 28px var(--scrim);
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
  .view-menu .rule {
    height: 1px;
    margin: 8px 0 2px;
    background: var(--rule-strong, var(--edge));
    opacity: 0.6;
  }
  .view-menu .offers {
    display: grid;
    gap: 2px;
    margin-top: 4px;
  }
  .view-menu .offers button {
    text-align: left;
    padding: 5px 8px;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    background: none;
    border: 0;
  }
  .view-menu .offers button:hover {
    color: var(--text);
    background: var(--well, var(--bg));
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
    /* A page in full screen is as wide as the window and no wider, so something wide inside
       it, such as a sheet of aspects, scrolls in its own box where the writer can reach it. */
    min-width: 0;
    max-width: 100%;
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
    opacity: 0.6;
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
  .pane.alone .body > :global(*:not(.tools)) {
    margin-left: auto;
    margin-right: auto;
  }
  .strip.full {
    overflow-x: hidden;
  }
  /* In full screen the row is the window's width, so the one page in it is too. */
  .strip.full .row {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
  }
</style>
