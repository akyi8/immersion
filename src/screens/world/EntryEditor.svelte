<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { createEditor, headingNear, jumpTo, refreshMentions, replaceDoc, type ScannerRef } from '../../lib/editor/editor';
  import { registerSaver } from '../../lib/saves';

  let {
    fs,
    index,
    id,
    title,
    autofocus = false,
    onOpen,
    next,
    jump = null,
    onCursor,
    onOutline,
    narratorTool = false,
    onMakeEntry,
    onReady,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    id: string;
    title: string;
    autofocus?: boolean;
    onOpen: (id: string) => void;
    next: string | null;
    /** A place in the file to move the cursor to, such as a chapter's heading. */
    jump?: { offset: number; at: number; title?: string } | null;
    onCursor?: (pos: number) => void;
    onOutline?: (at: number) => void;
    /** Offer "Narrator only" on selected text, which only means something in the wiki. */
    narratorTool?: boolean;
    onMakeEntry?: (name: string) => void;
    /** Hands over the editor once it exists, for panels that work through it. */
    onReady?: (view: EditorView) => void;
  } = $props();

  // Saving happens on its own, a moment after typing stops (design: Milestone 2).
  const SAVE_DELAY_MS = 800;

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  // svelte-ignore state_referenced_locally
  const scanner: ScannerRef = { current: index.scanner, selfId: id };
  let lastSaved = '';
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let status = $state<'loading' | 'saved' | 'saving' | 'error'>('loading');
  let problem = $state('');
  let conflict = $state<string | null>(null);
  let ready = $state(false);

  async function save() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending === null || pending === lastSaved) {
      pending = null;
      return;
    }
    const text = pending;
    pending = null;
    status = 'saving';
    try {
      await fs.writeText(id, text);
      lastSaved = text;
      status = 'saved';
    } catch (e) {
      status = 'error';
      problem = String(e);
      pending = text;
    }
  }

  function changed(doc: string) {
    pending = doc;
    status = 'saving';
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  }

  // When the file changes in another program, take the new text if nothing is waiting
  // to be saved here. Otherwise ask, because the player's unsaved words come first.
  async function changedElsewhere(paths: string[]) {
    if (!view || !paths.includes(id)) return;
    let text: string;
    try {
      text = await fs.readText(id);
    } catch {
      return;
    }
    if (text === lastSaved) return;
    if (pending === null && view.state.doc.toString() === lastSaved) {
      lastSaved = text;
      replaceDoc(view, text);
      pending = null;
      status = 'saved';
      // A chapter added from the binder arrives this way, after the jump to it was asked for.
      if (jump && Date.now() - jump.at < 5000) jumpTo(view, headingNear(view, jump.offset, jump.title));
    } else {
      conflict = text;
    }
  }

  function takeTheirs() {
    if (!view || conflict === null) return;
    if (timer) clearTimeout(timer);
    lastSaved = conflict;
    replaceDoc(view, conflict);
    pending = null;
    conflict = null;
    status = 'saved';
  }

  function keepMine() {
    conflict = null;
    if (view) changed(view.state.doc.toString());
    lastSaved = '';
  }

  let stopWatching = () => {};
  let unregister = () => {};
  onMount(async () => {
    try {
      lastSaved = await fs.readText(id);
    } catch (e) {
      status = 'error';
      problem = String(e);
      return;
    }
    // svelte-ignore state_referenced_locally
    view = createEditor({
      parent: host,
      doc: lastSaved,
      title,
      scanner,
      onChange: changed,
      onMention: (id) => onOpen(id),
      onCursor: (pos) => onCursor?.(pos),
      onOutline: (at) => onOutline?.(at),
      toolbar: { narrator: narratorTool, onMakeEntry: (name) => onMakeEntry?.(name) },
    });
    status = 'saved';
    ready = true;
    onReady?.(view);
    if (autofocus && !jump) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }
    stopWatching = fs.onChange(changedElsewhere);
    unregister = registerSaver(id, save);
  });

  // A rebuilt index brings new names, and a new pane to the right moves the marked name,
  // so the links are redrawn.
  $effect(() => {
    scanner.current = index.scanner;
    scanner.next = next;
    if (view) refreshMentions(view);
  });

  // A jump waits until the editor exists, so a chapter chosen before the file loads still lands.
  $effect(() => {
    if (ready && jump && view) jumpTo(view, headingNear(view, jump.offset, jump.title));
  });

  onDestroy(() => {
    stopWatching();
    unregister();
    void save();
    view?.destroy();
  });
</script>

{#if conflict !== null}
  <div class="conflict" role="alert">
    <p>This entry changed in another program while you were editing it here.</p>
    <div>
      <button type="button" onclick={takeTheirs}>Load the other version</button>
      <button type="button" onclick={keepMine}>Keep mine</button>
    </div>
  </div>
{/if}
<div class="status label" aria-live="polite">
  {#if status === 'saving'}Saving…{:else if status === 'error'}Not saved: {problem}{:else}&nbsp;{/if}
</div>
<div class="editor" bind:this={host}></div>

<style>
  .status {
    margin-bottom: 14px;
    font-size: 11px;
    min-height: 14px;
  }
  .editor {
    min-height: 60vh;
  }
  .conflict {
    background: var(--surface);
    border-left: 2px solid var(--accent);
    padding: 12px 16px;
    margin-bottom: 18px;
  }
  .conflict p {
    margin: 0 0 10px;
  }
  .conflict div {
    display: flex;
    gap: 8px;
  }
  .conflict button {
    font-size: 13px;
    color: var(--text);
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 8px 12px;
    min-height: 40px;
  }
</style>
