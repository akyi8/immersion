<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import { titleFocus } from '../../lib/table/tray.svelte';
  import { chaptersOf, drawPage, openBook, rememberPage, rememberedPage, shapeOf, type Book, type Chapter } from '../../lib/table/pdf';

  /**
   * A rulebook beside the session (Cerys, November 14). In a pane it shows one page, sized
   * so the whole page and its controls stay on screen. In full screen it shows two pages
   * side by side as an open book, with the book's contents list always open beside them.
   * It opens on the page it was left on. The arrow keys and Page Up and Page Down turn
   * pages while the book has the keyboard.
   */
  let {
    fs,
    path,
    name,
    full = false,
    kind = 'Rulebook',
    onRename = null,
  }: {
    fs: WorldFs;
    path: string;
    name: string;
    full?: boolean;
    /** What the page calls itself: a rulebook, or a handout. */
    kind?: string;
    /** Gives the book a new name, which renames its file. Returns a problem to show, or null. Without it the name only shows. */
    onRename?: ((name: string) => Promise<string | null>) | null;
  } = $props();

  let book = $state.raw<Book | null>(null);
  let chapters = $state.raw<Chapter[]>([]);
  let pages = $state(0);
  // svelte-ignore state_referenced_locally
  let page = $state(rememberedPage(path));
  let shape = $state(0.7);
  let problem = $state('');
  let busy = $state(true);
  let left = $state<HTMLCanvasElement>();
  let right = $state<HTMLCanvasElement>();
  let frame = $state<HTMLDivElement>();
  let room = $state({ width: 0, height: 0 });
  let whole = $state(true);
  const drawings: { cancel: () => void }[] = [];

  // Two pages show in full screen, as an open book: the cover alone, then each even page
  // with the odd page that faces it.
  const spread = $derived(full);
  const first = $derived(spread && page > 1 ? page - (page % 2) : page);
  const second = $derived(spread && first > 1 && first + 1 <= pages ? first + 1 : 0);

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
        shape = await shapeOf(b, Math.min(2, pages));
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

  // The room the pages have: the frame's width, and the height from the frame's top to
  // the bottom of the window, so a whole page fits without scrolling.
  function measure() {
    if (!frame) return;
    const box = frame.getBoundingClientRect();
    const scroller = frame.closest<HTMLElement>('.body');
    const top = box.top + (scroller?.scrollTop ?? 0);
    room = { width: Math.floor(box.width), height: Math.floor(window.innerHeight - top - 28) };
  }
  $effect(() => {
    if (!frame) return;
    void full;
    const watch = new ResizeObserver(measure);
    watch.observe(frame);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

  // In full screen the book takes the keyboard, so the arrow keys turn its pages at once.
  let article = $state<HTMLElement>();
  $effect(() => {
    if (full) article?.focus({ preventScroll: true });
  });

  /** How wide one page is drawn. */
  const pageWidth = $derived.by(() => {
    const across = spread && second ? (room.width - 12) / 2 : room.width;
    const fit = whole || spread ? Math.min(across, room.height * shape) : across;
    return Math.max(120, Math.floor(fit));
  });

  $effect(() => {
    const b = book;
    const w = pageWidth;
    const jobs: [number, HTMLCanvasElement | undefined][] = [
      [first, left],
      [second, right],
    ];
    if (!b || !left || room.width < 40) return;
    for (const d of drawings.splice(0)) d.cancel();
    busy = true;
    let stale = false;
    const fail = (e: unknown) => {
      if (stale) return;
      problem = e instanceof Error ? e.message : String(e);
      busy = false;
    };
    void Promise.all(
      jobs
        .filter((j): j is [number, HTMLCanvasElement] => j[0] > 0 && !!j[1])
        .map(async ([n, canvas]) => {
          const d = await drawPage(b, n, canvas, w);
          if (stale) return d.cancel();
          drawings.push(d);
          await d.done;
        }),
    ).then(() => !stale && (busy = false), fail);
    rememberPage(path, page);
    return () => {
      stale = true;
    };
  });

  onDestroy(() => {
    for (const d of drawings) d.cancel();
    void book?.destroy();
  });

  function go(to: number) {
    if (!pages) return;
    page = Math.min(pages, Math.max(1, Math.round(to) || 1));
    frame?.closest('.body')?.scrollTo({ top: 0 });
  }
  const step = $derived(spread && first > 1 ? 2 : 1);
  const back = () => go(first - (spread && first > 2 ? 2 : 1));
  const on = () => go(first + step);

  // The wheel turns pages while a whole page is on screen, where there is nothing to scroll
  // (Cerys, November 14). One turn of the wheel is one turn of the page.
  let wheeled = 0;
  let travel = 0;
  function wheel(e: WheelEvent) {
    if (!(full || whole) || e.ctrlKey || (e.target as HTMLElement).closest('.contents')) return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheeled > 400) travel = 0;
    travel += e.deltaY;
    if (Math.abs(travel) < 40 || now - wheeled < 220) return;
    wheeled = now;
    if (travel > 0) on();
    else back();
    travel = 0;
  }
  $effect(() => {
    // Registered by hand, because a wheel listener must say it may stop the scroll.
    const el = frame;
    if (!el) return;
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  async function rename(e: Event & { currentTarget: HTMLInputElement }) {
    const next = e.currentTarget.value.trim();
    if (!next || next === name) return void (e.currentTarget.value = name);
    problem = (await onRename?.(next)) ?? '';
    if (problem) e.currentTarget.value = name;
  }

  function keys(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') on();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') back();
    else if (e.key === 'Home') go(1);
    else if (e.key === 'End') go(pages);
    else return;
    e.preventDefault();
  }

  /** The chapter the open page falls in, for the contents list. */
  const here = $derived(chapters.reduce((last, c, i) => (c.page <= (second || first) ? i : last), -1));
  const atEnd = $derived(!pages || (second || first) >= pages);

  // Rename in a menu puts the cursor here.
  let titleInput = $state<HTMLInputElement>();
  $effect(() => titleFocus.serve(path, titleInput));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<article class="book" class:full bind:this={article} tabindex="0" aria-label={name} onkeydown={keys}>
  {#if full && chapters.length}
    <nav class="contents" aria-label="Contents">
      <div class="label">Contents</div>
      {#each chapters as c, i (i)}
        <button type="button" class:on={i === here} style:padding-left="{10 + c.depth * 14}px" onclick={() => go(c.page)}>
          <span>{c.title}</span><span class="n">{c.page}</span>
        </button>
      {/each}
    </nav>
  {/if}
  <div class="reading">
    <div class="head" class:away={!kind}>
      <div class="label kind">{kind}</div>
      <input class="name" bind:this={titleInput} aria-label="The name" title={onRename ? 'Type a new name to rename it' : name} readonly={!onRename} value={name} onchange={rename} onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </div>
    <div class="bar">
      <button type="button" aria-label="The page before" disabled={first <= 1} onclick={back}>‹</button>
      <label>Page <input type="number" min="1" max={pages || 1} value={page} onchange={(e) => go(Number(e.currentTarget.value))} /> of {pages || '…'}</label>
      <button type="button" aria-label="The next page" disabled={atEnd} onclick={on}>›</button>
      {#if !full}
        <button type="button" aria-pressed={!whole} title="Fill the pane's width, and scroll down the page" onclick={() => ((whole = !whole), measure())}>{whole ? 'Larger' : 'Whole page'}</button>
        {#if chapters.length > 1}
          <select aria-label="Contents" value={here} onchange={(e) => go(chapters[Number(e.currentTarget.value)]?.page ?? page)}>
            {#if here < 0}<option value={-1}>Contents</option>{/if}
            {#each chapters as c, i (i)}<option value={i}>{' '.repeat(c.depth)}{c.title}</option>{/each}
          </select>
        {/if}
      {/if}
    </div>
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <div class="frame" bind:this={frame} class:busy>
      <canvas bind:this={left}></canvas>
      <canvas bind:this={right} class:away={!second}></canvas>
    </div>
  </div>
</article>

<style>
  .book {
    outline: none;
  }
  /* Full screen is for reading the book, so the page gives its margins to the pages. */
  :global(.pane.alone .body:has(> .book)),
  :global(.pane.alone .body:has(.book.full)) {
    padding: 30px 30px 20px;
  }
  .book.full {
    display: grid;
    grid-template-columns: minmax(180px, 280px) minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }
  .reading {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kind {
    color: var(--structure);
  }
  input.name {
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-display);
    font-size: calc(30px * var(--type));
    line-height: 1.1;
    color: var(--title);
  }
  input.name:focus-visible {
    outline: 1px solid var(--edge);
    outline-offset: 4px;
  }
  .full .head {
    display: flex;
    align-items: baseline;
    gap: 14px;
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
    /* A button has a shape of its own, so it reads as one where the layout draws no lines. */
    background: var(--well);
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
    min-height: 160px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 12px;
    transition: opacity 150ms;
  }
  .frame.busy {
    opacity: 0.6;
  }
  canvas.away,
  .head.away {
    display: none;
  }
  canvas {
    display: block;
    flex-shrink: 0;
    height: auto;
    background: #fff;
    border-radius: 4px;
  }
  .contents {
    position: sticky;
    top: 0;
    max-height: calc(100vh - 14vh);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .contents .label {
    margin-bottom: 6px;
    color: var(--structure);
  }
  .contents button {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
    border: 0;
    font-family: var(--font-ui, inherit);
    font-size: calc(14px * var(--type));
    padding-block: 5px;
    color: var(--text-soft);
  }
  .contents button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .contents .n {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .problem {
    margin: 0;
    color: var(--danger, var(--accent));
  }
</style>
