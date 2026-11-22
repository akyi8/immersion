<script lang="ts">
  import { errorText } from '../../lib/errors';
  import type { Folder, WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { archiveCategory, renameCategory } from '../../lib/index/manage';
  import { saveAllUnder } from '../../lib/saves';
  import Dialog from '../shelf/Dialog.svelte';

  // Rename and archive for a category in the tree (Cerys, October 25).
  let {
    fs,
    index,
    folder,
    onMoved,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    folder: Folder;
    /** Called after the category's folder moves, with its new path, or null once archived. */
    onMoved: (from: string, to: string | null) => void;
  } = $props();

  let doing = $state<'rename' | 'archive' | null>(null);
  let name = $state('');
  let busy = $state(false);
  let problem = $state('');
  const label = $derived(folderLabel(folder.name));

  function count(f: Folder): number {
    return f.entries.length + f.folders.reduce((n, c) => n + count(c), 0);
  }

  export function start(what: 'rename' | 'archive') {
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
      problem = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

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
</style>
