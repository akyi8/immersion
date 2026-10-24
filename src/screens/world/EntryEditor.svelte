<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { createEditor, refreshMentions, replaceDoc, type ScannerRef } from '../../lib/editor/editor';

  let {
    fs,
    index,
    id,
    title,
    autofocus = false,
    onPreview,
  }: { fs: WorldFs; index: WikiIndex; id: string; title: string; autofocus?: boolean; onPreview: (id: string) => void } = $props();

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
  onMount(async () => {
    try {
      lastSaved = await fs.readText(id);
    } catch (e) {
      status = 'error';
      problem = String(e);
      return;
    }
    // svelte-ignore state_referenced_locally
    view = createEditor({ parent: host, doc: lastSaved, title, scanner, onChange: changed, onMention: onPreview });
    status = 'saved';
    if (autofocus) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }
    stopWatching = fs.onChange(changedElsewhere);
  });

  // A rebuilt index brings new names, so the links are redrawn with the new scanner.
  $effect(() => {
    scanner.current = index.scanner;
    if (view) refreshMentions(view);
  });

  onDestroy(() => {
    stopWatching();
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
