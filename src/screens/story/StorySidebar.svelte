<script lang="ts">
  import type { Manuscript, StoryIndex } from '../../lib/story/index';
  import type { Activity } from '../../lib/story/activity';
  import Heatmap from './Heatmap.svelte';

  /**
   * The binder and the drawer (Mike, October 24). The binder holds the manuscripts the
   * writer declared, each with its chapters. The drawer holds every other piece in the
   * stories folder, most recently touched first, so half-started work stays near at hand
   * without crowding the book.
   */
  let {
    story,
    activity,
    open,
    cursor,
    onOpen,
    onDeclare,
    onNew,
    onAddChapter,
  }: {
    story: StoryIndex | null;
    activity: Activity | null;
    /** What is open in the Story module's panes. */
    open: string[];
    cursor: { path: string; pos: number } | null;
    onOpen: (path: string, offset?: number | null) => void;
    onDeclare: (path: string, manuscript: boolean) => void;
    onNew: (kind: 'manuscript' | 'drawer') => void;
    onAddChapter: (m: Manuscript) => void;
  } = $props();

  type DrawerMode = 'recent' | 'folders';
  function savedMode(): DrawerMode {
    try {
      return localStorage.getItem('immersion.drawer') === 'folders' ? 'folders' : 'recent';
    } catch {
      return 'recent';
    }
  }
  let mode = $state<DrawerMode>(savedMode());
  function setMode(m: DrawerMode) {
    mode = m;
    try {
      localStorage.setItem('immersion.drawer', m);
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  function isOpen(m: Manuscript): boolean {
    return open.includes(m.path) || m.sections.some((s) => open.includes(s.path));
  }

  /** The chapter or scene the cursor is in, so the binder can mark it. */
  function here(m: Manuscript): number {
    if (!cursor) return -1;
    if (m.kind === 'folder') return m.sections.findIndex((s) => s.path === cursor!.path);
    if (cursor.path !== m.path) return -1;
    let found = -1;
    m.sections.forEach((s, i) => {
      if (s.offset !== null && s.offset <= cursor!.pos) found = i;
    });
    return found;
  }

  const groups = $derived.by(() => {
    const map = new Map<string, StoryIndex['drawer']>();
    for (const item of story?.drawer ?? []) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  });

  function age(ms: number | null | undefined): string {
    if (!ms) return '';
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.round(days / 7)} weeks ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  function count(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
  }
</script>

<nav class="sidebar" aria-label="Binder and drawer">
  {#if activity}
    <div class="activity"><Heatmap {activity} weeks={17} /></div>
  {/if}
  <div class="head">
    <h2 class="label">Binder</h2>
    <button type="button" class="add" onclick={() => onNew('manuscript')}>+ New manuscript</button>
  </div>
  {#each story?.manuscripts ?? [] as m (m.path)}
    {@const at = here(m)}
    <button type="button" class="manuscript" class:current={isOpen(m)} onclick={() => onOpen(m.kind === 'file' ? m.path : (m.sections[0]?.path ?? m.path))}>
      <span>{m.title}</span><span class="n">{count(m.words)}</span>
    </button>
    {#if isOpen(m) || story?.manuscripts.length === 1}
      <div class="sections">
        {#each m.sections as s, i}
          {#if s.part && s.part !== m.sections[i - 1]?.part}
            <div class="part">{s.part}</div>
          {/if}
          <button type="button" class="section depth-{s.depth}" class:here={i === at} onclick={() => onOpen(s.path, s.offset)}>
            <span>{s.title}</span><span class="n">{count(s.words)}</span>
          </button>
        {/each}
        <button type="button" class="section new-chapter" onclick={() => onAddChapter(m)}>+ Chapter</button>
      </div>
    {/if}
  {:else}
    <p class="hint">No manuscripts yet. Open a piece from the drawer and make it a manuscript, or start a new one.</p>
  {/each}

  <div class="head drawer-head">
    <h2 class="label">Drawer</h2>
    <button type="button" class="add" onclick={() => onNew('drawer')}>+ New piece</button>
  </div>
  <div class="modes" role="group" aria-label="Drawer order">
    <button type="button" class:on={mode === 'recent'} aria-pressed={mode === 'recent'} onclick={() => setMode('recent')}>Recent</button>
    <button type="button" class:on={mode === 'folders'} aria-pressed={mode === 'folders'} onclick={() => setMode('folders')}>Folders</button>
  </div>
  {#if mode === 'recent'}
    {#each story?.drawer ?? [] as item (item.path)}
      <div class="piece" class:current={open.includes(item.path)}>
        <button type="button" class="open" onclick={() => onOpen(item.path)}>
          <span class="title">{item.title}</span>
          <span class="about">{[item.group, `${count(item.words)} words`, age(item.modified)].filter(Boolean).join(' · ')}</span>
        </button>
        <button type="button" class="promote" title="Make this a manuscript" aria-label="Make {item.title} a manuscript" onclick={() => onDeclare(item.path, true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12 V2 M2.5 6.5 L7 2 L11.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
      </div>
    {:else}
      <p class="hint">The drawer is empty.</p>
    {/each}
  {:else}
    {#each groups as [group, items]}
      <div class="group">
        <span>{group || 'Loose pieces'}</span>
      </div>
      {#each items as item (item.path)}
        <div class="piece" class:current={open.includes(item.path)}>
          <button type="button" class="open" onclick={() => onOpen(item.path)}>
            <span class="title">{item.title}</span>
            <span class="about">{`${count(item.words)} words`}</span>
          </button>
        </div>
      {/each}
    {/each}
  {/if}
</nav>

<style>
  .sidebar {
    width: 290px;
    flex-shrink: 0;
    border-right: 1px solid var(--rule);
    overflow-y: auto;
    padding-bottom: 24px;
  }
  .activity {
    padding: 18px 18px 14px;
    border-bottom: 1px solid var(--rule);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 18px 18px 8px;
  }
  .drawer-head {
    margin-top: 14px;
    border-top: 1px solid var(--rule);
  }
  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 400;
  }
  .add {
    font-size: 12px;
    color: var(--structure);
    background: none;
    border: 0;
    padding: 4px 0;
  }
  .add:hover {
    color: var(--text);
  }
  .manuscript,
  .section,
  .open {
    width: 100%;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: baseline;
    text-align: left;
    color: var(--text);
    background: none;
    border: 0;
  }
  .manuscript {
    font-size: 15px;
    font-weight: 700;
    padding: 8px 18px;
    min-height: 36px;
  }
  .manuscript.current {
    color: var(--structure-soft);
  }
  .manuscript:hover,
  .section:hover,
  .piece:hover {
    background: var(--surface);
  }
  .sections {
    padding-bottom: 6px;
  }
  .part {
    padding: 8px 18px 2px 26px;
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .section {
    font-size: 14px;
    padding: 5px 18px 5px 26px;
    min-height: 30px;
    color: var(--text-soft);
  }
  .section.depth-3 {
    padding-left: 42px;
    font-size: 13px;
  }
  .new-chapter {
    color: var(--structure);
  }
  .section.here {
    color: var(--text);
    box-shadow: inset 2px 0 0 var(--structure);
    background: var(--surface);
  }
  .n {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .modes {
    display: flex;
    gap: 4px;
    padding: 0 16px 8px;
  }
  .modes button {
    flex: 1;
    font-size: 12px;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--rule-strong);
    padding: 6px 4px;
    min-height: 32px;
  }
  .modes button.on {
    color: var(--structure-soft);
    background: var(--structure-deep);
    border-color: var(--structure);
  }
  .piece {
    display: flex;
    align-items: center;
  }
  .piece.current {
    background: var(--surface);
    box-shadow: inset 2px 0 0 var(--structure);
  }
  .open {
    flex: 1;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 7px 4px 7px 18px;
  }
  .title {
    font-size: 14px;
  }
  .about {
    font-size: 12px;
    color: var(--muted);
  }
  .promote {
    width: 32px;
    height: 32px;
    margin-right: 10px;
    display: grid;
    place-items: center;
    color: var(--structure);
    background: none;
    border: 1px solid transparent;
    opacity: 0;
  }
  .piece:hover .promote,
  .promote:focus-visible {
    opacity: 1;
  }
  .promote:hover {
    border-color: var(--structure);
  }
  .group {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 12px 18px 4px;
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .hint {
    margin: 4px 18px 8px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
  }
</style>
