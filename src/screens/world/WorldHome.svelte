<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { Navigator } from '../../lib/nav.svelte';

  // What the World module shows before any entry is open: every category and its entries.
  let { index, nav, worldName, onNewEntry }: { index: WikiIndex; nav: Navigator; worldName: string; onNewEntry: () => void } = $props();

  function allIn(folder: import('../../lib/index/wiki').Folder): string[] {
    return [...folder.entries, ...folder.folders.flatMap(allIn)];
  }
</script>

<section>
  <div class="top">
    <div>
      <h1>{worldName}</h1>
      <p class="count">{index.entries.size} entries</p>
    </div>
    <button type="button" class="new" onclick={onNewEntry}>+ New entry</button>
  </div>
  {#each index.root.folders as folder}
    {@const ids = allIn(folder)}
    {#if ids.length}
      <h2 class="label">{folderLabel(folder.name)} <span>{ids.length}</span></h2>
      <div class="chips">
        {#each ids as id}
          <button type="button" onclick={() => nav.go({ module: 'world', entry: id })}>{index.get(id)!.name}</button>
        {/each}
      </div>
    {/if}
  {/each}
  {#if index.root.entries.length}
    <h2 class="label">Unfiled</h2>
    <div class="chips">
      {#each index.root.entries as id}
        <button type="button" onclick={() => nav.go({ module: 'world', entry: id })}>{index.get(id)!.name}</button>
      {/each}
    </div>
  {/if}
</section>

<style>
  section {
    max-width: 900px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
  .new {
    font-size: 14px;
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border: 0;
    padding: 10px 16px;
    min-height: 44px;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 72px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .count {
    margin: 6px 0 24px;
    color: var(--muted);
  }
  h2 {
    margin: 26px 0 10px;
    font-weight: 500;
  }
  h2 span {
    color: var(--text-soft);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    font-size: 14px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--rule);
    padding: 7px 12px;
    min-height: 36px;
  }
  .chips button:hover {
    border-color: var(--structure);
  }
</style>
