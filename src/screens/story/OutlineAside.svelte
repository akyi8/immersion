<script lang="ts">
  import type { EditorView } from '@codemirror/view';
  import { chapterAt, chaptersIn, setBeatInView } from '../../lib/story/outlineEdit';
  import type { Thread } from '../../lib/story/threads';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import Portrait from '../world/Portrait.svelte';

  /**
   * The outline beside the writing (Mike, October 23 and 25): the outline of the chapter
   * the cursor is in, which follows the cursor from chapter to chapter and can be edited
   * right here. Below it are the faces of everyone and everything the chapter names
   * (Mike, October 25), and clicking one opens its entry beside the writing.
   */
  let {
    view,
    cursor,
    wholeBook,
    onOpenOutline,
    index,
    fs,
    onOpen,
    threads = [{ key: '', name: 'Main plot' }],
  }: {
    view: EditorView | null;
    cursor: number;
    /** True for a manuscript kept as one file, false for one chapter file of a folder. */
    wholeBook: boolean;
    onOpenOutline: (index: number) => void;
    index: WikiIndex;
    fs: WorldFs;
    /** Opens a wiki entry beside the writing. */
    onOpen: (id: string) => void;
    /** The manuscript's threads; the chapter shows one beat for each. */
    threads?: Thread[];
  } = $props();

  // The names in the chapter under the cursor. Typing moves the cursor too, so this
  // follows the writing; it waits for a pause so it never slows typing down.
  let named = $state<string[]>([]);
  let scan: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const v = view;
    const at = here;
    void cursor;
    if (scan) clearTimeout(scan);
    scan = setTimeout(() => {
      if (!v) return;
      const chapters = chaptersIn(v, wholeBook);
      const from = at ? at.chapter.offset : 0;
      const to = at ? (chapters[at.index + 1]?.offset ?? v.state.doc.length) : v.state.doc.length;
      named = index.scanner.idsIn(v.state.doc.sliceString(from, to));
    }, 400);
  });

  const SAVE_DELAY_MS = 500;

  // Recomputed when the cursor moves; the chapter list itself is cached per document.
  const here = $derived(view ? chapterAt(chaptersIn(view, wholeBook), cursor) : null);
  // Each thread's beat in the chapter under the cursor, by thread key.
  let texts = $state<Record<string, string>>({});
  let panel: HTMLElement | undefined = $state();
  let shownFor = '';
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  // A new chapter under the cursor brings its beats, unless the writer is typing here.
  $effect(() => {
    // The beats are part of the key, so text that arrives after the panel first showed still appears.
    const key = here ? `${here.index}:${here.chapter.title}:${threads.map((t) => t.key).join('|')}:${JSON.stringify(here.chapter.beats)}` : '';
    if (key !== shownFor && !panel?.contains(document.activeElement)) {
      shownFor = key;
      texts = Object.fromEntries(threads.map((t) => [t.key, here?.chapter.beats.find((b) => b.thread === t.key)?.text ?? '']));
    }
  });

  function save() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!view || !here) return;
    for (const key of pending) {
      // The heading may have moved since this chapter was shown, so it is found again.
      const now = chapterAt(chaptersIn(view, wholeBook), cursor);
      if (now && now.index === here.index) setBeatInView(view, now.chapter.offset, key, texts[key] ?? '');
    }
    pending.clear();
  }

  function typed(key: string) {
    pending.add(key);
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  }
</script>

<aside class="outline-aside" aria-label="This chapter's beats" bind:this={panel}>
  {#if here}
    {#if threads.length === 1}
      <div class="label">Beats · {here.chapter.title}</div>
      <textarea bind:value={texts['']} oninput={() => typed('')} onblur={save} placeholder="What happens in this chapter?"></textarea>
    {:else}
      <div class="label">{here.chapter.title}</div>
      {#each threads as t (t.key)}
        <label class="thread" for="beat-{t.key || 'main'}">{t.name}</label>
        <textarea
          id="beat-{t.key || 'main'}"
          class="beat"
          bind:value={texts[t.key]}
          oninput={() => typed(t.key)}
          onblur={save}
          placeholder="What happens on this thread?"></textarea>
      {/each}
    {/if}
    <button type="button" class="all" onclick={() => onOpenOutline(here.index)}>The board</button>
  {:else}
    <div class="label">Beats</div>
    <p class="hint">Put the cursor in a chapter to see its beats here.</p>
  {/if}
  {#if named.length}
    <div class="label named-label">In this chapter</div>
    <div class="faces">
      {#each named as id (id)}
        {@const e = index.get(id)}
        {#if e}
          <button type="button" class="face" title="Open {e.name}" onclick={() => onOpen(id)}>
            <Portrait url={e.imagePath ? fs.imageUrl(e.imagePath) : null} name={e.name} size="face" />
            <span>{e.name}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</aside>

<style>
  .outline-aside {
    position: sticky;
    top: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0 12px 16px;
    border-left: 1px solid var(--rule);
  }
  .label {
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thread {
    margin-top: 6px;
    font-family: var(--font-label);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  textarea.beat {
    min-height: 90px;
  }
  textarea {
    min-height: 260px;
    max-height: 60vh;
    resize: vertical;
    font: inherit;
    font-size: 14px;
    line-height: 1.55;
    color: var(--text-soft);
    background: none;
    border: 0;
    padding: 0;
  }
  textarea:focus {
    outline: none;
    color: var(--text);
  }
  textarea::placeholder {
    color: var(--muted);
  }
  .all {
    align-self: flex-start;
    font-size: 12px;
    color: var(--structure);
    background: none;
    border: 0;
    padding: 4px 0;
  }
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .named-label {
    margin-top: 18px;
  }
  .faces {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .face {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    color: var(--text-soft);
    background: none;
    border: 0;
    padding: 0;
    font-size: 10px;
    line-height: 1.2;
  }
  .face:hover {
    color: var(--name);
  }
  .face :global(.portrait span) {
    font-size: 15px;
  }
</style>
