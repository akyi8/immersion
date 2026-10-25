<script lang="ts">
  import { tick } from 'svelte';
  import type { Manuscript, Section, StoryIndex } from '../../lib/story/index';
  import type { Activity } from '../../lib/story/activity';
  import type { WorldFs } from '../../lib/fs/types';
  import { contextMenu, type MenuEntry } from '../../lib/contextMenu.svelte';
  import Heatmap from './Heatmap.svelte';
  import PieceActions from './PieceActions.svelte';

  /**
   * The binder and the drawer (Mike, October 24). The binder holds the manuscripts the
   * writer declared, each with its chapters. The drawer holds every other piece in the
   * stories folder, most recently touched first, so half-started work stays near at hand
   * without crowding the book. A manuscript folds to one line, and one put away moves to
   * the shelf at the foot of the binder (Mike, October 25).
   */
  let {
    fs,
    story,
    activity,
    open,
    cursor,
    onOpen,
    onDeclare,
    onNew,
    onAddChapter,
    onShelve,
    onMoveChapter,
    onRenameChapter,
    onMoved,
  }: {
    fs: WorldFs;
    story: StoryIndex | null;
    activity: Activity | null;
    /** What is open in the Story module's panes. */
    open: string[];
    cursor: { path: string; pos: number } | null;
    onOpen: (path: string, offset?: number | null, title?: string) => void;
    onDeclare: (path: string, manuscript: boolean) => void;
    onNew: (kind: 'manuscript' | 'drawer') => void;
    onAddChapter: (m: Manuscript) => void;
    /** Puts a manuscript away on the shelf, or takes it back out. */
    onShelve: (m: Manuscript, shelved: boolean) => void;
    /** Moves a chapter one place earlier (-1) or later (1) in its manuscript. */
    onMoveChapter: (m: Manuscript, s: Section, by: -1 | 1) => void;
    onRenameChapter: (m: Manuscript, s: Section) => void;
    /** Called after a piece's file moves, with its new path, or null once archived. */
    onMoved: (from: string, to: string | null) => void;
  } = $props();

  // Which manuscripts the writer folded or unfolded. Without a choice, a manuscript is
  // unfolded while it is open, or when it is the only one in the binder.
  function savedFolds(): Record<string, boolean> {
    try {
      return JSON.parse(localStorage.getItem('immersion.binderFolds') ?? '{}');
    } catch {
      return {};
    }
  }
  let folds = $state<Record<string, boolean>>(savedFolds());
  function unfolded(m: Manuscript): boolean {
    return folds[m.path] ?? (isOpen(m) || active.length === 1);
  }
  function fold(m: Manuscript, open: boolean) {
    folds = { ...folds, [m.path]: open };
    try {
      localStorage.setItem('immersion.binderFolds', JSON.stringify(folds));
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  const active = $derived((story?.manuscripts ?? []).filter((m) => !m.shelved));
  const shelved = $derived((story?.manuscripts ?? []).filter((m) => m.shelved));
  let shelfOpen = $state(false);

  // One set of rename and archive forms, aimed at whatever was right-clicked.
  let actions: PieceActions | undefined = $state();
  let target = $state<{ path: string; title: string; manuscript: boolean } | null>(null);
  async function act(what: 'rename' | 'archive', path: string, title: string, manuscript: boolean) {
    target = { path, title, manuscript };
    await tick();
    actions?.start(what);
  }

  function openManuscript(m: Manuscript) {
    onOpen(m.kind === 'file' ? m.path : (m.sections[0]?.path ?? m.path));
  }

  function manuscriptMenu(event: MouseEvent, m: Manuscript) {
    const items: MenuEntry[] = [{ label: 'Open', run: () => openManuscript(m) }];
    if (!m.shelved) items.push({ label: unfolded(m) ? 'Fold' : 'Unfold', run: () => fold(m, !unfolded(m)) }, { label: '+ Chapter', run: () => onAddChapter(m) });
    items.push(
      'separator',
      { label: m.shelved ? 'Take off the shelf' : 'Put away on the shelf', run: () => onShelve(m, !m.shelved) },
      { label: 'Rename', run: () => act('rename', m.path, m.title, true), disabled: m.kind === 'folder' },
      { label: 'Back to the drawer', run: () => onDeclare(m.path, false), disabled: m.kind === 'folder' },
      { label: 'Archive', run: () => act('archive', m.path, m.title, true), disabled: m.kind === 'folder' },
    );
    contextMenu.show(event, items);
  }

  /** The chapters a section can trade places with: its neighbours at the same depth. */
  function chapters(m: Manuscript): Section[] {
    return m.sections.filter((s) => s.depth === 2 || m.kind === 'folder');
  }

  function sectionMenu(event: MouseEvent, m: Manuscript, s: Section) {
    const list = chapters(m);
    const at = list.indexOf(s);
    const chapter = at >= 0;
    contextMenu.show(event, [
      { label: 'Open', run: () => onOpen(s.path, s.offset, s.title) },
      'separator',
      { label: 'Move earlier', run: () => onMoveChapter(m, s, -1), disabled: !chapter || at === 0 },
      { label: 'Move later', run: () => onMoveChapter(m, s, 1), disabled: !chapter || at === list.length - 1 },
      { label: 'Rename chapter', run: () => onRenameChapter(m, s), disabled: !chapter },
    ]);
  }

  function pieceMenu(event: MouseEvent, item: StoryIndex['drawer'][number]) {
    contextMenu.show(event, [
      { label: 'Open', run: () => onOpen(item.path) },
      { label: 'Make this a manuscript', run: () => onDeclare(item.path, true) },
      'separator',
      { label: 'Rename', run: () => act('rename', item.path, item.title, false) },
      { label: 'Archive', run: () => act('archive', item.path, item.title, false) },
    ]);
  }

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
  {#each active as m (m.path)}
    {@const at = here(m)}
    {@const shown = unfolded(m)}
    <div class="manuscript-row" class:current={isOpen(m)} oncontextmenu={(e) => manuscriptMenu(e, m)} role="presentation">
      <button type="button" class="fold" aria-label="{shown ? 'Fold' : 'Unfold'} {m.title}" aria-expanded={shown} onclick={() => fold(m, !shown)}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class:down={shown}><path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
      </button>
      <button type="button" class="manuscript" onclick={() => openManuscript(m)}>
        <span>{m.title}</span><span class="n">{count(m.words)}</span>
      </button>
    </div>
    {#if shown}
      <div class="sections">
        {#each m.sections as s, i}
          {#if s.part && s.part !== m.sections[i - 1]?.part}
            <div class="part">{s.part}</div>
          {/if}
          <button type="button" class="section depth-{s.depth}" class:here={i === at} onclick={() => onOpen(s.path, s.offset, s.title)} oncontextmenu={(e) => sectionMenu(e, m, s)}>
            <span>{s.title}</span><span class="n">{count(s.words)}</span>
          </button>
        {/each}
        <button type="button" class="section new-chapter" onclick={() => onAddChapter(m)}>+ Chapter</button>
      </div>
    {/if}
  {:else}
    <p class="hint">
      {shelved.length ? 'Every manuscript is on the shelf below.' : 'No manuscripts yet. Open a piece from the drawer and make it a manuscript, or start a new one.'}
    </p>
  {/each}
  {#if shelved.length}
    <button type="button" class="shelf-head" aria-expanded={shelfOpen} onclick={() => (shelfOpen = !shelfOpen)}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class:down={shelfOpen}><path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
      <span>On the shelf</span><span class="n">{shelved.length}</span>
    </button>
    {#if shelfOpen}
      {#each shelved as m (m.path)}
        <div class="piece shelved" class:current={isOpen(m)} oncontextmenu={(e) => manuscriptMenu(e, m)} role="presentation">
          <button type="button" class="open" onclick={() => openManuscript(m)}>
            <span class="title">{m.title}</span>
            <span class="about">{[`${count(m.words)} words`, age(m.modified)].filter(Boolean).join(' · ')}</span>
          </button>
          <button type="button" class="promote" title="Take off the shelf" aria-label="Take {m.title} off the shelf" onclick={() => onShelve(m, false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12 V2 M2.5 6.5 L7 2 L11.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
          </button>
        </div>
      {/each}
    {/if}
  {/if}

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
      <div class="piece" class:current={open.includes(item.path)} oncontextmenu={(e) => pieceMenu(e, item)} role="presentation">
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
        <div class="piece" class:current={open.includes(item.path)} oncontextmenu={(e) => pieceMenu(e, item)} role="presentation">
          <button type="button" class="open" onclick={() => onOpen(item.path)}>
            <span class="title">{item.title}</span>
            <span class="about">{`${count(item.words)} words`}</span>
          </button>
        </div>
      {/each}
    {/each}
  {/if}
</nav>

{#if target && story}
  <PieceActions
    bind:this={actions}
    {fs}
    path={target.path}
    title={target.title}
    root={story.root}
    manuscript={target.manuscript}
    button={false}
    {onDeclare}
    {onMoved} />
{/if}

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
  .manuscript-row {
    display: flex;
    align-items: stretch;
  }
  .manuscript-row:hover {
    background: var(--surface);
  }
  .fold,
  .shelf-head {
    color: var(--muted);
    background: none;
    border: 0;
  }
  .fold {
    width: 26px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    padding: 0 0 0 8px;
  }
  .fold:hover {
    color: var(--text);
  }
  .fold svg,
  .shelf-head svg {
    transition: transform 120ms;
  }
  svg.down {
    transform: rotate(90deg);
  }
  .manuscript {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    font-weight: 700;
    padding: 8px 18px 8px 4px;
    min-height: 36px;
  }
  .manuscript-row.current .manuscript {
    color: var(--structure-soft);
  }
  .shelf-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px 6px 16px;
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
  }
  .shelf-head span:first-of-type {
    flex: 1;
  }
  .shelf-head:hover {
    color: var(--text);
  }

  .section:hover,
  .piece:hover {
    background: var(--surface);
  }
  .sections {
    padding-bottom: 6px;
  }
  .part {
    padding: 8px 18px 2px 38px;
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .section {
    font-size: 14px;
    padding: 5px 18px 5px 38px;
    min-height: 30px;
    color: var(--text-soft);
  }
  .section.depth-3 {
    padding-left: 54px;
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
