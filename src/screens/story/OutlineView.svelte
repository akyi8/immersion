<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Card, OutlineSource } from '../../lib/story/outlineSource';
  import type { Thread } from '../../lib/story/threads';

  /**
   * Outline view (Mike, October 23 and 25): every chapter as a card, three to a row with
   * tall fields. The cards are the manuscript's chapters, so typing in a card writes that
   * chapter's outline, renaming a card renames the chapter, and adding a card adds one.
   *
   * With more than one thread it becomes the plot grid (Mike, October 25): chapters run
   * along When and threads along Threads, each cell is one thread's beat in one chapter,
   * and Flip swaps which runs across and which runs down.
   */
  let {
    fs,
    source,
    focus = null,
    onWrite,
    onAdded,
  }: {
    fs: WorldFs;
    source: OutlineSource;
    /** The chapter to bring into view and put the cursor in. */
    focus?: number | null;
    /** Opens a chapter in the writing view. */
    onWrite: (card: Card) => void;
    onAdded: (at: { path: string; offset: number | null }) => void;
  } = $props();

  const SAVE_DELAY_MS = 800;

  let cards = $state<Card[] | null>(null);
  let threads = $state<Thread[]>([{ key: '', name: 'Main plot' }]);
  let problem = $state('');
  let saving = $state(false);
  // Beats waiting to be saved, by card and thread. Titles save when the field is left.
  const pending = new Map<string, { i: number; thread: string; text: string }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let grid: HTMLDivElement | undefined = $state();

  async function load() {
    try {
      cards = await source.load();
      threads = await source.threads();
      problem = '';
    } catch (e) {
      problem = String(e);
    }
  }

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const edits = [...pending];
    pending.clear();
    if (!edits.length) return;
    saving = true;
    try {
      for (const [, e] of edits) await source.setBeat(e.i, e.thread, e.text);
    } catch (e) {
      problem = String(e);
      await load();
    } finally {
      saving = false;
    }
  }

  function typed(i: number, text: string, thread = '') {
    pending.set(`${i}:${thread}`, { i, thread, text });
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  async function rename(i: number, title: string) {
    const trimmed = title.trim();
    if (!cards || !trimmed || trimmed === cards[i].title) return;
    await flush();
    try {
      await source.rename(i, trimmed);
      cards[i].title = trimmed;
    } catch (e) {
      problem = String(e);
      await load();
    }
  }

  /** Moves a chapter, with its outline and prose, to another place in the book. */
  async function move(from: number, to: number) {
    if (!cards || to < 0 || to >= cards.length || from === to) return;
    await flush();
    try {
      await source.move(from, to);
      await load();
    } catch (e) {
      problem = String(e);
      await load();
    }
  }

  // Dragging a card by its number moves the chapter to where it is dropped.
  let dragging = $state<number | null>(null);
  let over = $state<number | null>(null);

  async function add() {
    await flush();
    try {
      const at = await source.add();
      await load();
      onAdded(at);
      await tick();
      const fields = grid?.querySelectorAll<HTMLTextAreaElement>('.title');
      fields?.[fields.length - 1]?.select();
    } catch (e) {
      problem = String(e);
    }
  }

  // Threads (Mike, October 25).
  function savedFlip(): boolean {
    try {
      return localStorage.getItem('immersion.boardFlip') === 'down';
    } catch {
      return false;
    }
  }
  /** False: chapters run across and threads down. True: the other way round. */
  let flipped = $state(savedFlip());
  function flip() {
    flipped = !flipped;
    try {
      localStorage.setItem('immersion.boardFlip', flipped ? 'down' : 'across');
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  let naming = $state(false);
  let newThread = $state('');
  async function threadAction(run: () => Promise<void>) {
    await flush();
    try {
      await run();
      problem = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    await load();
  }
  async function addThread(event: SubmitEvent) {
    event.preventDefault();
    const name = newThread.trim();
    if (!name) return;
    await threadAction(() => source.addThread(name));
    newThread = '';
    naming = false;
  }
  let removing = $state<string | null>(null);

  /** Grows a field to fit its text, so a long outline never hides inside a scroll box. */
  function grow(el: HTMLTextAreaElement, least: number) {
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, least)}px`;
    };
    fit();
    el.addEventListener('input', fit);
    return { destroy: () => el.removeEventListener('input', fit) };
  }

  onMount(() => {
    load().then(async () => {
      if (focus === null) return;
      await tick();
      const field = grid?.querySelectorAll<HTMLTextAreaElement>('textarea.body')[focus];
      if (field) {
        field.scrollIntoView({ block: 'center' });
        field.focus();
      } else {
        // On the plot grid, the chapter's header comes into view.
        grid?.querySelectorAll<HTMLElement>('.chapter-head')[focus]?.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    });
    // Changes from elsewhere show up here, unless something typed here is waiting to save.
    const stop = fs.onChange(() => {
      if (!pending.size && !saving && !grid?.contains(document.activeElement)) load();
    });
    return () => {
      stop();
      void flush();
    };
  });
</script>

{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
{#if cards}
  <div class="toolbar">
    {#if naming}
      <form class="name-thread" onsubmit={addThread}>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={newThread} placeholder="Cerys's arc" aria-label="New thread's name" autofocus autocomplete="off" />
        <button type="submit" class="tool strong" disabled={!newThread.trim()}>Add thread</button>
        <button type="button" class="tool" onclick={() => ((naming = false), (newThread = ''))}>Cancel</button>
      </form>
    {:else}
      <button type="button" class="tool" onclick={() => (naming = true)} title="A plotline, a character's arc, or a timeline that runs alongside the chapters">+ Thread</button>
    {/if}
    {#if threads.length > 1}
      <button type="button" class="tool" onclick={flip} title="Swap which runs across and which runs down">Flip</button>
      <span class="axes">When runs {flipped ? 'down' : 'across'}, threads run {flipped ? 'across' : 'down'}</span>
    {/if}
  </div>
  {#if threads.length === 1}
  <div class="grid" bind:this={grid}>
    {#each cards as card, i (card.path + ':' + i)}
      <section
        class="card"
        role="group"
        aria-label="Chapter {i + 1}: {card.title}"
        class:over={over === i && dragging !== null && dragging !== i}
        ondragover={(e) => {
          if (dragging === null) return;
          e.preventDefault();
          over = i;
        }}
        ondragleave={() => (over = over === i ? null : over)}
        ondrop={(e) => {
          e.preventDefault();
          const from = dragging;
          dragging = over = null;
          if (from !== null) move(from, i);
        }}>
        <div class="top">
          <span
            class="n"
            draggable="true"
            title="Drag to move this chapter"
            role="button"
            tabindex="-1"
            ondragstart={(e) => {
              dragging = i;
              e.dataTransfer?.setData('text/plain', String(i));
            }}
            ondragend={() => (dragging = over = null)}>⋮⋮ {String(i + 1).padStart(2, '0')}</span>
          <span class="move">
            <button type="button" aria-label="Move {card.title} earlier" title="Move earlier" disabled={i === 0} onclick={() => move(i, i - 1)}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2 L4 6 L8 10" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
            </button>
            <button type="button" aria-label="Move {card.title} later" title="Move later" disabled={i === cards.length - 1} onclick={() => move(i, i + 1)}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
            </button>
          </span>
          <span class="words">{card.words ? `${card.words.toLocaleString()} words` : 'Not written yet'}</span>
        </div>
        <textarea
          class="title"
          rows="1"
          use:grow={0}
          value={card.title}
          aria-label="Chapter {i + 1} title"
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
            }
          }}
          onblur={(e) => rename(i, (e.currentTarget as HTMLTextAreaElement).value.replace(/\s+/g, ' '))}></textarea>
        <textarea
          class="body"
          use:grow={200}
          value={card.outline}
          placeholder="What happens in this chapter?"
          aria-label="Outline of {card.title}"
          oninput={(e) => typed(i, (e.currentTarget as HTMLTextAreaElement).value)}
          onblur={flush}></textarea>
        <button type="button" class="write" onclick={async () => (await flush(), onWrite(card))}>Write this chapter</button>
      </section>
    {/each}
    <button type="button" class="card add" onclick={add}>
      <span class="plus" aria-hidden="true">+</span>
      <span>Chapter</span>
    </button>
  </div>
  {:else}
    {@const W = cards.length}
    {@const at = (when: number, thread: number) => (flipped ? `grid-row: ${when + 2}; grid-column: ${thread + 2}` : `grid-row: ${thread + 2}; grid-column: ${when + 2}`)}
    <div
      class="grid board"
      class:flipped
      bind:this={grid}
      style:grid-template-columns={flipped ? `220px repeat(${threads.length}, 280px)` : `200px repeat(${W}, 260px) 130px`}>
      <div class="corner" style="grid-row: 1; grid-column: 1">{flipped ? 'When ↓  Threads →' : 'Threads ↓  When →'}</div>
      {#each threads as t, ti (t.key)}
        <div class="thread-head" style={flipped ? `grid-row: 1; grid-column: ${ti + 2}` : `grid-row: ${ti + 2}; grid-column: 1`}>
          <input
            class="thread-name"
            value={t.name}
            aria-label="Thread name"
            onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            onblur={(e) => {
              const name = (e.currentTarget as HTMLInputElement).value.trim();
              if (name && name !== t.name) threadAction(() => source.renameThread(t.key, name));
            }} />
          <div class="thread-tools">
            {#if ti > 0}
              <button type="button" aria-label="Move {t.name} {flipped ? 'left' : 'up'}" disabled={ti === 1} onclick={() => threadAction(() => source.moveThread(t.key, -1))}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M8 2 L4 6 L8 10' : 'M2 8 L6 4 L10 8'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
              </button>
              <button type="button" aria-label="Move {t.name} {flipped ? 'right' : 'down'}" disabled={ti === threads.length - 1} onclick={() => threadAction(() => source.moveThread(t.key, 1))}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M4 2 L8 6 L4 10' : 'M2 4 L6 8 L10 4'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
              </button>
              {#if removing === t.key}
                <span class="confirm">
                  Remove its beats?
                  <button type="button" class="yes" onclick={() => ((removing = null), threadAction(() => source.removeThread(t.key)))}>Remove</button>
                  <button type="button" onclick={() => (removing = null)}>Keep</button>
                </span>
              {:else}
                <button type="button" aria-label="Remove {t.name}" title="Remove this thread" onclick={() => (removing = t.key)}>
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
                </button>
              {/if}
            {:else}
              <span class="main-note">Main thread</span>
            {/if}
          </div>
        </div>
      {/each}
      {#each cards as card, i (card.path + ':' + i)}
        <div class="chapter-head" style={flipped ? `grid-row: ${i + 2}; grid-column: 1` : `grid-row: 1; grid-column: ${i + 2}`}>
          <div class="top">
            <span class="n">{String(i + 1).padStart(2, '0')}</span>
            <span class="move">
              <button type="button" aria-label="Move {card.title} earlier" title="Move earlier" disabled={i === 0} onclick={() => move(i, i - 1)}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M2 8 L6 4 L10 8' : 'M8 2 L4 6 L8 10'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
              </button>
              <button type="button" aria-label="Move {card.title} later" title="Move later" disabled={i === cards.length - 1} onclick={() => move(i, i + 1)}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M2 4 L6 8 L10 4' : 'M4 2 L8 6 L4 10'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
              </button>
            </span>
            <span class="words">{card.words ? `${card.words.toLocaleString()} words` : 'Not written yet'}</span>
          </div>
          <textarea
            class="title small"
            rows="1"
            use:grow={0}
            value={card.title}
            aria-label="Chapter {i + 1} title"
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.currentTarget as HTMLTextAreaElement).blur();
              }
            }}
            onblur={(e) => rename(i, (e.currentTarget as HTMLTextAreaElement).value.replace(/\s+/g, ' '))}></textarea>
          <button type="button" class="write" onclick={async () => (await flush(), onWrite(card))}>Write this chapter</button>
        </div>
        {#each threads as t, ti (t.key)}
          <div class="cell" style={at(i, ti)}>
            <textarea
              class="beat"
              use:grow={110}
              value={card.beats[t.key] ?? ''}
              placeholder="—"
              aria-label="{t.name} in {card.title}"
              oninput={(e) => typed(i, (e.currentTarget as HTMLTextAreaElement).value, t.key)}
              onblur={flush}></textarea>
          </div>
        {/each}
      {/each}
      <button type="button" class="add-when" style={flipped ? `grid-row: ${W + 2}; grid-column: 1` : `grid-row: 1; grid-column: ${W + 2}`} onclick={add}>+ Chapter</button>
    </div>
  {/if}
{/if}

<style>
  .grid {
    display: grid;
    /* Three to a row at most (Mike, October 23), fewer when the pane is narrow. */
    grid-template-columns: repeat(auto-fill, minmax(max(250px, calc((100% - 36px) / 3)), 1fr));
    gap: 18px;
    align-items: start;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--rule);
    padding: 14px 16px 12px;
    min-height: 320px;
    box-sizing: border-box;
  }
  .card:focus-within {
    border-color: var(--structure);
  }
  .card.over {
    border-color: var(--structure);
    box-shadow: inset 3px 0 0 var(--structure);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--muted);
  }
  .n {
    color: var(--structure);
    cursor: grab;
    user-select: none;
  }
  .move {
    display: flex;
    gap: 2px;
    margin-right: auto;
  }
  .move button {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    padding: 0;
  }
  .move button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--rule-strong);
  }
  .move button:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .title {
    font-family: var(--font-display);
    font-size: 30px;
    letter-spacing: 0.02em;
    line-height: 1.1;
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 2px 0;
    width: 100%;
    resize: none;
    overflow: hidden;
  }
  .title:focus {
    outline: none;
    border-bottom-color: var(--structure);
  }
  .body {
    flex: 1;
    min-height: 200px;
    resize: none;
    overflow: hidden;
    font: inherit;
    font-size: 15px;
    line-height: 1.55;
    color: var(--text);
    background: none;
    border: 0;
    padding: 4px 0;
  }
  .body:focus {
    outline: none;
  }
  .body::placeholder {
    color: var(--muted);
  }
  .write {
    align-self: flex-start;
    font-size: 13px;
    color: var(--structure);
    background: none;
    border: 0;
    padding: 6px 0;
  }
  .write:hover {
    color: var(--text);
  }
  .add {
    align-items: center;
    justify-content: center;
    background: none;
    border-style: dashed;
    color: var(--text);
    font-family: var(--font-display);
    font-size: 30px;
    letter-spacing: 0.02em;
  }
  .add:hover {
    border-style: solid;
    border-color: var(--structure);
  }
  .plus {
    font-size: 56px;
    line-height: 1;
    color: var(--accent);
  }
  .toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-bottom: 14px;
  }
  .tool {
    font-size: 13px;
    color: var(--structure);
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tool:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--structure);
  }
  .tool.strong {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 700;
  }
  .tool:disabled {
    opacity: 0.5;
  }
  .name-thread {
    display: flex;
    gap: 8px;
  }
  .name-thread input {
    font: inherit;
    font-size: 14px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--rule-strong);
    padding: 6px 10px;
    width: 220px;
  }
  .axes {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--muted);
  }
  /* The plot grid. Its headers stay in view while the cells scroll under them. */
  .board {
    display: grid;
    gap: 0;
    overflow: auto;
    max-height: 78vh;
    border: 1px solid var(--rule);
    align-items: stretch;
  }
  .board > * {
    border-right: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule);
    box-sizing: border-box;
  }
  .corner,
  .chapter-head,
  .thread-head {
    background: var(--surface);
  }
  .corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 3;
    display: flex;
    align-items: flex-end;
    padding: 10px 12px;
    font-family: var(--font-label);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: pre;
  }
  .chapter-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .board.flipped .chapter-head {
    top: auto;
    left: 0;
  }
  .thread-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    position: sticky;
    left: 0;
    z-index: 2;
  }
  .board.flipped .thread-head {
    left: auto;
    top: 0;
  }
  .thread-name {
    font: inherit;
    font-weight: 700;
    font-size: 15px;
    color: var(--title);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 2px 0;
    width: 100%;
  }
  .thread-name:focus {
    outline: none;
    border-bottom-color: var(--structure);
  }
  .thread-tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
  }
  .thread-tools button {
    min-width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    padding: 0 4px;
    font-size: 12px;
  }
  .thread-tools button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--rule-strong);
  }
  .thread-tools button:disabled {
    opacity: 0.25;
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--danger);
  }
  .thread-tools .yes {
    color: var(--danger);
  }
  .main-note {
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--muted);
  }
  .title.small {
    font-size: 22px;
  }
  .cell {
    background: var(--bg);
    padding: 8px 12px;
  }
  .cell:focus-within {
    box-shadow: inset 0 0 0 1px var(--structure);
  }
  .beat {
    width: 100%;
    min-height: 110px;
    resize: none;
    overflow: hidden;
    font: inherit;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
  }
  .beat:focus {
    outline: none;
  }
  .beat::placeholder {
    color: var(--rule-strong);
  }
  .add-when {
    font-family: var(--font-display);
    font-size: 22px;
    color: var(--text);
    background: none;
    border-style: dashed !important;
    padding: 10px;
  }
  .add-when:hover {
    color: var(--title);
  }
  .problem {
    color: var(--danger);
  }
</style>
