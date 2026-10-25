<script lang="ts">
  import type { Entry, WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { archiveEntry, moveEntry, renameEntry } from '../../lib/index/manage';
  import Dialog from '../shelf/Dialog.svelte';
  import { saveNow } from '../../lib/saves';

  // Rename, move, and archive for one entry (Mike, October 25), from a small menu by its name.
  let {
    fs,
    index,
    entry,
    onMoved,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    entry: Entry;
    /** Called after the entry's file moves, with its new path, or null once archived. */
    onMoved: (from: string, to: string | null) => void;
  } = $props();

  let open = $state(false);
  let doing = $state<'rename' | 'move' | 'archive' | null>(null);
  let name = $state('');
  let folder = $state('');
  let busy = $state(false);
  let problem = $state('');

  const here = $derived(entry.id.slice(0, entry.id.lastIndexOf('/')));
  const places = $derived([{ path: index.root.path, label: 'Uncategorized' }, ...index.root.folders.map((f) => ({ path: f.path, label: folderLabel(f.name) }))]);

  function start(what: 'rename' | 'move' | 'archive') {
    open = false;
    problem = '';
    name = entry.name;
    folder = here;
    doing = what;
  }

  async function run() {
    busy = true;
    problem = '';
    try {
      const from = entry.id;
      await saveNow(from);
      if (doing === 'rename') onMoved(from, await renameEntry(fs, entry, name));
      else if (doing === 'move') onMoved(from, await moveEntry(fs, entry, folder));
      else if (doing === 'archive') {
        await archiveEntry(fs, entry, index.root.path);
        onMoved(from, null);
      }
      doing = null;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="actions">
  <button type="button" class="more" aria-label="More for {entry.name}" aria-expanded={open} onclick={() => (open = !open)}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
  </button>
  {#if open}
    <div class="menu" role="menu">
      <button type="button" role="menuitem" onclick={() => start('rename')}>Rename</button>
      <button type="button" role="menuitem" onclick={() => start('move')}>Move to another category</button>
      <button type="button" role="menuitem" onclick={() => start('archive')}>Archive</button>
    </div>
  {/if}
</div>

{#if doing === 'rename'}
  <Dialog title="Rename" action="Rename" ready={!!name.trim() && name.trim() !== entry.name} {busy} {problem} onSubmit={run} onCancel={() => (doing = null)}>
    <label for="rename-name" class="label">New name</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="rename-name" type="text" bind:value={name} autofocus autocomplete="off" />
    <p class="hint">"{entry.name}" stays as another name for this entry, so everywhere you already wrote it still links here.</p>
  </Dialog>
{:else if doing === 'move'}
  <Dialog title="Move" action="Move" ready={folder !== here} {busy} {problem} onSubmit={run} onCancel={() => (doing = null)}>
    <div class="label">Category</div>
    <div class="chips" role="radiogroup" aria-label="Category">
      {#each places as p}
        <button type="button" role="radio" aria-checked={folder === p.path} class:on={folder === p.path} onclick={() => (folder = p.path)}>{p.label}</button>
      {/each}
    </div>
  </Dialog>
{:else if doing === 'archive'}
  <Dialog title="Archive" action="Archive" ready={true} {busy} {problem} onSubmit={run} onCancel={() => (doing = null)}>
    <p class="hint">
      {entry.name} moves to the wiki's archive and stops appearing in the app. The file and its picture are kept, so nothing is lost, and
      moving it back out of the archive folder restores it.
    </p>
  </Dialog>
{/if}

<style>
  .actions {
    position: relative;
  }
  .more {
    width: 36px;
    height: 36px;
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
    top: 40px;
    left: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 220px;
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
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    font-size: 14px;
    color: var(--text-soft);
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 6px 12px;
    min-height: 36px;
  }
  .chips button.on {
    color: var(--structure-soft);
    background: var(--structure-deep);
    border-color: var(--structure);
  }
</style>
