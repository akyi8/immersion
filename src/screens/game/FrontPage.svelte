<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Frame } from '../../lib/index/frame';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import GameBanner, { type PictureChoice } from './GameBanner.svelte';
  import GameText from './GameText.svelte';

  /**
   * A front page (Mike, November 9): the book's own, or one division's, like a
   * manuscript's title page but simpler. A title, a picture, and some text, then what
   * the book or division holds, each a click away.
   */
  let {
    place,
    name,
    body,
    picture,
    choices,
    onFrame,
    onSave,
    contents,
  }: {
    place: string;
    name: string;
    body: string;
    picture: { url: string; frame: Frame | null } | null;
    choices: PictureChoice[];
    onFrame: (frame: Frame) => Promise<void>;
    onSave: (changes: { name: string; body: string }) => Promise<void>;
    contents: { label: string; note?: string; open: () => void }[];
  } = $props();

  let heading = $state((() => name)());
  let text = $state((() => body)());
  // svelte-ignore state_referenced_locally
  const saver = new Saver(() => onSave({ name: heading.trim() || name, body: text }));
  onDestroy(() => void saver.flush());
</script>

<article class="front">
  <GameBanner url={picture?.url ?? null} frame={picture?.frame ?? null} {place} {choices} {onFrame}>
    {#snippet title()}
      <input class="title" type="text" bind:value={heading} oninput={() => saver.push(null)} aria-label="Title" autocomplete="off" />
    {/snippet}
  </GameBanner>
  <div class="status-row"><span class="status">{said(saver.status)}</span></div>
  {#if saver.problem}<p class="problem" role="alert">{saver.problem}</p>{/if}
  <GameText
    text={body}
    label="Front page text"
    placeholder="What this part of the book is about."
    onChange={(t) => {
      text = t;
      saver.push(null);
    }} />
  {#if contents.length}
    <ol class="contents">
      {#each contents as c, i (i)}
        <li><button type="button" onclick={c.open}><span>{c.label}</span>{#if c.note}<span class="note">{c.note}</span>{/if}</button></li>
      {/each}
    </ol>
  {/if}
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
    font-size: calc(56px * var(--type));
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
    justify-content: flex-end;
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
  .contents {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  .contents button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    text-align: left;
    font-size: calc(17px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--line);
    padding: 10px 4px;
  }
  .contents button:hover {
    background: var(--surface);
  }
  .note {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
</style>
