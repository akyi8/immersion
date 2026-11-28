<script lang="ts">
  import type { AspectCard, CardFace } from '../../lib/game/card';
  import { renderLines } from '../../lib/render';
  import Icon from '../Icon.svelte';

  /**
   * An aspect's card (Cerys, November 27): the shape of a tarot card, 70 by 120, with the
   * lit face on one side and the darkened face on the other. A click, or F with the
   * keyboard on the card, turns it over. The text is one fixed size. A face that holds
   * more than the card can is not shrunk: the text runs out under a fade, and a strip says
   * by about how many lines, because fitting a rule onto a face is part of writing it.
   */
  let {
    card,
    icon = null,
    flipped = $bindable(false),
    scale = 1,
    tagKey,
    onOpenTag,
    onOver,
  }: {
    card: AspectCard;
    icon?: string | null;
    flipped?: boolean;
    /** The card's size against its full size, which is 300 wide. The text scales with it. */
    scale?: number;
    /** The link a tag carries when it names a keyword, or null. */
    tagKey?: (tag: string) => string | null;
    onOpenTag?: (key: string) => void;
    /** How many lines each face runs over, told whenever it changes. */
    onOver?: (lit: number, dark: number) => void;
  } = $props();

  // One line of the card's text, in the card's own pixels: 12.5 at a line height of 1.42.
  const LINE = 12.5 * 1.42;
  let litBox = $state<HTMLElement>();
  let darkBox = $state<HTMLElement>();
  let over = $state({ lit: 0, dark: 0 });

  function measure() {
    const linesOver = (el?: HTMLElement) => (el ? Math.max(0, Math.ceil((el.scrollHeight - el.clientHeight - 1) / LINE)) : 0);
    const next = { lit: linesOver(litBox), dark: linesOver(darkBox) };
    if (next.lit === over.lit && next.dark === over.dark) return;
    over = next;
    onOver?.(next.lit, next.dark);
  }
  $effect(() => {
    // Measured again whenever the words change, and once the card's own type has loaded.
    void [card, scale];
    queueMicrotask(measure);
    void document.fonts?.ready.then(measure);
    const watch = new ResizeObserver(measure);
    if (litBox) watch.observe(litBox);
    if (darkBox) watch.observe(darkBox);
    return () => watch.disconnect();
  });

  const turn = () => {
    if (card.hasDark) flipped = !flipped;
  };
  function key(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      turn();
    }
  }
</script>

