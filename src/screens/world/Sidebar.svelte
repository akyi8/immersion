<script lang="ts">
  import type { WikiIndex, Folder } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import Portrait from './Portrait.svelte';

  let {
    index,
    fs,
    nav,
    onNewEntry,
    onNewFolder,
  }: { index: WikiIndex; fs: WorldFs; nav: Navigator; onNewEntry: () => void; onNewFolder: () => void } = $props();

  type Mode = 'working' | 'tree' | 'faces';
  const MODES: [Mode, string][] = [
    ['working', 'Working set'],
    ['tree', 'Tree'],
    ['faces', 'Faces'],
  ];

  function savedMode(): Mode {
    try {
      const m = localStorage.getItem('immersion.sidebar');
      if (m === 'working' || m === 'tree' || m === 'faces') return m;
    } catch {
      // Storage can be unavailable; the default is fine.
    }
    return 'working';
  }

  let mode = $state<Mode>(savedMode());
  function setMode(m: Mode) {
    mode = m;
    try {
      localStorage.setItem('immersion.sidebar', m);
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  const current = $derived(nav.current.entry);
  const groups = $derived.by(() => {
    const out: { title: string; ids: string[] }[] = [];
    if (current) {
      out.push({ title: 'In this entry', ids: index.mentionedIn(current) });
      out.push({ title: 'Appears with', ids: index.appearsWith(current) });
    }
    out.push({ title: 'Recent', ids: nav.recentEntries() });
    return out.filter((g) => g.ids.length > 0);
  });

  // Folders open in the tree. The folder holding the current entry opens itself.
  let open = $state<Record<string, boolean>>({});
  function isOpen(folder: Folder): boolean {
    if (folder.path in open) return open[folder.path];
    return !!current && current.startsWith(folder.path + '/');
  }
  function toggle(folder: Folder) {
    open = { ...open, [folder.path]: !isOpen(folder) };
  }

  const people = $derived(index.all());
</script>

<nav class="sidebar" aria-label="Wiki">
  <div class="modes" role="group" aria-label="Sidebar view">
    {#each MODES as [m, label]}
      <button type="button" class:on={mode === m} aria-pressed={mode === m} onclick={() => setMode(m)}>{label}</button>
    {/each}
  </div>

  {#if mode === 'working'}
    <div class="list">
      {#each groups as group}
        <div class="label group">{group.title}</div>
        {#each group.ids as id}
          {@const e = index.get(id)}
          {#if e}
            <button type="button" class="item" onclick={() => nav.go({ module: 'world', entry: id })}>
              <span>{e.name}</span><span class="kind">{folderLabel(e.category)}</span>
            </button>
          {/if}
        {/each}
      {:else}
        <p class="hint">Open an entry, and the people and places around it gather here.</p>
      {/each}
    </div>
  {:else if mode === 'tree'}
    <div class="list">
      {#snippet folderView(folder: Folder, depth: number)}
        {#each folder.folders as child}
          <button type="button" class="folder" style:padding-left="{18 + depth * 14}px" aria-expanded={isOpen(child)} onclick={() => toggle(child)}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d={isOpen(child) ? 'M1 3 L5 7 L9 3' : 'M3 1 L7 5 L3 9'} fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
            {folderLabel(child.name)}
            <span class="count">{child.entries.length || ''}</span>
          </button>
          {#if isOpen(child)}
            {@render folderView(child, depth + 1)}
          {/if}
        {/each}
        {#each folder.entries as id}
          {@const e = index.get(id)!}
          <button
            type="button"
            class="item"
            class:current={id === current}
            style:padding-left="{32 + depth * 14}px"
            onclick={() => nav.go({ module: 'world', entry: id })}>{e.name}</button>
        {/each}
      {/snippet}
      {@render folderView(index.root, 0)}
      <div class="create">
        <button type="button" onclick={onNewEntry}>+ New entry</button>
        <button type="button" onclick={onNewFolder}>+ New folder</button>
      </div>
    </div>
  {:else}
    <div class="faces">
      {#each people as e (e.id)}
        <button type="button" class="face" class:current={e.id === current} onclick={() => nav.go({ module: 'world', entry: e.id })}>
          <Portrait url={e.imagePath ? fs.imageUrl(e.imagePath) : null} name={e.name} size="face" />
          <span>{e.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</nav>

<style>
  .sidebar {
    width: 290px;
    flex-shrink: 0;
    border-right: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }
  .modes {
    display: flex;
    gap: 4px;
    padding: 16px 16px 8px;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 1;
  }
  .modes button {
    flex: 1;
    font-size: 13px;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--rule-strong);
    padding: 8px 4px;
    min-height: 38px;
  }
  .modes button.on {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .list {
    display: flex;
    flex-direction: column;
    padding-bottom: 18px;
  }
  .group {
    padding: 16px 18px 6px;
    font-size: 11px;
  }
  .item,
  .folder {
    text-align: left;
    font-size: 14px;
    color: var(--text);
    background: transparent;
    border: 0;
    padding: 7px 18px;
    min-height: 34px;
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  .item:hover,
  .folder:hover {
    background: var(--surface);
  }
  .item.current {
    color: var(--accent-ink);
    background: var(--accent);
  }
  .folder {
    justify-content: flex-start;
    font-weight: 700;
  }
  .count {
    margin-left: auto;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
  }
  .kind {
    font-size: 12px;
    color: var(--muted);
  }
  .hint {
    margin: 12px 18px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }
  .create {
    display: flex;
    gap: 4px;
    padding: 14px 16px 0;
  }
  .create button {
    flex: 1;
    font-size: 13px;
    color: var(--accent);
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 8px 6px;
    min-height: 38px;
  }
  .faces {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 8px 16px 18px;
  }
  .face {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
    font-size: 12px;
    line-height: 1.3;
  }
  .face.current :global(.portrait) {
    border-color: var(--accent);
  }
</style>
