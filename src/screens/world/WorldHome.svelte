<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { Navigator } from '../../lib/nav.svelte';

  // What the World module shows before any entry is open: every category and its entries.
  let { index, nav, worldName }: { index: WikiIndex; nav: Navigator; worldName: string } = $props();

  function allIn(folder: import('../../lib/index/wiki').Folder): string[] {
    return [...folder.entries, ...folder.folders.flatMap(allIn)];
  }
</script>

<section>
  <h1>{worldName}</h1>
  <p class="count">{index.entries.size} entries</p>
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
    border-color: var(--accent);
  }
</style>
