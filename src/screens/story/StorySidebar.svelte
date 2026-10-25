<script lang="ts">
  import { tick } from 'svelte';
  import type { Manuscript, Place, Section, StoryIndex } from '../../lib/story/index';
  import type { Activity } from '../../lib/story/activity';
  import type { WorldFs } from '../../lib/fs/types';
  import { contextMenu, type MenuEntry } from '../../lib/contextMenu.svelte';
  import Heatmap from './Heatmap.svelte';
  import PieceActions from './PieceActions.svelte';

  /**
   * The shelf, the desk, and the drawer (Mike, October 25), as three tabs over the same
   * kind of tree. The desk holds the manuscripts being worked on, the drawer what might be
   * worked on later, and the shelf what is finished. Each manuscript folds to one line.
   * The writing heatmap sits at the foot.
   */
  let {
    fs,
    story,
    activity,
    open,
    cursor,
    onOpen,
    onNew,
    onAddChapter,
    onMoveTo,
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
    onNew: (place: 'desk' | 'drawer') => void;
    onAddChapter: (m: Manuscript) => void;
    /** Moves a manuscript to the desk, the drawer, or the shelf. */
    onMoveTo: (m: Manuscript, place: Place) => void;
    /** Moves a chapter one place earlier (-1) or later (1) in its manuscript. */
    onMoveChapter: (m: Manuscript, s: Section, by: -1 | 1) => void;
    onRenameChapter: (m: Manuscript, s: Section) => void;
    /** Called after a piece moves, with its new path, or null once archived. */
    onMoved: (from: string, to: string | null) => void;
  } = $props();

  const TABS: [Place, string][] = [
    ['shelf', 'Shelf'],
    ['desk', 'Desk'],
    ['drawer', 'Drawer'],
  ];
  const PLACE_NAMES: Record<Place, string> = { desk: 'the desk', drawer: 'the drawer', shelf: 'the shelf' };

  function remembered<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  function remember(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  let tab = $state<Place>(remembered<Place>('immersion.storyTab', 'desk'));
  function setTab(t: Place) {
    tab = t;
    remember('immersion.storyTab', t);
  }

  const shown = $derived((story?.manuscripts ?? []).filter((m) => m.place === tab));
  const counts = $derived(Object.fromEntries(TABS.map(([p]) => [p, (story?.manuscripts ?? []).filter((m) => m.place === p).length])) as Record<Place, number>);

  // Which manuscripts the writer folded or unfolded. Without a choice, a manuscript is
  // unfolded while it is open, or when it is the only one on the desk.
  let folds = $state<Record<string, boolean>>(remembered('immersion.binderFolds', {}));
  function unfolded(m: Manuscript): boolean {
    return folds[m.path] ?? (isOpen(m) || (m.place === 'desk' && counts.desk === 1));
  }
  function fold(m: Manuscript, value: boolean) {
    folds = { ...folds, [m.path]: value };
    remember('immersion.binderFolds', folds);
  }

  function isOpen(m: Manuscript): boolean {
    return open.includes(m.path) || (!!m.book && open.includes(m.book)) || [...m.front, ...m.sections, ...m.back].some((s) => open.includes(s.path));
  }

  /** The chapter or scene the cursor is in, so the tree can mark it. */
  function here(m: Manuscript): string | number {
    if (!cursor) return -1;
    if (m.kind === 'folder') return cursor.path;
    if (cursor.path !== m.path) return -1;
    let found = -1;
    m.sections.forEach((s, i) => {
      if (s.offset !== null && s.offset <= cursor!.pos) found = i;
    });
    return found;
  }

  function openManuscript(m: Manuscript) {
    onOpen(m.kind === 'file' ? m.path : (m.book ?? m.sections[0]?.path ?? m.front[0]?.path ?? m.path));
  }

  // One set of rename and archive forms, aimed at whatever was right-clicked.
  let actions: PieceActions | undefined = $state();
  let target = $state<{ path: string; title: string } | null>(null);
  async function act(what: 'rename' | 'archive', m: Manuscript) {
    target = { path: m.path, title: m.title };
    await tick();
    actions?.start(what);
  }

  function manuscriptMenu(event: MouseEvent, m: Manuscript) {
    const items: MenuEntry[] = [
      { label: 'Open', run: () => openManuscript(m) },
      { label: unfolded(m) ? 'Fold' : 'Unfold', run: () => fold(m, !unfolded(m)) },
      { label: '+ Chapter', run: () => onAddChapter(m) },
      'separator',
    ];
    for (const [p] of TABS) if (p !== m.place) items.push({ label: `Move to ${PLACE_NAMES[p]}`, run: () => onMoveTo(m, p) });
    items.push('separator', { label: 'Rename', run: () => act('rename', m) }, { label: 'Archive', run: () => act('archive', m) });
    contextMenu.show(event, items);
  }

  /** The chapters a section can trade places with. */
  function chapters(m: Manuscript): Section[] {
    return m.kind === 'folder' ? m.sections : m.sections.filter((s) => s.depth === 2);
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

  function count(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
  }
</script>

<nav class="sidebar" aria-label="Shelf, desk, and drawer">
  <div class="tabs" role="tablist" aria-label="Places">
    {#each TABS as [p, label]}
      <button type="button" role="tab" aria-selected={tab === p} class:on={tab === p} onclick={() => setTab(p)}>
        {label}{#if counts[p]}<span class="count">{counts[p]}</span>{/if}
      </button>
    {/each}
  </div>

  <div class="tree" role="tabpanel">
    {#if tab !== 'shelf'}
      <div class="head">
        <button type="button" class="add" onclick={() => onNew(tab === 'desk' ? 'desk' : 'drawer')}>{tab === 'desk' ? '+ New manuscript' : '+ New piece'}</button>
      </div>
    {/if}
    {#each shown as m (m.path)}
      {@const at = here(m)}
      {@const unfold = unfolded(m)}
      <div class="manuscript-row" class:current={isOpen(m)} oncontextmenu={(e) => manuscriptMenu(e, m)} role="presentation">
        <button type="button" class="fold" aria-label="{unfold ? 'Fold' : 'Unfold'} {m.title}" aria-expanded={unfold} onclick={() => fold(m, !unfold)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class:down={unfold}><path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
        <button type="button" class="manuscript" onclick={() => openManuscript(m)}>
          <span>{m.title}</span><span class="n">{count(m.words)}</span>
        </button>
      </div>
      {#if unfold}
        <div class="sections">
          {#each m.front as s}
            <button type="button" class="section matter" class:here={at === s.path} onclick={() => onOpen(s.path, null, s.title)}>
              <span>{s.title}</span>
            </button>
          {/each}
          {#each m.sections as s, i}
            {#if s.part && s.part !== m.sections[i - 1]?.part}
              <div class="part">{s.part}</div>
            {/if}
            <button
              type="button"
              class="section depth-{s.depth}"
              class:here={at === i || at === s.path}
              onclick={() => onOpen(s.path, s.offset, s.title)}
              oncontextmenu={(e) => sectionMenu(e, m, s)}>
              <span>{s.title}</span><span class="n">{count(s.words)}</span>
            </button>
          {/each}
          {#each m.back as s}
            <button type="button" class="section matter" class:here={at === s.path} onclick={() => onOpen(s.path, null, s.title)}>
              <span>{s.title}</span>
            </button>
          {/each}
          {#if m.place === 'desk'}
            <button type="button" class="section new-chapter" onclick={() => onAddChapter(m)}>+ Chapter</button>
          {/if}
        </div>
      {/if}
    {:else}
      <p class="hint">
        {#if story?.missing}
          The stories folder is missing.
        {:else if tab === 'desk'}
          Nothing on the desk. Start a new manuscript, or right-click one in the drawer and move it here.
        {:else if tab === 'drawer'}
          The drawer is empty.
        {:else}
          Nothing on the shelf yet. Finished manuscripts go here.
        {/if}
      </p>
    {/each}
  </div>

  {#if activity}
    <div class="activity"><Heatmap {activity} weeks={17} /></div>
  {/if}
</nav>

{#if target && story}
  <PieceActions bind:this={actions} {fs} path={target.path} title={target.title} root={story.root} button={false} {onMoved} />
{/if}

<style>
  .sidebar {
    width: 290px;
    flex-shrink: 0;
    border-right: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 16px 16px 8px;
  }
  .tabs button {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--rule-strong);
    padding: 8px 4px;
    min-height: 38px;
  }
  .tabs button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    border-color: var(--selected-border);
  }
  .count {
    font-family: var(--font-label);
    font-size: 11px;
    opacity: 0.7;
  }
  .tree {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 18px;
  }
  .activity {
    padding: 14px 18px 16px;
    border-top: 1px solid var(--rule);
  }
  .head {
    display: flex;
    justify-content: flex-end;
    padding: 4px 18px 6px;
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
  .section {
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
  .manuscript-row:hover,
  .section:hover {
    background: var(--surface);
  }
  .fold {
    width: 26px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    padding: 0 0 0 8px;
    color: var(--muted);
    background: none;
    border: 0;
  }
  .fold:hover {
    color: var(--text);
  }
  .fold svg {
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
    color: var(--selected-fg);
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
  .section.matter {
    font-style: italic;
    color: var(--muted);
  }
  .new-chapter {
    color: var(--structure);
  }
  .section.here {
    color: var(--selected-fg);
    box-shadow: inset 2px 0 0 var(--selected-border);
    background: var(--selected-bg);
  }
  .n {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .hint {
    margin: 8px 18px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
  }
</style>
