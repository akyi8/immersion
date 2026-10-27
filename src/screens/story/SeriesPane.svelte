<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import { seriesSource } from '../../lib/story/outlineSource';
  import OutlineView from './OutlineView.svelte';
  import BoardTitle from '../boards/BoardTitle.svelte';
  import { renameSeries } from '../../lib/story/manage';

  /**
   * A series board (Mike, October 25): the books of one series along When, in the order
   * their title pages number them, with threads that run across the whole series.
   */
  let {
    fs,
    root,
    series,
    onOpenBook,
    onChanged,
    onRenamed,
  }: {
    fs: WorldFs;
    /** The stories folder. */
    root: string;
    series: string;
    /** Opens a book at its title page. */
    onOpenBook: (bookMd: string) => void;
    /** Called after a book is added, so the shelf, desk, and drawer show it. */
    onChanged: () => void;
    /** Called after the series is renamed, with its new name. */
    onRenamed?: (name: string) => void;
  } = $props();

  const source = $derived(seriesSource(fs, root, series));
</script>

<article class="series">
  <header>
    <div class="label">Series</div>
    {#if onRenamed}
      <BoardTitle
        name={series}
        label="Series name"
        onRename={async (name) => {
          await renameSeries(fs, root, series, name);
          onRenamed(name);
        }} />
    {:else}
      <h1>{series}</h1>
    {/if}
    <p class="about">Each book's beats on the series threads are kept in its title page file, under its title.</p>
  </header>
  <!-- Rebuilt only for another series: the world reloading after a save is not a new board. -->
  {#key series}
    <OutlineView
      {fs}
      {source}
      unit="book"
      onWrite={(card) => onOpenBook(card.path)}
      onAdded={() => onChanged()} />
  {/key}
</article>

<style>
  header {
    margin-bottom: 22px;
  }
  h1 {
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(60px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
    color: var(--title);
  }
  .about {
    margin: 0;
    font-size: calc(14px * var(--type));
    color: var(--muted);
  }
</style>
