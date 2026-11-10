<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import { getContext } from 'svelte';
  import { createEditor, refreshMentions, replaceDoc, type ScannerRef } from '../../lib/editor/editor';
  import type { MentionScanner } from '../../lib/index/scanner';
  import { reconcile } from '../../lib/editor/reconcile';
  import { quiet } from '../../lib/view.svelte';
  import { GAME_LINKS, type GameLinks } from './links';

  const NO_LINKS = { find: () => [] } as unknown as MentionScanner;

  /**
   * A piece of a game's book, written in the same editor as a chapter (Mike, November 9):
   * the markdown shows formatted as it is typed, Ctrl or Cmd I and U italicize and
   * underline, and the selection bar offers the rest. The page around it saves.
   */
  let {
    text,
    label,
    placeholder = '',
    self = '',
    onChange,
  }: {
    /** The text as the file has it. The editor starts from it and follows it when the file changes outside. */
    text: string;
    label: string;
    placeholder?: string;
    /** This page's own link, so it does not link to itself. */
    self?: string;
    onChange: (text: string) => void;
  } = $props();

  // The names this text links, and what a click on one opens, come from the Game module.
  const links = getContext<GameLinks | undefined>(GAME_LINKS);

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  // svelte-ignore state_referenced_locally
  let empty = $state(text.trim() === '');
  // svelte-ignore state_referenced_locally
  const scanner: ScannerRef = { current: links?.scanner ?? NO_LINKS, selfId: self };
  // What the editor last took from the file, and what it recently handed over to be saved.
  // svelte-ignore state_referenced_locally
  let seed = text;
  const sent: string[] = [];
  let clash = $state(false);

  onMount(() => {
    view = createEditor({
      parent: host,
      doc: seed,
      title: '',
      scanner,
      onChange: (doc) => {
        empty = doc.trim() === '';
        sent.push(doc);
        if (sent.length > 40) sent.shift();
        if (view?.hasFocus) quiet.typed();
        onChange(doc);
      },
      onMention: (id) => links?.open(id),
      toolbar: { narrator: false },
    });
    view.contentDOM.setAttribute('aria-label', label);
  });

  // New names in the world or the game redraw the links.
  $effect(() => {
    scanner.current = links?.scanner ?? NO_LINKS;
    if (view) refreshMentions(view);
  });

  // The file changed outside. With nothing typed here the new text shows. Typing in other
  // paragraphs is joined with it. Typing in the same lines stays, and the page says so.
  $effect(() => {
    const theirs = text;
    if (!view) return;
    const r = reconcile(seed, view.state.doc.toString(), theirs, sent);
    seed = r.seed;
    if (r.clash) clash = true;
    if (r.show !== null) replaceDoc(view, r.show);
  });

  onDestroy(() => view?.destroy());

  /** A click in the empty space below the text puts the cursor at its end. */
  function focusEnd(e: MouseEvent) {
    if (!view || (e.target as HTMLElement).closest('.cm-content')) return;
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  }
</script>

{#if clash}
  <p class="clash" role="status">
    This text changed in another program while you were typing in the same lines. Yours is kept here and will be saved.
    <button type="button" onclick={() => (clash = false)}>Got it</button>
  </p>
{/if}
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
  .clash {
    margin: 0 0 10px;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
  }
  .clash button {
    margin-left: 8px;
    font-size: inherit;
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
