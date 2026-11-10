<script lang="ts">
  import { contextMenu } from '../../lib/contextMenu.svelte';
  import { outside } from '../../lib/outside';
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
  <button
    type="button"
    class="more"
    aria-label="More for {label}"
    aria-haspopup="menu"
    onclick={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      contextMenu.show(e, [{ label: 'Rename category', run: () => start('rename') }, 'separator', { label: 'Archive category', run: () => start('archive') }], { x: r.left, y: r.bottom + 4 });
    }}>
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></svg>
  </button>
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
  .more {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
  }
  .more:hover {
    color: var(--text);
    border-color: var(--edge);
  }
</style>
