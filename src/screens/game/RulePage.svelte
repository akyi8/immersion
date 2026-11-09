<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Placed } from '../../lib/game/game';
  import type { Frame } from '../../lib/index/frame';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import GameBanner, { type PictureChoice } from './GameBanner.svelte';
  import GameText from './GameText.svelte';

  /**
   * One rule of a game's book (Mike, November 9), written like a chapter. Its title, its
   * tags, the core text that every game built on the engine prints, and, in a world's
   * book, the world's own text below it: its examples and anything only that world adds.
   * A rule of the world's own has the world's text alone.
   */
  let {
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
    rule: Placed;
    worldPiece: Placed | null;
    /** Whether the book open is the world's, which shows the world's text. */
    inWorld: boolean;
    place: string;
    engineName: string;
    worldName: string;
    picture: { url: string; frame: Frame | null } | null;
    choices: PictureChoice[];
    onFrame: (frame: Frame) => Promise<void>;
    onSave: (changes: { name: string; tags: string[]; text: string }) => Promise<void>;
    onSaveWorld: (text: string) => Promise<void>;
  } = $props();

  const core = $derived(rule.origin === 'engine');
  // Seeded once from the files; the page then holds the writer's own copy.
  let name = $state((() => rule.element.name)());
  let tags = $state((() => rule.element.tags.join(', '))());
  let text = $state((() => rule.element.flavor)());
  const own = new Saver(() => onSave({ name: name.trim() || rule.element.name, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), text }));
  const world = new Saver<string>((t) => onSaveWorld(t));

  onDestroy(() => {
    void own.flush();
    void world.flush();
  });
</script>

<article class="rule">
  <GameBanner url={picture?.url ?? null} frame={picture?.frame ?? null} {place} {choices} {onFrame}>
    {#snippet title()}
      <input class="title" type="text" bind:value={name} oninput={() => own.push(null)} aria-label="Rule name" autocomplete="off" />
    {/snippet}
  </GameBanner>
  <label class="tags">
    <span class="label">Tags</span>
    <input type="text" bind:value={tags} oninput={() => own.push(null)} autocomplete="off" />
  </label>
  {#if own.problem || world.problem}<p class="problem" role="alert">{own.problem || world.problem}</p>{/if}

  <section class="piece">
    <div class="head">
      <span class="label">{core ? engineName : worldName}</span>
      <span class="status">{said(own.status)}</span>
    </div>
    {#if core}<p class="hint">Every game built on {engineName} prints this.</p>{/if}
    <GameText
      text={rule.element.flavor}
      label="{core ? engineName : worldName} text"
      placeholder="The rule, as the book prints it."
      onChange={(t) => {
        text = t;
        own.push(null);
      }} />
  </section>
  {#if core && inWorld}
    <section class="piece world">
      <div class="head">
        <span class="label">{worldName}</span>
        <span class="status">{said(world.status)}</span>
      </div>
      <p class="hint">{worldName}'s examples and additions to this rule. Only {worldName}'s book prints this.</p>
      <GameText text={worldPiece?.element.flavor ?? ''} label="{worldName} text" placeholder="Examples and rules that are {worldName}'s alone." onChange={(t) => world.push(t)} />
    </section>
  {/if}
</article>

<style>
  /* The banner runs the pane's full width, and everything under it keeps a reading width. */
  article > :global(:not(.poster)) {
    max-width: 760px;
  }
  .title {
    display: block;
    width: 100%;
    margin: 4px 0 2px;
    box-sizing: border-box;
    color: var(--title);
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(44px * var(--type));
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
  .tags {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 22px;
  }
  .tags .label {
    font-size: calc(11px * var(--type));
    flex-shrink: 0;
  }
  .tags input {
    flex: 1;
    font: inherit;
    font-family: var(--font-label);
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--line);
    padding: 3px 2px;
  }
  .tags input:focus {
    outline: none;
    border-bottom-color: var(--structure);
  }
  .piece {
    border-top: 1px solid var(--line);
    padding-top: 12px;
    margin-top: 8px;
  }
  .piece.world {
    border-top: 2px solid var(--structure-deep, var(--line));
    margin-top: 20px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .head .label {
    font-size: calc(11px * var(--type));
  }
  .status {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .hint {
    margin: 2px 0 10px;
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
</style>
