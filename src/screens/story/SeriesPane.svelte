<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import { seriesSource } from '../../lib/story/outlineSource';
  import OutlineView from './OutlineView.svelte';
  import BoardTitle from '../boards/BoardTitle.svelte';
  import { renameSeries } from '../../lib/story/manage';
  import type { WikiIndex } from '../../lib/index/wiki';
  import { counted } from '../../lib/story/book';
  import { outside } from '../../lib/outside';

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
    index = null,
    onOpenEntry,
    books = null,
    words = null,
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
    /** The wiki, so names on the board are linked, and where a named entry opens. */
    index?: WikiIndex | null;
    onOpenEntry?: (id: string) => void;
    /** How many books the series holds, and their words, for the place line and the row. */
    books?: number | null;
    words?: number | null;
  } = $props();

  // What the books and their parts are called lives behind the pane's ⋯ (Mike, October 31).
  let menu = $state(false);
  let about = $state(false);

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

{#snippet lead()}
  {#if words !== null}<span class="meta">{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>{/if}
{/snippet}

{#snippet tail()}
  <div class="actions" use:outside={() => (menu = false)}>
    <button type="button" class="more" aria-label="More for {series}" aria-expanded={menu} onclick={() => (menu = !menu)}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
    </button>
    {#if menu}
      <div class="menu" role="dialog" aria-label="Names in {series}">
        <div class="label">Names</div>
        <label class="name">
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
        <label class="name">
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
        <button type="button" class="about-toggle" aria-expanded={about} onclick={() => (about = !about)}>About series boards</button>
        {#if about}<p class="about">Each book's beats on the series threads are kept in its title page file, under its title.</p>{/if}
      </div>
    {/if}
  </div>
{/snippet}

<article class="series">
  <header>
    <div class="label">Series{books !== null ? ` · ${counted(books, seriesWord || seriesWords[0] || 'Story')}` : ''}</div>
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
  </header>
  <!-- Rebuilt only for another series: the world reloading after a save is not a new board. -->
  {#key series}
    <OutlineView
      {fs}
      {source}
      unit="book"
      {index}
      {onOpenEntry}
      partWord={seriesWord || seriesWords[0] || 'Story'}
      {lead}
      {tail}
      onWrite={(card) => onOpenBook(card.path)}
      onAdded={() => onChanged()} />
  {/key}
</article>

<style>
  header {
    margin-bottom: 0;
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
  .meta {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .actions {
    position: relative;
  }
  .more {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
  }
  .more:hover,
  .more[aria-expanded='true'] {
    color: var(--text);
    border-color: var(--edge);
  }
  .menu {
    position: absolute;
    top: 36px;
    right: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 340px;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    box-shadow: 0 8px 24px var(--shadow);
    padding: 12px 14px;
  }
  .menu > .label {
    font-size: calc(11px * var(--type));
  }
  .name {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: calc(14px * var(--type));
  }
  .name .label {
    font-size: calc(11px * var(--type));
    white-space: nowrap;
  }
  .name input {
    width: 120px;
    font: inherit;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
  }
  .about-toggle {
    align-self: flex-start;
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: none;
    border: 0;
    padding: 4px 0 0;
  }
  .about {
    margin: 0;
    font-size: calc(13px * var(--type));
    line-height: 1.5;
    color: var(--muted);
  }
</style>
