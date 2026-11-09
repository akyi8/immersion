<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import { createEditor, type ScannerRef } from '../../lib/editor/editor';
  import type { MentionScanner } from '../../lib/index/scanner';

  /**
   * A piece of a game's book, written in the same editor as a chapter (Mike, November 9):
   * the markdown shows formatted as it is typed, Ctrl or Cmd I and U italicize and
   * underline, and the selection bar offers the rest. The page around it saves.
   */
  let {
    text,
    label,
    placeholder = '',
    onChange,
  }: {
    /** The starting text, read once. */
    text: string;
    label: string;
    placeholder?: string;
    onChange: (text: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  // svelte-ignore state_referenced_locally
  let empty = $state(text.trim() === '');
  // The game's text has no wiki links, so the scanner finds nothing.
  const scanner: ScannerRef = { current: { find: () => [] } as unknown as MentionScanner, selfId: '' };

  onMount(() => {
    view = createEditor({
      parent: host,
      // svelte-ignore state_referenced_locally
      doc: text,
      title: '',
      scanner,
      onChange: (doc) => {
        empty = doc.trim() === '';
        onChange(doc);
      },
      onMention: () => {},
      toolbar: { narrator: false },
    });
    view.contentDOM.setAttribute('aria-label', label);
  });

  onDestroy(() => view?.destroy());

  /** A click in the empty space below the text puts the cursor at its end. */
  function focusEnd(e: MouseEvent) {
    if (!view || (e.target as HTMLElement).closest('.cm-content')) return;
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="text" onclick={focusEnd}>
  {#if empty && placeholder}<p class="placeholder">{placeholder}</p>{/if}
  <div bind:this={host}></div>
</div>

<style>
  .text {
    position: relative;
    min-height: 140px;
    padding: 4px 0 24px;
    cursor: text;
  }
  .placeholder {
    position: absolute;
    top: 4px;
    left: 0;
    margin: 0;
    color: var(--muted);
    font-style: italic;
    pointer-events: none;
  }
</style>
