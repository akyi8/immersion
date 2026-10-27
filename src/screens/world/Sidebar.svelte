<script lang="ts">
  import { tick } from 'svelte';
  import type { WikiIndex, Folder } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import Portrait from './Portrait.svelte';
  import CategoryActions from './CategoryActions.svelte';
  import EntryActions from './EntryActions.svelte';
  import { contextMenu } from '../../lib/contextMenu.svelte';
  import { openInWindow } from '../../lib/windows';
  import { moveEntry } from '../../lib/index/manage';
  import { saveNow } from '../../lib/saves';

  let {
    index,
    fs,
    nav,
    onNewEntry,
    onNewFolder,
    onCategoryMoved,
    onEntryMoved,
    onEntriesMoved,
  }: {
    index: WikiIndex;
    fs: WorldFs;
    nav: Navigator;
    /** Starts a new entry, in `folder` when one is given. */
    onNewEntry: (folder?: string) => void;
    /** Starts a new category, inside `folder` when one is given. */
    onNewFolder: (folder?: string) => void;
    onCategoryMoved: (from: string, to: string | null) => void;
    onEntryMoved: (from: string, to: string | null) => void;
    /** Called after several entries moved at once, with each one's old and new path. */
    onEntriesMoved: (moves: [string, string][]) => void;
  } = $props();

  // Selecting and dragging entries in the tree (Mike, October 25). Cmd-click or Ctrl-click
  // adds an entry to the selection, Shift-click selects a run, and dragging any selected
  // entry onto a folder moves them all. The drag is drawn by hand from pointer events,
  // so it works the same in every desktop webview.
  let selected = $state<string[]>([]);
  let anchor: string | null = null;

  /** The entries the tree shows, top to bottom, for selecting a run. */
  function visibleEntries(folder: Folder): string[] {
    return [...folder.folders.flatMap((f) => (isOpen(f) ? visibleEntries(f) : [])), ...folder.entries];
  }

  function clickEntry(event: MouseEvent, id: string) {
    if (dragged) {
      dragged = false;
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
      anchor = id;
      return;
    }
    if (event.shiftKey && anchor) {
      const order = visibleEntries(index.root);
      const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y);
      if (a >= 0) {
        selected = order.slice(a, b + 1);
        return;
      }
    }
    selected = [];
    anchor = id;
    nav.open(id);
  }

  let drag = $state<{ ids: string[]; x: number; y: number; over: string | null } | null>(null);
  let pressed: { id: string; x: number; y: number } | null = null;
  let dragged = false;
  let opening: ReturnType<typeof setTimeout> | null = null;

  function pressEntry(event: PointerEvent, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    pressed = { id, x: event.clientX, y: event.clientY };
  }

  function dropTarget(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
    return el?.dataset.drop ?? null;
  }

  function onPointerMove(event: PointerEvent) {
    if (!pressed) return;
    if (!drag) {
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 6) return;
      const ids = selected.includes(pressed.id) ? selected : [pressed.id];
      drag = { ids, x: event.clientX, y: event.clientY, over: null };
    }
    const over = dropTarget(event.clientX, event.clientY);
    if (over !== drag.over) {
      // Hovering on a closed folder for a moment opens it, so a drag can reach inside.
      if (opening) clearTimeout(opening);
      opening = over
        ? setTimeout(() => {
            if (over && !(over in open && open[over])) open = { ...open, [over]: true };
          }, 700)
        : null;
    }
    drag = { ...drag, x: event.clientX, y: event.clientY, over };
  }

  async function onPointerUp() {
    const done = drag;
    pressed = null;
    drag = null;
    if (opening) clearTimeout(opening);
    if (!done) return;
    dragged = true;
    setTimeout(() => (dragged = false), 0);
    if (!done.over) return;
    const moves: [string, string][] = [];
    try {
      for (const id of done.ids) {
        const entry = index.get(id);
        if (!entry || id.slice(0, id.lastIndexOf('/')) === done.over) continue;
        await saveNow(id);
        moves.push([id, await moveEntry(fs, entry, done.over)]);
      }
    } finally {
      selected = [];
      if (moves.length) onEntriesMoved(moves);
    }
  }


  // Right-click menus (Mike, October 25). One set of entry forms and one set of category
  // forms, each aimed at whatever was right-clicked.
  let entryActions: EntryActions | undefined = $state();
  let entryTarget = $state<string | null>(null);
  let categoryActions: CategoryActions | undefined = $state();
  let categoryTarget = $state<Folder | null>(null);

  async function entryForm(id: string, what: 'rename' | 'names' | 'move' | 'archive') {
    entryTarget = id;
    await tick();
    entryActions?.start(what);
  }

  async function categoryForm(folder: Folder, what: 'rename' | 'archive') {
    categoryTarget = folder;
    await tick();
    categoryActions?.start(what);
  }

  function entryMenu(event: MouseEvent, id: string) {
    contextMenu.show(event, [
      { label: 'Open', run: () => nav.open(id) },
      {
        label: 'Open in a new window',
        run: () => {
          openInWindow(id, index.get(id)?.name ?? id);
          if (nav.panes.includes(id)) nav.close(id);
        },
      },
      'separator',
      { label: 'Rename', run: () => entryForm(id, 'rename') },
      { label: 'Other names', run: () => entryForm(id, 'names') },
      { label: 'Move to another category', run: () => entryForm(id, 'move') },
      { label: 'Archive', run: () => entryForm(id, 'archive') },
    ]);
  }

  function categoryMenu(event: MouseEvent, folder: Folder) {
    contextMenu.show(event, [
      { label: 'New entry here', run: () => onNewEntry(folder.path) },
      { label: 'New category inside', run: () => onNewFolder(folder.path) },
      'separator',
      { label: 'Rename category', run: () => categoryForm(folder, 'rename') },
      { label: 'Archive category', run: () => categoryForm(folder, 'archive') },
    ]);
  }

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

  const current = $derived(nav.entry);
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

