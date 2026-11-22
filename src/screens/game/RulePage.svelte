<script lang="ts">
  import { retitle } from '../../lib/retitle';
  import { onDestroy } from 'svelte';
  import type { Placed } from '../../lib/game/game';
  import type { Frame } from '../../lib/index/frame';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import GameBanner, { type PictureChoice } from './GameBanner.svelte';
  import CoreMark from './CoreMark.svelte';
  import RuleBody from './RuleBody.svelte';

  /**
   * One rule of a game's book, opened alone (Cerys, November 9, and November 21). It is
   * the same writing as in its section's page: its title, its text, and, in a world's
   * book, what the world adds after a core rule. A core rule carries one small mark, and
   * its tags are kept in the page's menu.
   */
  let {
    titleId = '',
    rule,
    worldPiece,
    inWorld,
    place,
    engineName,
    worldName,
    picture,
    choices,
    onFrame,
    onSave,
    onSaveWorld,
  }: {
    /** The page's id, so Rename in its menu can put the cursor in the title. */
    titleId?: string;
    rule: Placed;
    worldPiece: Placed | null;
    /** Whether the book open is the world's, which shows what the world adds. */
    inWorld: boolean;
    place: string;
    engineName: string;
    worldName: string;
    picture: { url: string; frame: Frame | null } | null;
    choices: PictureChoice[];
    onFrame: (frame: Frame) => Promise<void>;
    onSave: (changes: { name: string; text: string; was: { name: string; text: string } }) => Promise<void>;
    onSaveWorld: (text: string) => Promise<void>;
  } = $props();

  // Seeded once from the files; the page then holds the writer's own copy.
  let name = $state((() => rule.element.name)());
  let text = $state((() => rule.element.flavor)());
  // What the name and the text were when this page last read or saved them, so a save
  // writes only what the writer changed here.
  let was = (() => ({ name: rule.element.name, text: rule.element.flavor }))();
  const own = new Saver(async () => {
    const now = { name: name.trim() || was.name, text };
    await onSave({ ...now, was });
    was = now;
  });
  // A name changed elsewhere shows here, unless the writer is partway through changing it.
  $effect(() => {
    const theirs = rule.element.name;
    if (theirs !== was.name && name === was.name) name = theirs;
    if (name === theirs) was = { ...was, name: theirs };
  });
  const world = new Saver<string>((t) => onSaveWorld(t));
  const busy = $derived(own.status !== 'saved' ? own.status : world.status);

  onDestroy(() => {
    void own.flush(true);
    void world.flush(true);
  });

  const rename = async (next: string) => {
    name = next;
    own.push(null);
    return null;
  };
</script>

<article class="rule">
  <GameBanner url={picture?.url ?? null} frame={picture?.frame ?? null} {place} {choices} {onFrame}>
    {#snippet title()}
      <input class="title" type="text" use:retitle={{ id: titleId, name, rename }} aria-label="Rule name" autocomplete="off" />
    {/snippet}
  </GameBanner>
  <div class="marks">
    {#if rule.origin === 'engine'}<CoreMark {engineName} />{/if}
    <span class="status">{said(busy)}</span>
  </div>
  {#if own.problem || world.problem}<p class="problem" role="alert">{own.problem || world.problem}</p>{/if}
  <RuleBody
    {rule}
    {worldPiece}
    {inWorld}
    {worldName}
    onText={(t) => {
      text = t;
      own.push(null);
    }}
    onWorld={(t) => world.push(t)} />
</article>

<style>
  /* The banner runs the pane's full width, and everything under it keeps a reading width. */
  article > :global(:not(.poster)) {
    max-width: var(--measure, 760px);
  }
  .title {
    display: block;
    width: 100%;
    margin: 4px 0 2px;
    box-sizing: border-box;
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
    margin-left: -5px;
  }
  .title:hover,
  .title:focus {
    border-color: var(--edge);
    outline: none;
  }
  .marks {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 2px 0 14px;
    min-height: 20px;
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
