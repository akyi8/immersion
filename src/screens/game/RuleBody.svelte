<script lang="ts">
  import { isSlot, type Placed } from '../../lib/game/game';
  import GameText from './GameText.svelte';

  /**
   * A rule's text as the book prints it (Cerys, November 21): the rule, then, in a world's
   * book, what that world adds after a core rule, which is its examples and clarifications
   * and never a change to the rule. A core rule with nothing added shows a small control
   * to add it, and no empty box.
   *
   * A core rule each world writes for itself (Cerys, November 27) turns that around. In a
   * world's book the world's text is the rule and stands first, and the base text folds
   * away under it, because that world does not print it. Until the world writes its own,
   * the base text shows, with a line saying so.
   */
  let {
    rule,
    worldPiece,
    inWorld,
    worldName,
    onText,
    onWorld,
  }: {
    rule: Placed;
    worldPiece: Placed | null;
    /** Whether the book open is the world's, which shows what the world adds. */
    inWorld: boolean;
    worldName: string;
    onText: (text: string) => void;
    onWorld: (text: string) => void;
  } = $props();

  const core = $derived(rule.origin === 'engine');
  const slot = $derived(isSlot(rule));
  const written = $derived((worldPiece?.element.flavor ?? '').trim() !== '');
  // Opened by the control, before anything is typed. It stays open once it has been written in.
  let opened = $state(false);
  let box = $state<HTMLDivElement>();
  $effect(() => {
    if (written) opened = true;
  });
  function open() {
    opened = true;
    queueMicrotask(() => box?.querySelector<HTMLElement>('.cm-content')?.focus());
  }
</script>

{#snippet base()}
  <GameText
    compact
    text={rule.element.flavor}
    self="game:{rule.key}"
    label="{rule.element.name}, the rule"
    placeholder={slot ? `Each world writes its own text here. A note to the designer, or a version any world could print, can go here.` : 'The rule, as the book prints it.'}
    onChange={onText} />
{/snippet}

{#if slot && inWorld}
  {#if opened}
    <div class="world own" bind:this={box}>
      <span class="label">{worldName}'s own</span>
      <GameText compact text={worldPiece?.element.flavor ?? ''} label="{rule.element.name}, in {worldName}" placeholder="{worldName}'s text for this rule. It prints in place of the base text." onChange={onWorld} />
    </div>
    <details class="base">
      <summary>{written ? `The base text, which ${worldName} does not print` : `The base text, which prints until ${worldName} writes its own`}</summary>
      {@render base()}
    </details>
  {:else}
    <p class="unwritten">Each world writes its own text for this rule. {worldName} has not yet, so the base text shows.</p>
    {@render base()}
    <button type="button" class="add" onclick={open} title="Write {worldName}'s own text for this rule">+ {worldName}'s own</button>
  {/if}
{:else}
  {#if slot}<p class="unwritten">Each world writes its own text for this rule. What is written here prints only in a world that has not.</p>{/if}
  {@render base()}
  {#if core && inWorld}
    {#if opened}
      <div class="world" bind:this={box}>
        <span class="label">In {worldName}</span>
        <GameText compact text={worldPiece?.element.flavor ?? ''} label="{rule.element.name}, in {worldName}" placeholder="An example or a clarification from {worldName}." onChange={onWorld} />
      </div>
    {:else}
      <button type="button" class="add" onclick={open} title="Add {worldName}'s example or clarification for this rule">+ In {worldName}</button>
    {/if}
  {/if}
{/if}

<style>
  /* What the world adds stands where it prints, after the rule, on a ground of its own. */
  .world {
    margin-top: 6px;
    padding: 10px 14px 2px;
    background: var(--accent-wash);
    border-radius: var(--round-box, var(--round));
  }
  .world .label {
    display: block;
    margin-bottom: 2px;
    font-size: calc(11px * var(--type));
    color: var(--accent);
  }
  .world.own {
    margin: 0 0 8px;
  }
  .unwritten {
    margin: 0 0 6px;
    font-size: calc(12.5px * var(--type));
    color: var(--muted);
  }
  .base summary {
    cursor: pointer;
    font-size: calc(12.5px * var(--type));
    color: var(--muted);
  }
  .base[open] summary {
    margin-bottom: 4px;
  }
  .add {
    margin-top: 4px;
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: none;
    border: 1px dashed var(--edge);
    border-radius: 999px !important;
    padding: 3px 12px;
  }
  .add:hover {
    border-color: var(--structure);
  }
</style>
