<script lang="ts">
  import type { Folder, WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { archiveCategory, renameCategory } from '../../lib/index/manage';
  import { saveAllUnder } from '../../lib/saves';
  import Dialog from '../shelf/Dialog.svelte';

  // Rename and archive for a category in the tree (Mike, October 25).
  let {
    fs,
    index,
    folder,
    onMoved,
    button = true,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    folder: Folder;
    /** Called after the category's folder moves, with its new path, or null once archived. */
    onMoved: (from: string, to: string | null) => void;
    /** Show the ⋯ button. Without it, a right-click menu opens the forms through `start`. */
    button?: boolean;
  } = $props();

  let open = $state(false);
  let doing = $state<'rename' | 'archive' | null>(null);
  let name = $state('');
  let busy = $state(false);
  let problem = $state('');
  const label = $derived(folderLabel(folder.name));

  function count(f: Folder): number {
    return f.entries.length + f.folders.reduce((n, c) => n + count(c), 0);
  }

  export function start(what: 'rename' | 'archive') {
    open = false;
    problem = '';
    name = label;
    doing = what;
  }

  async function run() {
    busy = true;
    problem = '';
    try {
      await saveAllUnder(folder.path);
      if (doing === 'rename') onMoved(folder.path, await renameCategory(fs, folder.path, name));
      else {
        await archiveCategory(fs, folder.path, index.root.path);
        onMoved(folder.path, null);
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
<div class="actions">
  <button type="button" class="more" aria-label="More for {label}" aria-expanded={open} onclick={() => (open = !open)}>
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
  </button>
  {#if open}
    <div class="menu" role="menu">
      <button type="button" role="menuitem" onclick={() => start('rename')}>Rename category</button>
      <button type="button" role="menuitem" onclick={() => start('archive')}>Archive category</button>
    </div>
  {/if}
</div>
{/if}

{#if doing === 'rename'}
  <Dialog title="Rename category" action="Rename" ready={!!name.trim() && name.trim() !== label} {busy} {problem} onSubmit={run} onCancel={() => (doing = null)}>
    <label for="category-name" class="label">New name</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="category-name" type="text" bind:value={name} autofocus autocomplete="off" />
  </Dialog>
{:else if doing === 'archive'}
  <Dialog title="Archive category" action="Archive" ready={true} {busy} {problem} onSubmit={run} onCancel={() => (doing = null)}>
    <p class="hint">
      {label} and its {count(folder)} {count(folder) === 1 ? 'entry' : 'entries'} move to the wiki's archive and stop appearing in the app. The
      files are kept, so nothing is lost.
    </p>
  </Dialog>
{/if}

<style>
  .actions {
    position: relative;
  }
  .more {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
  }
  .more:hover,
  .more[aria-expanded='true'] {
    color: var(--text);
    border-color: var(--rule-strong);
  }
  .menu {
    position: absolute;
    top: 30px;
    right: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 190px;
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
    padding: 4px;
  }
  .menu button {
    text-align: left;
    font-size: 14px;
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
