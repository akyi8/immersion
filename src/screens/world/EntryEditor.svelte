<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { createEditor, headingNear, jumpTo, refreshMentions, replaceDoc, type ScannerRef } from '../../lib/editor/editor';
  import { registerSaver } from '../../lib/saves';
  import { quiet } from '../../lib/view.svelte';
  import { Autosave, type SaveStatus } from '../../lib/editor/autosave';

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
    rumorTool = false,
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
    /** Offer "Rumor" on selected text. */
    rumorTool?: boolean;
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

  let status = $state<SaveStatus>('loading');
  let problem = $state('');
  let conflict = $state<string | null>(null);
  let ready = $state(false);

  const plain = (text: string) => text.replace(/\r\n?/g, '\n');

  // The saving, and what happens when the file changes in another program meanwhile,
  // live in lib/editor/autosave.ts. Edits to different paragraphs are joined, and the
  // writer is asked only when both changed the same lines.
  // svelte-ignore state_referenced_locally
  const saver = new Autosave({
    read: async () => plain(await fs.readText(id)),
    write: (text) => fs.writeText(id, text),
    doc: () => view?.state.doc.toString() ?? '',
    show: (text) => view && replaceDoc(view, text),
    changed: () => {
      status = saver.status;
      problem = saver.problem;
      conflict = saver.conflict;
    },
    delay: SAVE_DELAY_MS,
  });

  async function changedElsewhere(paths: string[]) {
    if (!view || !paths.includes(id)) return;
    const loaded = await saver.changedElsewhere();
    // A chapter added from the binder arrives this way, after the jump to it was asked for.
    if (loaded && view && jump && Date.now() - jump.at < 5000) jumpTo(view, headingNear(view, jump.offset, jump.title));
  }

  let stopWatching = () => {};
  let unregister = () => {};
  onMount(async () => {
    let text: string;
    try {
      text = plain(await fs.readText(id));
    } catch (e) {
      status = 'error';
      problem = String(e);
      return;
    }
    // svelte-ignore state_referenced_locally
    view = createEditor({
      parent: host,
      doc: text,
      title,
      scanner,
      onChange: () => {
        saver.typed();
        if (view?.hasFocus) quiet.typed();
      },
      onMention: (id) => onOpen(id),
      onCursor: (pos) => onCursor?.(pos),
      onOutline: (at) => onOutline?.(at),
      toolbar: { narrator: narratorTool, rumor: rumorTool, onMakeEntry: (name) => onMakeEntry?.(name) },
    });
    saver.start(text);
    ready = true;
    onReady?.(view);
    if (autofocus && !jump) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }
    stopWatching = fs.onChange(changedElsewhere);
    unregister = registerSaver(id, () => saver.save());
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
    // Closing a page with a clash still open keeps what the writer typed (design: the player wins).
    // The editor outlives the page by one save, because the save reads its text.
    void saver.save(true).finally(() => view?.destroy());
  });
</script>

{#if conflict !== null}
  <div class="conflict" role="alert">
    <p>This entry changed in another program while you were editing it here.</p>
    <div>
      <button type="button" onclick={() => saver.takeTheirs()}>Load the other version</button>
      <button type="button" onclick={() => saver.keepMine()}>Keep mine</button>
    </div>
  </div>
{/if}
<div class="status label pane-actions" aria-live="polite">
  {#if status === 'saving'}Saving…{:else if status === 'error'}Not saved: {problem}{:else}&nbsp;{/if}
</div>
<div class="editor" bind:this={host}></div>

<style>
  .status {
    margin-bottom: 14px;
    font-size: calc(11px * var(--type));
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
    font-size: calc(13px * var(--type));
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 12px;
    min-height: 40px;
  }
</style>
