<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import type { View } from '../../lib/render';
  import Sidebar from './Sidebar.svelte';
  import EntryView from './EntryView.svelte';
  import WorldHome from './WorldHome.svelte';
  import PreviewPanel from './PreviewPanel.svelte';

  let { index, fs, nav, view, worldName }: { index: WikiIndex; fs: WorldFs; nav: Navigator; view: View; worldName: string } = $props();

  let preview = $state<string | null>(null);
  let main: HTMLElement | undefined = $state();

  // A new location clears the preview and starts at the top of the page.
  $effect(() => {
    void nav.current;
    preview = null;
    main?.scrollTo({ top: 0 });
  });
</script>

<div class="world">
  <Sidebar {index} {fs} {nav} />
  <main bind:this={main}>
    {#if nav.current.entry && index.get(nav.current.entry)}
      <EntryView {index} {fs} id={nav.current.entry} {view} {preview} onPreview={(id) => (preview = id)} />
    {:else}
      <WorldHome {index} {nav} {worldName} />
    {/if}
  </main>
  <PreviewPanel {index} {fs} id={preview} onOpen={(id) => nav.go({ module: 'world', entry: id })} />
</div>

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
