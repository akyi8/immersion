<script lang="ts">
  import { titleFocus } from '../../lib/table/tray.svelte';
  import { onDestroy } from 'svelte';
  import type { Placed, SectionNode } from '../../lib/game/game';
  import type { Frame } from '../../lib/index/frame';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import GameBanner, { type PictureChoice } from './GameBanner.svelte';
  import GameText from './GameText.svelte';
  import SectionRule from './SectionRule.svelte';
  import CoreMark from './CoreMark.svelte';

  /**
   * A rule section as one continuous page, which is where a game is written (Mike,
   * November 21). It reads the way the book prints: the introduction, then every rule
   * under its heading in book order, each written in place, with what the world adds
   * after each core rule. A rule can still be opened alone.
   */
  let {
    titleId = '',
    section,
    inWorld,
    place,
    engineName,
    worldName,
    picture,
    choices,
    onFrame,
    onSave,
    onSaveRule,
    onSaveWorld,
    onAddRule,
    onOpen,
  }: {
    /** The page's id, so Rename in its menu can put the cursor in the title. */
    titleId?: string;
    section: SectionNode;
    inWorld: boolean;
    place: string;
    engineName: string;
    worldName: string;
    picture: { url: string; frame: Frame | null } | null;
    choices: PictureChoice[];
    onFrame: (frame: Frame) => Promise<void>;
    onSave: (changes: { name: string; intro: string }) => Promise<void>;
    onSaveRule: (rule: Placed, changes: { name: string; text: string }) => Promise<void>;
    /** Saves what the world adds after a core rule. */
    onSaveWorld: (rule: Placed, text: string) => Promise<void>;
    /** Adds a rule at the foot of this section, and stays on this page. */
    onAddRule: (name: string) => Promise<void>;
    /** Opens a rule or an element by its key. */
    onOpen: (key: string, type: 'rule' | 'element') => void;
  } = $props();

  let name = $state((() => section.placed.element.name)());
  let intro = $state((() => section.placed.element.flavor)());
  // svelte-ignore state_referenced_locally
  const saver = new Saver(() => onSave({ name: name.trim() || section.placed.element.name, intro }));
  onDestroy(() => void saver.flush(true));
  const rules = $derived(section.items.filter((i) => i.type === 'rule').length);

  let naming = $state(false);
  let newName = $state('');

  let titleInput = $state<HTMLInputElement>();
  $effect(() => titleFocus.serve(titleId, titleInput));
</script>

<article class="section">
  <GameBanner url={picture?.url ?? null} frame={picture?.frame ?? null} {place} {choices} {onFrame}>
    {#snippet title()}
      <input class="title" type="text" bind:this={titleInput} bind:value={name} oninput={() => saver.push(null)} aria-label="Section name" autocomplete="off" />
    {/snippet}
  </GameBanner>
  <div class="status-row">
    <span class="meta">{#if section.placed.origin === 'engine'}<CoreMark {engineName} />{/if}{rules} {rules === 1 ? 'rule' : 'rules'}</span>
    <span class="status">{said(saver.status)}</span>
  </div>
  {#if saver.problem}<p class="problem" role="alert">{saver.problem}</p>{/if}
  <GameText
    compact
    text={section.placed.element.flavor}
    self="game:{section.placed.key}"
    label="Section introduction"
    placeholder="The section's introduction, before its first rule."
    onChange={(t) => {
      intro = t;
      saver.push(null);
    }} />

  <div class="read">
    {#each section.items as item, i (item.type === 'rule' ? item.placed.key : `heading-${i}`)}
      {#if item.type === 'heading'}
        <p class="divider">{item.text}</p>
      {:else}
        <SectionRule
          {item}
          {inWorld}
          {engineName}
          {worldName}
          onSave={(c) => onSaveRule(item.placed, c)}
          onSaveWorld={(t) => onSaveWorld(item.placed, t)}
          onOpen={() => onOpen(item.placed.key, 'rule')} />
      {/if}
    {/each}
    {#if naming}
      <form
        class="new"
        onsubmit={async (e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n) return;
          newName = '';
          naming = false;
          await onAddRule(n);
        }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={newName} placeholder="The new rule's name" aria-label="The new rule's name" autocomplete="off" autofocus onkeydown={(e) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), (naming = false))} />
        <button type="submit" disabled={!newName.trim()}>Add</button>
        <button type="button" class="quiet" onclick={() => (naming = false)}>Cancel</button>
      </form>
    {:else}
      <button type="button" class="add" onclick={() => (naming = true)}>+ New rule</button>
    {/if}
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
    font-size: calc(var(--title-size) * var(--type));
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
  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
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
    margin-top: 10px;
  }
  .add,
  .new button {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: none;
    border: 1px dashed var(--edge);
    border-radius: var(--round);
    padding: 5px 12px;
  }
  .add {
    margin-top: 18px;
  }
  .new {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 18px;
  }
  .new input {
    flex: 1 1 200px;
    font: inherit;
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 5px 10px;
  }
  .new .quiet {
    color: var(--muted);
    border-color: transparent;
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