<svelte:window
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      selected = [];
      pressed = null;
      drag = null;
    }
  }} />

<nav class="sidebar" aria-label="Wiki">
  {#snippet folderView(folder: Folder, depth: number)}
    {#each folder.folders as child}
      <div class="folder-row" class:drop={drag?.over === child.path} data-drop={child.path} oncontextmenu={(e) => categoryMenu(e, child)} role="presentation">
        <button type="button" class="folder" style:padding-left="{18 + depth * 14}px" aria-expanded={isOpen(child)} onclick={() => toggle(child)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d={isOpen(child) ? 'M1 3 L5 7 L9 3' : 'M3 1 L7 5 L3 9'} fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
          {folderLabel(child.name)}
          <span class="count">{child.entries.length || ''}</span>
        </button>
        <div class="row-actions"><CategoryActions {fs} {index} folder={child} onMoved={onCategoryMoved} /></div>
      </div>
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
        class:selected={selected.includes(id)}
        class:dragging={drag?.ids.includes(id)}
        style:padding-left="{32 + depth * 14}px"
        onpointerdown={(event) => pressEntry(event, id)}
        onclick={(event) => clickEntry(event, id)}
        oncontextmenu={(event) => entryMenu(event, id)}>{e.name}</button>
    {/each}
  {/snippet}

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
            <button type="button" class="item" onclick={() => nav.open(id)} oncontextmenu={(event) => entryMenu(event, id)}>
              <span>{e.name}</span><span class="kind">{folderLabel(e.category)}</span>
            </button>
          {/if}
        {/each}
      {:else}
        <!-- With nothing open yet, the working set has nothing to gather, so the tree stands in. -->
        <p class="hint">Open an entry, and the people and places around it gather here.</p>
        {@render folderView(index.root, 0)}
        <div class="create">
          <button type="button" onclick={() => onNewEntry()}>+ New entry</button>
          <button type="button" onclick={() => onNewFolder()}>+ New category</button>
        </div>
      {/each}
    </div>
  {:else if mode === 'tree'}
    <div class="list">
      {@render folderView(index.root, 0)}
      <div class="create">
        <button type="button" onclick={() => onNewEntry()}>+ New entry</button>
        <button type="button" onclick={() => onNewFolder()}>+ New category</button>
      </div>
    </div>
  {:else}
    <div class="faces">
      {#each people as e (e.id)}
        <button type="button" class="face" class:current={e.id === current} onclick={() => nav.open(e.id)} oncontextmenu={(event) => entryMenu(event, e.id)}>
          <Portrait url={e.imagePath ? fs.imageUrl(e.imagePath) : null} name={e.name} size="face" />
          <span>{e.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</nav>

{#if drag}
  <div class="ghost" style:left="{drag.x + 14}px" style:top="{drag.y + 10}px" aria-hidden="true">
    {drag.ids.length === 1 ? (index.get(drag.ids[0])?.name ?? '') : `${drag.ids.length} entries`}{#if drag.over}<span> into {folderLabel(drag.over.split('/').pop() ?? '')}</span>{/if}
  </div>
{/if}

{#if entryTarget && index.get(entryTarget)}
  <EntryActions bind:this={entryActions} {fs} {index} entry={index.get(entryTarget)!} button={false} onMoved={onEntryMoved} />
{/if}
{#if categoryTarget}
  <CategoryActions bind:this={categoryActions} {fs} {index} folder={categoryTarget} button={false} onMoved={onCategoryMoved} />
{/if}

<style>
  .sidebar {
    width: 290px;
    flex-shrink: 0;
    border-right: 1px solid var(--line);
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
    background: var(--veil);
    backdrop-filter: var(--frost);
    z-index: 1;
  }
  .modes button {
    flex: 1;
    font-size: calc(13px * var(--type));
    color: var(--muted);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 4px;
    min-height: 38px;
  }
  .modes button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    border-color: var(--selected-border);
  }
  .list {
    display: flex;
    flex-direction: column;
    padding-bottom: 18px;
  }
  .group {
    padding: 16px 18px 6px;
    font-size: calc(11px * var(--type));
  }
  .folder-row {
    position: relative;
    display: flex;
    align-items: center;
  }
  .folder-row .folder {
    flex: 1;
    min-width: 0;
    /* Room for the ⋯ button, so it never sits on the count. */
    padding-right: 48px;
  }
  .row-actions {
    position: absolute;
    right: 8px;
    opacity: 0;
  }
  .folder-row:hover .row-actions,
  .row-actions:focus-within {
    opacity: 1;
  }
  .item,
  .folder {
    text-align: left;
    font-size: calc(14px * var(--type));
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
  .item.selected {
    color: var(--selected-fg);
    background: var(--selected-bg);
    box-shadow: inset 2px 0 0 var(--selected-border);
  }
  .item.dragging {
    opacity: 0.45;
  }
  .folder-row.drop {
    background: var(--selected-bg);
    box-shadow: inset 0 0 0 1px var(--selected-border);
  }
  .ghost {
    position: fixed;
    z-index: 40;
    pointer-events: none;
    font-size: calc(13px * var(--type));
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--selected-border);
    box-shadow: 0 6px 18px var(--shadow);
    padding: 6px 10px;
    white-space: nowrap;
  }
  .ghost span {
    margin-left: 0.3em;
    color: var(--muted);
  }
  .item.current {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .folder {
    justify-content: flex-start;
    font-weight: 700;
  }
  .count {
    margin-left: auto;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    font-weight: 400;
    color: var(--muted);
  }
  .kind {
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .hint {
    margin: 12px 18px;
    font-size: calc(14px * var(--type));
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
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
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
    font-size: calc(12px * var(--type));
    line-height: 1.3;
  }
  .face.current :global(.portrait) {
    border-color: var(--structure);
  }
</style>
