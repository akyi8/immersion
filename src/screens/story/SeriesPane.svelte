<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import { seriesSource } from '../../lib/story/outlineSource';
  import OutlineView from './OutlineView.svelte';

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
  }: {
    fs: WorldFs;
    /** The stories folder. */
    root: string;
    series: string;
    /** Opens a book at its title page. */
    onOpenBook: (bookMd: string) => void;
    /** Called after a book is added, so the shelf, desk, and drawer show it. */
    onChanged: () => void;
  } = $props();

  const source = $derived(seriesSource(fs, root, series));
</script>

<article class="series">
  <header>
    <div class="label">Series</div>
    <h1>{series}</h1>
    <p class="about">Each book's beats on the series threads are kept in its title page file, under its title.</p>
  </header>
  {#key source}
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
    font-size: 60px;
    letter-spacing: 0.02em;
    line-height: 1;
    color: var(--title);
  }
  .about {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }
</style>
