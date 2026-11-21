<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { RuleNode } from '../../lib/game/game';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import CoreMark from './CoreMark.svelte';
  import RuleBody from './RuleBody.svelte';

  /**
   * One rule within its section's page, written where it stands (Mike, November 21). Its
   * name is typed over to rename it, and a small control opens the rule alone.
   */
  let {
    item,
    inWorld,
    engineName,
    worldName,
    onSave,
    onSaveWorld,
    onOpen,
  }: {
    item: RuleNode;
    inWorld: boolean;
    engineName: string;
    worldName: string;
    onSave: (changes: { name: string; text: string }) => Promise<void>;
    onSaveWorld: (text: string) => Promise<void>;
    onOpen: () => void;
  } = $props();

  const rule = $derived(item.placed);
  // Seeded once from the file; the page then holds the writer's own copy.
  let name = $state((() => item.placed.element.name)());
  let text = $state((() => item.placed.element.flavor)());
  const own = new Saver(() => onSave({ name: name.trim() || item.placed.element.name, text }));
  const world = new Saver<string>((t) => onSaveWorld(t));
  onDestroy(() => {
    void own.flush();
    void world.flush();
  });
  const busy = $derived(own.status !== 'saved' ? own.status : world.status);
</script>

<section class="rule">
  <div class="head">
    <input class="name" type="text" bind:value={name} oninput={() => own.push(null)} onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} aria-label="Rule name" autocomplete="off" spellcheck="false" size={Math.max(4, name.length)} />
    {#if rule.origin === 'engine'}<CoreMark {engineName} />{/if}
    <button type="button" class="alone" title="Open this rule alone" aria-label="Open {rule.element.name} alone" onclick={onOpen}>
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 2.5 H2.5 V11.5 H11.5 V8.5 M8 2.5 H11.5 V6 M11.5 2.5 L6.5 7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    {#if busy !== 'saved'}<span class="status">{said(busy)}</span>{/if}
  </div>
  {#if own.problem || world.problem}<p class="problem" role="alert">{own.problem || world.problem}</p>{/if}
  <RuleBody
    {rule}
    worldPiece={item.worldPiece}
    {inWorld}
    {worldName}
    onText={(t) => {
      text = t;
      own.push(null);
    }}
    onWorld={(t) => world.push(t)} />
</section>

<style>
  .rule {
    margin: 0;
    padding: 18px 0 20px;
    border-top: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 2px;
  }
  .name {
    max-width: 100%;
    min-width: 0;
    margin-left: -5px;
    color: var(--title);
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(28px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.1;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--round);
    padding: 1px 4px;
    field-sizing: content;
  }
  .name:hover,
  .name:focus {
    border-color: var(--edge);
    outline: none;
  }
  .alone {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    padding: 0;
    color: var(--muted);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .alone:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .status {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
</style>
