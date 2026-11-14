<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import { chaptersOf, drawPage, openBook, rememberPage, rememberedPage, type Book, type Chapter } from '../../lib/table/pdf';

  /**
   * A rulebook, shown a page at a time beside the session (Mike, November 14). It opens
   * on the page it was left on. The arrow keys and Page Up and Page Down turn pages while
   * the book has the keyboard.
   */
  let { fs, path, name }: { fs: WorldFs; path: string; name: string } = $props();

  let book = $state.raw<Book | null>(null);
  let chapters = $state.raw<Chapter[]>([]);
  let pages = $state(0);
  // svelte-ignore state_referenced_locally
  let page = $state(rememberedPage(path));
  let problem = $state('');
  let busy = $state(true);
  let canvas = $state<HTMLCanvasElement>();
  let frame = $state<HTMLDivElement>();
  let width = $state(0);
  let drawing: { cancel: () => void } | null = null;

  $effect(() => {
    const url = fs.imageUrl(path);
    let gone = false;
    busy = true;
    problem = '';
    void openBook(url).then(
      async (b) => {
        if (gone) return void b.destroy();
        book = b;
        pages = b.numPages;
        page = Math.min(Math.max(1, page), pages);
        chapters = await chaptersOf(b);
      },
      (e) => {
        problem = e instanceof Error ? e.message : String(e);
        busy = false;
      },
    );
    return () => {
      gone = true;
    };
  });

  $effect(() => {
    if (!frame) return;
    const watch = new ResizeObserver(() => (width = Math.floor(frame!.clientWidth)));
    watch.observe(frame);
    return () => watch.disconnect();
  });

  $effect(() => {
    const b = book;
    const n = page;
    const w = width;
    if (!b || !canvas || w < 40) return;
    drawing?.cancel();
    busy = true;
    let stale = false;
    void drawPage(b, n, canvas, w).then(
      (d) => {
        if (stale) return d.cancel();
        drawing = d;
        void d.done.then(
          () => !stale && (busy = false),
          (e) => !stale && ((problem = e instanceof Error ? e.message : String(e)), (busy = false)),
        );
      },
      (e) => !stale && ((problem = e instanceof Error ? e.message : String(e)), (busy = false)),
    );
    rememberPage(path, n);
    return () => {
      stale = true;
    };
  });

  onDestroy(() => {
    drawing?.cancel();
    void book?.destroy();
  });

  function go(to: number) {
    if (!pages) return;
    page = Math.min(pages, Math.max(1, Math.round(to) || 1));
    frame?.closest('.body')?.scrollTo({ top: 0 });
  }

  function keys(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(page + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1);
    else if (e.key === 'Home') go(1);
    else if (e.key === 'End') go(pages);
    else return;
    e.preventDefault();
  }

  /** The chapter the open page falls in, for the contents list. */
  const here = $derived(chapters.reduce((last, c, i) => (c.page <= page ? i : last), -1));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<article class="book" tabindex="0" aria-label={name} onkeydown={keys}>
  <div class="label kind">Rulebook</div>
  <h1>{name}</h1>
  <div class="bar">
    <button type="button" aria-label="The page before" disabled={page <= 1} onclick={() => go(page - 1)}>‹</button>
    <label>Page <input type="number" min="1" max={pages || 1} value={page} onchange={(e) => go(Number(e.currentTarget.value))} /> of {pages || '…'}</label>
    <button type="button" aria-label="The next page" disabled={!pages || page >= pages} onclick={() => go(page + 1)}>›</button>
    {#if chapters.length}
      <select aria-label="Contents" value={here} onchange={(e) => go(chapters[Number(e.currentTarget.value)]?.page ?? page)}>
        {#if here < 0}<option value={-1}>Contents</option>{/if}
        {#each chapters as c, i (i)}<option value={i}>{' '.repeat(c.depth)}{c.title}</option>{/each}
      </select>
    {/if}
  </div>
  {#if problem}<p class="problem" role="alert">This book could not be shown. {problem}</p>{/if}
  <div class="frame" bind:this={frame} class:busy>
    <canvas bind:this={canvas}></canvas>
  </div>
  {#if pages}
    <div class="bar foot">
      <button type="button" disabled={page <= 1} onclick={() => go(page - 1)}>‹ Page {page - 1 || ''}</button>
      <button type="button" disabled={page >= pages} onclick={() => go(page + 1)}>Page {page < pages ? page + 1 : ''} ›</button>
    </div>
  {/if}
</article>

<style>
  .book {
    display: flex;
    flex-direction: column;
    gap: 8px;
    outline: none;
  }
  .kind {
    color: var(--structure);
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(30px * var(--type));
    line-height: 1.1;
    color: var(--title);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .bar.foot {
    justify-content: space-between;
  }
  .bar label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  button,
  select,
  input {
    font: inherit;
    color: var(--text-soft);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 4px 10px;
    min-width: 0;
  }
  input {
    width: 64px;
    color: var(--text);
    background: var(--field);
  }
  select {
    flex: 1 1 160px;
    max-width: 100%;
    color: var(--text);
    background: var(--field);
  }
  button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  button:disabled {
    opacity: 0.45;
  }
  .frame {
    margin-top: 4px;
    min-height: 200px;
    transition: opacity 150ms;
  }
  .frame.busy {
    opacity: 0.6;
  }
  canvas {
    display: block;
    width: 100%;
    height: auto;
    background: #fff;
    border-radius: 4px;
  }
  .problem {
    margin: 0;
    color: var(--danger, var(--accent));
  }
</style>
