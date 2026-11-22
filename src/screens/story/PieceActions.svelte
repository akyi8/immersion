<script lang="ts">
  import { errorText } from '../../lib/errors';
  import type { WorldFs } from '../../lib/fs/types';
  import { archivePiece, renamePiece } from '../../lib/story/manage';
  import { saveAllUnder, saveNow } from '../../lib/saves';
  import Dialog from '../shelf/Dialog.svelte';

  // Rename and archive for a manuscript or a drawer piece, from a small menu by its
  // title or from a right-click (Cerys, October 25).
  let {
    fs,
    path,
    title,
    root,
    onMoved,
  }: {
    fs: WorldFs;
    /** The piece's file, or its folder. */
    path: string;
    title: string;
    /** The stories folder, whose archive takes archived pieces. */
    root: string;
    /** Called after the piece moves, with its new path, or null once archived. */
    onMoved: (from: string, to: string | null) => void;
  } = $props();

  let doing = $state<'rename' | 'archive' | null>(null);
  let name = $state('');
  let busy = $state(false);
  let problem = $state('');

  export function start(what: 'rename' | 'archive') {
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
      problem = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

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
</style>