{#snippet face(side: 'lit' | 'dark', f: CardFace, lines: number)}
  <span class="face {side}" class:over={lines > 0} aria-hidden={(side === 'dark') !== flipped}>
    <span class="top"><span class="ckind"><Icon name={icon} size={13} />{card.kind}</span>{#if card.hasDark}<span class="state">{side === 'lit' ? 'Lit' : 'Darkened'}</span>{/if}</span>
    <span class="title" style:font-size="{card.name.length <= 16 ? 30 : card.name.length <= 26 ? 25 : 21}px">{card.name}</span>
    {#if card.tags.length}
      <span class="tags">
        {#each card.tags as t (t)}
          {@const k = tagKey?.(t) ?? null}
          {#if k}
            <!-- A tag that names a keyword shows that keyword's card and opens it. -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <span class="pill term" data-entry="game:{k}" onclick={(e) => (e.stopPropagation(), onOpenTag?.(k))}>{t}</span>
          {:else}
            <span class="pill">{t}</span>
          {/if}
        {/each}
      </span>
    {/if}
    {#if side === 'lit' && card.prerequisite}<span class="pre"><span class="ck">Prerequisite</span> {card.prerequisite}</span>{/if}
    <span class="scroll" bind:this={() => (side === 'lit' ? litBox : darkBox), (el) => (side === 'lit' ? (litBox = el) : (darkBox = el))}>
      {#if f.flavor}<span class="flavor">{@html renderLines(f.flavor)}</span>{/if}
      {#if f.rules.length}<span class="rules">{#each f.rules as r, i (i)}<span class="rule">{@html renderLines(r)}</span>{/each}</span>{/if}
      {#if f.consequences.length}<span class="rules">{#each f.consequences as r, i (i)}<span class="rule">{@html renderLines(r)}</span>{/each}</span>{/if}
      {#if side === 'dark' && card.recovery}<span class="rules"><span><span class="ck">Recovery</span> {@html renderLines(card.recovery)}</span></span>{/if}
    </span>
    {#if lines > 0}<span class="warn">Runs over by about {lines} {lines === 1 ? 'line' : 'lines'}</span>{/if}
  </span>
{/snippet}

<span
  class="acard"
  class:flipped
  class:one={!card.hasDark}
  style:zoom={scale}
  tabindex="0"
  role="button"
  aria-label="{card.name}, {flipped ? 'darkened' : 'lit'} face.{card.hasDark ? ' Press F or click to turn the card over.' : ''}"
  onclick={turn}
  onkeydown={key}>
  <span class="inner">{@render face('lit', card.lit, over.lit)}{@render face('dark', card.dark, over.dark)}</span>
</span>

<style>
  .acard {
    flex: none;
    display: inline-block;
    width: 300px;
    aspect-ratio: 70 / 120;
    perspective: 1400px;
    cursor: pointer;
    outline: none;
    text-align: left;
    font-variant: normal;
    letter-spacing: 0;
    text-transform: none;
  }
  .acard.one {
    cursor: default;
  }
  .inner {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.5s cubic-bezier(0.3, 0.8, 0.3, 1);
  }
  .flipped .inner {
    transform: rotateY(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .inner {
      transition: none;
    }
  }
  .acard:focus-visible .face {
    box-shadow: 0 0 0 2px var(--structure), 0 18px 40px var(--shadow);
  }
  .face {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 14px 15px 12px;
    box-sizing: border-box;
    overflow: hidden;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: 12px;
    border: 1px solid color-mix(in oklab, var(--accent) 55%, var(--rule-strong));
    box-shadow: 0 18px 40px var(--shadow);
    font-family: var(--font-ui);
    font-size: 12.5px;
    font-style: normal;
    font-weight: 400;
    line-height: 1.42;
    color: var(--text);
    background: linear-gradient(170deg, color-mix(in oklab, var(--accent) 9%, var(--surface)) 0%, var(--surface) 46%);
    --fade: var(--surface);
  }
  .face.dark {
    transform: rotateY(180deg);
    --fade: color-mix(in oklab, var(--surface) 62%, #000);
    background: var(--fade);
    border-color: color-mix(in oklab, var(--rule-strong) 60%, #000);
    color: color-mix(in oklab, var(--text) 72%, var(--fade));
  }
  .face span {
    display: block;
  }
  .top {
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-label);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .ckind {
    display: flex !important;
    align-items: center;
    color: var(--structure);
  }
  .state {
    color: var(--accent);
  }
  .dark .state,
  .dark .title {
    color: color-mix(in oklab, var(--text) 50%, var(--fade));
  }
  .dark .ckind,
  .dark .pill {
    opacity: 0.7;
  }
  .title {
    font-family: var(--font-display);
    letter-spacing: 0.02em;
    line-height: 0.95;
    text-transform: uppercase;
    color: var(--accent);
    overflow-wrap: anywhere;
  }
  .tags {
    display: flex !important;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pill {
    display: inline-block !important;
    font-family: var(--font-label);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: lowercase;
    padding: 1px 6px;
    border: 1px solid var(--rule-strong);
    border-radius: 999px;
    color: var(--structure);
  }
  .pill.term {
    cursor: pointer;
    border-color: var(--structure);
  }
  .pill.term:hover {
    background: color-mix(in oklab, var(--structure) 18%, transparent);
  }
  .ck {
    display: inline !important;
    font-family: var(--font-label);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-right: 3px;
  }
  .pre {
    font-size: 12px;
    color: var(--text-soft);
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex !important;
    flex-direction: column;
    gap: 7px;
    position: relative;
  }
  .scroll > span {
    flex: none;
  }
  .flavor {
    font-style: italic;
    color: var(--text-soft);
  }
  .dark .flavor {
    color: inherit;
    opacity: 0.85;
  }
  .rules {
    display: flex !important;
    flex-direction: column;
    gap: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--rule);
  }
  .rule {
    padding-left: 9px;
    text-indent: -9px;
  }
  .face :global(strong) {
    color: var(--text);
  }
  .face :global(br) {
    display: inline;
  }
  /* A face that holds too much: the text runs out under a fade, and the strip says by how much. */
  .face.over::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 22px;
    height: 46px;
    background: linear-gradient(transparent, var(--fade));
    pointer-events: none;
  }
  .warn {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    padding: 5px 15px;
    font-family: var(--font-label);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    color: var(--bg);
    background: var(--danger);
  }
</style>
