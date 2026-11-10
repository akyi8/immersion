<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { SectionNode } from '../../lib/game/game';
  import type { Frame } from '../../lib/index/frame';
  import { renderRule } from '../../lib/game/render';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import GameBanner, { type PictureChoice } from './GameBanner.svelte';
  import GameText from './GameText.svelte';

  /**
   * A rule section, read as the book prints it (Mike, November 9). Its introduction is
   * written here; below it, every rule follows in order, formatted, with the world's
   * piece after each core rule. A rule's name opens it for writing.
   */
  let {
    section,
    inWorld,
    place,
    worldName,
    names,
    picture,
    choices,
    onFrame,
    onSave,
    onOpen,
  }: {
    section: SectionNode;
    inWorld: boolean;
    place: string;
    worldName: string;
    /** The name of an origin: the engine, the world, or an expansion. */
    names: (origin: string) => string;
    picture: { url: string; frame: Frame | null } | null;
    choices: PictureChoice[];
    onFrame: (frame: Frame) => Promise<void>;
    onSave: (changes: { name: string; intro: string }) => Promise<void>;
    /** Opens a rule or an element by its key. */
    onOpen: (key: string, type: 'rule' | 'element') => void;
  } = $props();

  let name = $state((() => section.placed.element.name)());
  let intro = $state((() => section.placed.element.flavor)());
  // svelte-ignore state_referenced_locally
  const saver = new Saver(() => onSave({ name: name.trim() || section.placed.element.name, intro }));
  onDestroy(() => void saver.flush());
  const rules = $derived(section.items.filter((i) => i.type === 'rule').length);
</script>

<article class="section">
  <GameBanner url={picture?.url ?? null} frame={picture?.frame ?? null} {place} {choices} {onFrame}>
    {#snippet title()}
      <input class="title" type="text" bind:value={name} oninput={() => saver.push(null)} aria-label="Section name" autocomplete="off" />
    {/snippet}
  </GameBanner>
  <div class="status-row">
    <span class="meta">{rules} {rules === 1 ? 'rule' : 'rules'}</span>
    <span class="status">{said(saver.status)}</span>
  </div>
  {#if saver.problem}<p class="problem" role="alert">{saver.problem}</p>{/if}
  <GameText
    text={section.placed.element.flavor}
    self="game:{section.placed.key}"
    label="Section introduction"
    placeholder="The section's introduction, before its first rule."
    onChange={(t) => {
      intro = t;
      saver.push(null);
    }} />

  <div class="read">
    {#each section.items as item, i (i)}
      {#if item.type === 'heading'}
        <p class="divider">{item.text}</p>
      {:else}
        <section class="rule">
          <h2><button type="button" onclick={() => onOpen(item.placed.key, 'rule')}>{item.placed.element.name}</button></h2>
          {#if item.placed.element.flavor}
            <div class="prose">{@html renderRule(item.placed.element.flavor)}</div>
          {:else}
            <p class="empty">Nothing written yet.</p>
          {/if}
          {#if item.worldPiece?.element.flavor}
            <div class="prose world" aria-label="{worldName}'s piece">{@html renderRule(item.worldPiece.element.flavor)}</div>
          {/if}
          {#each item.expansionPieces.filter((x) => x.element.flavor) as x (x.key)}
            <div class="prose world expansion">
              <span class="own">{names(x.origin)}</span>
              {@html renderRule(x.element.flavor)}
            </div>
          {/each}
          {#if inWorld && item.placed.origin !== 'engine'}<span class="own">{names(item.placed.origin)}'s own rule</span>{/if}
        </section>
      {/if}
    {/each}
    {#if section.elements.length}
      <p class="divider">Listed here</p>
      <ul class="elements">
        {#each section.elements as p (p.key)}
          <li><button type="button" onclick={() => onOpen(p.key, 'element')}>{p.element.name}</button></li>
        {/each}
      </ul>
    {/if}
  </div>
</article>

<style>
  /* The banner runs the pane's full width, and everything under it keeps a reading width. */
  article > :global(:not(.poster)) {
    max-width: var(--measure, 760px);
  }
  .title {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 4px 0 2px -5px;
    color: var(--title);
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(48px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.05;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--round);
    padding: 2px 4px;
  }
  .title:hover,
  .title:focus {
    border-color: var(--edge);
    outline: none;
  }
  .status-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .meta,
  .status {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  .read {
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  .rule {
    margin: 0 0 28px;
  }
  h2 {
    margin: 22px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(28px * var(--type));
    letter-spacing: 0.02em;
    color: var(--title);
  }
  h2 button {
    font: inherit;
    color: inherit;
    letter-spacing: inherit;
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  h2 button:hover {
    color: var(--structure);
  }
  .prose {
    font-family: var(--font-body);
    font-size: var(--prose-size);
    line-height: var(--prose-leading);
    color: var(--text);
  }
  .prose :global(h3) {
    margin: 1.3em 0 0.4em;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--structure);
  }
  .prose :global(p) {
    margin: 0 0 0.8em;
  }
  .prose.world {
    margin-top: 10px;
    padding-left: 16px;
    border-left: 2px solid var(--structure-deep, var(--line));
    color: var(--text-soft);
  }
  .prose.expansion {
    border-left-style: dashed;
  }
  .empty {
    color: var(--muted);
    font-style: italic;
  }
  .own {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--structure);
  }
  .divider {
    margin: 26px 0 4px;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--structure);
  }
  .elements {
    margin: 0;
    padding-left: 18px;
  }
  .elements button {
    color: var(--text-soft);
    background: none;
    border: 0;
    padding: 3px 0;
  }
  .elements button:hover {
    color: var(--text);
  }
</style>
