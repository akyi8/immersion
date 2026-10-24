<script lang="ts">
  import { untrack } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import type { View } from '../../lib/render';
  import { slugify } from '../../lib/slug';
  import Sidebar from './Sidebar.svelte';
  import EntryView from './EntryView.svelte';
  import WorldHome from './WorldHome.svelte';
  import PreviewPanel from './PreviewPanel.svelte';
  import CreateDialog from './CreateDialog.svelte';

  let {
    index,
    fs,
    nav,
    view,
    worldName,
    rebuild,
  }: { index: WikiIndex; fs: WorldFs; nav: Navigator; view: View; worldName: string; rebuild: () => Promise<void> } = $props();

  let preview = $state<string | null>(null);
  // The entry just created, which opens with the cursor ready in it.
  let fresh = $state<string | null>(null);
  let creating = $state<{ kind: 'entry' | 'folder'; folder: string } | null>(null);
  let main: HTMLElement | undefined = $state();

  // A new location clears the preview, starts at the top, and leaves edit mode,
  // unless the new location is the entry just created for editing.
  $effect(() => {
    const here = nav.current.entry;
    untrack(() => {
      preview = null;
      if (fresh !== here) fresh = null;
      main?.scrollTo({ top: 0 });
    });
  });

  function currentFolder(): string {
    const here = nav.current.entry;
    return here ? here.slice(0, here.lastIndexOf('/')) : index.root.path;
  }

  async function create(name: string, folder: string): Promise<string | null> {
    const slug = slugify(name);
    if (!slug) return 'That name has no letters or numbers to make a file name from.';
    const path = `${folder}/${slug}${creating?.kind === 'entry' ? '.md' : ''}`;
    if (await fs.exists(path)) return `Something called ${slug} already exists there.`;
    try {
      if (creating?.kind === 'entry') {
        await fs.writeText(path, `# ${name}\n\n`);
        await rebuild();
        fresh = path;
        nav.go({ module: 'world', entry: path });
      } else {
        await fs.createDir(path);
        await rebuild();
      }
    } catch (e) {
      return String(e);
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
  <main bind:this={main}>
    {#if nav.current.entry && index.get(nav.current.entry)}
      <EntryView
        {index}
        {fs}
        id={nav.current.entry}
        {view}
        {preview}
        fresh={fresh === nav.current.entry}
        onPreview={(id) => (preview = id)} />
    {:else}
      <WorldHome {index} {nav} {worldName} onNewEntry={() => (creating = { kind: 'entry', folder: index.root.path })} />
    {/if}
  </main>
  <PreviewPanel {index} {fs} id={preview} onOpen={(id) => nav.go({ module: 'world', entry: id })} />
</div>

{#if creating}
  <CreateDialog {index} kind={creating.kind} startFolder={creating.folder} onCreate={create} onCancel={() => (creating = null)} />
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
