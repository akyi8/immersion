<script lang="ts">
  import { untrack } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import type { View } from '../../lib/render';
  import { createCategory, createEntry, likelyCategory } from '../../lib/index/create';
  import Sidebar from './Sidebar.svelte';
  import Panes from '../Panes.svelte';
  import EntryView from './EntryView.svelte';
  import WorldHome from './WorldHome.svelte';
  import CreateDialog from './CreateDialog.svelte';

  let {
    index,
    fs,
    nav,
    view,
    worldName,
    rebuild,
  }: { index: WikiIndex; fs: WorldFs; nav: Navigator; view: View; worldName: string; rebuild: () => Promise<void> } = $props();

  // The entry just created, which opens with the cursor ready in it.
  let fresh = $state<string | null>(null);
  /** The form for a new entry or category. `after` is the pane to open the new entry beside. */
  let creating = $state<{ kind: 'entry' | 'folder'; folder: string; name?: string; after?: number } | null>(null);

  // Closing the new entry's pane, or moving elsewhere in history, ends its freshness.
  $effect(() => {
    const open = nav.panes;
    untrack(() => {
      if (fresh && !open.includes(fresh)) fresh = null;
    });
  });

  // Entries deleted in another program drop out of the row.
  const entries = $derived(nav.panes.filter((id) => index.get(id)));

  function currentFolder(): string {
    const here = nav.entry;
    return here ? here.slice(0, here.lastIndexOf('/')) : index.root.path;
  }

  async function create(name: string, folder: string): Promise<string | null> {
    try {
      if (creating?.kind === 'entry') {
        const path = await createEntry(fs, name, folder);
        await rebuild();
        fresh = path;
        // A new entry opens beside the one it was made from, or beside the last one, ready for typing.
        nav.open(path, creating.after);
      } else {
        await createCategory(fs, name, folder);
        await rebuild();
      }
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    creating = null;
    return null;
  }
</script>

<div class="world">
  <Sidebar
    {index}
    {fs}
    {nav}
    onNewEntry={() => (creating = { kind: 'entry', folder: currentFolder() })}
    onNewFolder={() => (creating = { kind: 'folder', folder: currentFolder() })} />
  {#if entries.length}
    <Panes {nav} ids={entries} label={(id) => index.get(id)?.name ?? id}>
      {#snippet pane(id, i, next)}
        <EntryView
          {index}
          {fs}
          {id}
          {view}
          {next}
          fresh={fresh === id}
          onOpen={(target) => nav.open(target, i)}
          onMakeEntry={(name) => (creating = { kind: 'entry', folder: likelyCategory(index), name, after: i })} />
      {/snippet}
    </Panes>
  {:else}
    <main>
      <WorldHome {index} {nav} {worldName} onNewEntry={() => (creating = { kind: 'entry', folder: index.root.path })} />
    </main>
  {/if}
</div>

{#if creating}
  <CreateDialog {index} kind={creating.kind} startFolder={creating.folder} startName={creating.name} onCreate={create} onCancel={() => (creating = null)} />
{/if}

<style>
  .world {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 36px 48px 60px;
  }
</style>
