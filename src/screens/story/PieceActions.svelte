<script lang="ts">
  import { outside } from '../../lib/outside';
  import type { WorldFs } from '../../lib/fs/types';
  import { archivePiece, renamePiece } from '../../lib/story/manage';
  import { saveAllUnder, saveNow } from '../../lib/saves';
  import Dialog from '../shelf/Dialog.svelte';

  // Rename and archive for a manuscript or a drawer piece, from a small menu by its
  // title or from a right-click (Mike, October 25).
  let {
    fs,
    path,
    title,
    root,
    onMoved,
    onWindow,
    windowOnly = false,
    button = true,
  }: {
    fs: WorldFs;
    /** The piece's file, or its folder. */
    path: string;
    title: string;
    /** The stories folder, whose archive takes archived pieces. */
    root: string;
    /** Called after the piece moves, with its new path, or null once archived. */
    onMoved: (from: string, to: string | null) => void;
    /** Moves the page into a reading window of its own. */
    onWindow?: () => void;
    /** Offer only the window, for a chapter, which the binder renames instead. */
    windowOnly?: boolean;
    /** Show the ⋯ button. Without it, a right-click menu opens the forms through `start`. */
    button?: boolean;
  } = $props();

  let open = $state(false);
  let doing = $state<'rename' | 'archive' | null>(null);
  let name = $state('');
  let busy = $state(false);
  let problem = $state('');

  export function start(what: 'rename' | 'archive') {
    open = false;
    problem = '';
    name = title;
    doing = what;
  }

  async function run() {
    busy = true;
    problem = '';
    try {
      await saveNow(path);
      await saveAllUnder(path);
      if (doing === 'rename') onMoved(path, await renamePiece(fs, path, name));
      else {
        await archivePiece(fs, path, root);
        onMoved(path, null);
      }
      doing = null;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if button}
<div class="actions" use:outside={() => (open = false)}>
  <button type="button" class="more" aria-label="More for {title}" aria-expanded={open} onclick={() => (open = !open)}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
  </button>
  {#if open}
    <div class="menu" role="menu">
      {#if onWindow}
        <button type="button" role="menuitem" onclick={() => ((open = false), onWindow())}>Open in a new window</button>
      {/if}
      {#if !windowOnly}
        <button type="button" role="menuitem" onclick={() => start('rename')}>Rename</button>
        <button type="button" role="menuitem" onclick={() => start('archive')}>Archive</button>
      {/if}
    </div>
  {/if}
</div>
{/if}

{#if doing === 'rename'}
  <Dialog title="Rename" action="Rename" ready={!!name.trim() && name.trim() !== title} {busy} {problem} onSubmit={run} onCancel={() => (doing = null)}>
    <label for="piece-name" class="label">New title</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="piece-name" type="text" bind:value={name} autofocus autocomplete="off" />
  </Dialog>
{:else if doing === 'archive'}
  <Dialog title="Archive" action="Archive" ready={true} {busy} {problem} onSubmit={run} onCancel={() => (doing = null)}>
    <p class="hint">
      {title} moves to the stories folder's archive and stops appearing in the app. Its files are kept, so nothing is lost, and moving them
      back out of the archive folder restores it.
    </p>
  </Dialog>
{/if}

<style>
  .actions {
    position: relative;
  }
  .more {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
  }
  .more:hover,
  .more[aria-expanded='true'] {
    color: var(--text);
    border-color: var(--edge);
  }
  .menu {
    position: absolute;
    top: 36px;
    right: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 200px;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    box-shadow: 0 8px 24px var(--shadow);
    padding: 4px;
  }
  .menu button {
    text-align: left;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    padding: 9px 12px;
    min-height: 38px;
  }
  .menu button:hover {
    background: var(--structure-deep);
    color: var(--structure-soft);
  }
</style>
