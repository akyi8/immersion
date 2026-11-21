<script lang="ts">
  import type { Placed } from '../../lib/game/game';
  import GameText from './GameText.svelte';

  /**
   * A rule's text as the book prints it (Mike, November 21): the rule, then, in a world's
   * book, what that world adds after a core rule, which is its examples and clarifications
   * and never a change to the rule. A core rule with nothing added shows a small control
   * to add it, and no empty box.
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

<GameText compact text={rule.element.flavor} self="game:{rule.key}" label="{rule.element.name}, the rule" placeholder="The rule, as the book prints it." onChange={onText} />
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
