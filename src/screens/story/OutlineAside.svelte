<script lang="ts">
  import type { EditorView } from '@codemirror/view';
  import { chapterAt, chaptersIn, setOutlineInView } from '../../lib/story/outlineEdit';

  /**
   * The outline beside the writing (Mike, October 23 and 25): the outline of the chapter
   * the cursor is in, which follows the cursor from chapter to chapter and can be edited
   * right here.
   */
  let {
    view,
    cursor,
    wholeBook,
    onOpenOutline,
  }: {
    view: EditorView | null;
    cursor: number;
    /** True for a manuscript kept as one file, false for one chapter file of a folder. */
    wholeBook: boolean;
    onOpenOutline: (index: number) => void;
  } = $props();

  const SAVE_DELAY_MS = 500;

  // Recomputed when the cursor moves; the chapter list itself is cached per document.
  const here = $derived(view ? chapterAt(chaptersIn(view, wholeBook), cursor) : null);
  let text = $state('');
  let field: HTMLTextAreaElement | undefined = $state();
  let shownFor = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  // A new chapter under the cursor brings its outline, unless the writer is typing here.
  $effect(() => {
    const key = here ? `${here.index}:${here.chapter.title}` : '';
    if (key !== shownFor && document.activeElement !== field) {
      shownFor = key;
      text = here?.chapter.outline ?? '';
    }
  });

  function save() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!view || !here) return;
    // The heading may have moved since this chapter was shown, so it is found again.
    const now = chapterAt(chaptersIn(view, wholeBook), cursor);
    if (now && now.index === here.index) setOutlineInView(view, now.chapter.offset, text);
  }

  function typed() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  }
</script>

<aside class="outline-aside" aria-label="Outline of this chapter">
  {#if here}
    <div class="label">Outline · {here.chapter.title}</div>
    <textarea bind:this={field} bind:value={text} oninput={typed} onblur={save} placeholder="What happens in this chapter?"></textarea>
    <button type="button" class="all" onclick={() => onOpenOutline(here.index)}>All chapters</button>
  {:else}
    <div class="label">Outline</div>
    <p class="hint">Put the cursor in a chapter to see its outline here.</p>
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
</style>
