<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Card, OutlineSource } from '../../lib/story/outlineSource';

  /**
   * Outline view (Mike, October 23 and 25): every chapter as a card, three to a row with
   * tall fields. The cards are the manuscript's chapters, so typing in a card writes that
   * chapter's outline, renaming a card renames the chapter, and adding a card adds one.
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
  let problem = $state('');
  let saving = $state(false);
  // Outline text waiting to be saved, by card. Titles save when the field is left.
  const pending = new Map<number, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let grid: HTMLDivElement | undefined = $state();

  async function load() {
    try {
      cards = await source.load();
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
      for (const [i, text] of edits) await source.setOutline(i, text);
    } catch (e) {
      problem = String(e);
      await load();
    } finally {
      saving = false;
    }
  }

  function typed(i: number, text: string) {
    pending.set(i, text);
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
      field?.scrollIntoView({ block: 'center' });
      field?.focus();
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
  <div class="grid" bind:this={grid}>
    {#each cards as card, i (card.path + ':' + i)}
      <section class="card">
        <div class="top">
          <span class="n">{String(i + 1).padStart(2, '0')}</span>
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
  .top {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--muted);
  }
  .n {
    color: var(--structure);
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
  .problem {
    color: #ff9a9a;
  }
</style>
