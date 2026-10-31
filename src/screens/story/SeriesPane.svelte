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

  // What every book in the series calls its parts (Mike, October 31), such as Part for
  // short stories told in four movements.
  const WORDS = ['Chapter', 'Part', 'Section', 'Episode', 'Movement', 'Act'];
  // And what each book of the series is called, such as Episode (Mike, October 31).
  const BOOK_WORDS = ['Story', 'Book', 'Novel', 'Tale', 'Episode', 'Volume'];
  // Each field shows the word every book uses, or "Mixed" with the words in use when the
  // books disagree, and a word typed there is written to every book that differs.
  let partWords = $state<string[]>(['Chapter']);
  let seriesWords = $state<string[]>(['Story']);
  const partWord = $derived(partWords.length === 1 ? partWords[0] : '');
  const seriesWord = $derived(seriesWords.length === 1 ? seriesWords[0] : '');
  async function readWords() {
    partWords = (await source.partWords?.()) ?? ['Chapter'];
    seriesWords = (await source.seriesWords?.()) ?? ['Story'];
  }
  $effect(() => {
    void source;
    void readWords();
  });
  async function setSeriesWord(word: string) {
    const clean = word.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    await source.setSeriesWord?.(clean);
    await readWords();
    onChanged();
  }
  async function setPartWord(word: string) {
    const clean = word.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    await source.setPartWord?.(clean);
    await readWords();
    onChanged();
  }
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
    <label class="parts">
      <span class="label">Each one is called</span>
      <input
        type="text"
        list="book-words"
        value={seriesWord}
        placeholder={seriesWords.length > 1 ? `Mixed: ${seriesWords.join(', ')}` : 'Story'}
        autocomplete="off"
        onchange={(e) => setSeriesWord((e.currentTarget as HTMLInputElement).value)}
        onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
      <datalist id="book-words">{#each BOOK_WORDS as w}<option value={w}></option>{/each}</datalist>
    </label>
    <label class="parts">
      <span class="label">Its parts are called</span>
      <input
        type="text"
        list="part-words"
        value={partWord}
        placeholder={partWords.length > 1 ? `Mixed: ${partWords.join(', ')}` : 'Chapter'}
        autocomplete="off"
        onchange={(e) => setPartWord((e.currentTarget as HTMLInputElement).value)}
        onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
      <datalist id="part-words">{#each WORDS as w}<option value={w}></option>{/each}</datalist>
    </label>
  </header>
  <!-- Rebuilt only for another series: the world reloading after a save is not a new board. -->
  {#key series}
    <OutlineView
      {fs}
      {source}
      unit="book"
      partWord={seriesWord || seriesWords[0] || 'Story'}
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
  .parts {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin: 12px 24px 0 0;
  }
  .parts .label {
    font-size: calc(11px * var(--type));
  }
  .parts input {
    width: 150px;
    font: inherit;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
  }
  .about {
    margin: 0;
    font-size: calc(14px * var(--type));
    color: var(--muted);
  }
</style>
