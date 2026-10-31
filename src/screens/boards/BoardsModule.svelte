<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import { buildStoryIndex, filesOf, titleFromName, type StoryIndex } from '../../lib/story/index';
  import { saveNow } from '../../lib/saves';
  import { openInWindow } from '../../lib/windows';
  import { ui } from '../../lib/ui.svelte';
  import Panes from '../Panes.svelte';
  import TimelineView from '../world/TimelineView.svelte';
  import SeriesPane from '../story/SeriesPane.svelte';
  import EntryView from '../world/EntryView.svelte';
  import ManuscriptPane from '../story/ManuscriptPane.svelte';
  import ManuscriptBoard from './ManuscriptBoard.svelte';
  import { counted, whenEdited } from '../../lib/story/book';
  import { STRUCTURES } from '../../lib/story/guide';

  /**
   * Boards (Mike, October 26): every board in the world in one place. The wiki's timeline,
   * each series' board, and each manuscript's board are listed in the sidebar, and a board
   * opens in a pane. An entry or a chapter opened from a board opens beside it here, so
   * planning and reading sit side by side, and World and Story stay as they were left.
   */
  let {
    index,
    fs,
    nav,
    worldName,
    storiesDir,
    rebuild,
  }: { index: WikiIndex; fs: WorldFs; nav: Navigator; worldName: string; storiesDir: string; rebuild: () => Promise<void> } = $props();

  const TIMELINE = '@timeline';
  const SERIES = '@series:';
  const BOARD = '@board:';

  let story = $state.raw<StoryIndex | null>(null);
  async function refresh() {
    try {
      story = await buildStoryIndex(fs, storiesDir);
    } catch {
      story = null;
    }
  }
  onMount(() => {
    refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    return fs.onChange((paths) => {
      if (!paths.some((p) => p.startsWith(storiesDir))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    });
  });

  const series = $derived([...new Set((story?.manuscripts ?? []).map((m) => m.series).filter((s): s is string => !!s))].sort());
  const booksIn = (name: string) => (story?.manuscripts ?? []).filter((m) => m.series === name).length;
  /** What one book of a series is called, such as Episode (Mike, October 31). */
  const wordOf = (name: string) => (story?.manuscripts ?? []).find((m) => m.series === name)?.seriesWord ?? 'Story';
  const manuscripts = $derived((story?.manuscripts ?? []).filter((m) => m.kind === 'folder' && m.sections.length));
  // The home page's cards say what each board holds and when it was last touched, and the
  // ones touched most recently come first (Mike, October 31).
  const PLACES = { desk: 'On the desk', drawer: 'In the drawer', shelf: 'On the shelf' };
  const structureName = (id: string | null) => STRUCTURES.find((s) => s.id === id)?.name ?? null;
  const wordsIn = (name: string) => (story?.manuscripts ?? []).filter((m) => m.series === name).reduce((n, m) => n + m.words, 0);
  const editedIn = (name: string) => Math.max(0, ...(story?.manuscripts ?? []).filter((m) => m.series === name).map((m) => m.modified ?? 0)) || null;
  const recentFirst = $derived([...manuscripts].sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0)));
  const seriesRecentFirst = $derived([...series].sort((a, b) => (editedIn(b) ?? 0) - (editedIn(a) ?? 0)));
  const eras = $derived(index.all().filter((e) => e.when && e.era).length);
  const words = (n: number) => (n ? `${n.toLocaleString()} words` : '');
  const line = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(' · ');

  const dated = $derived(index.all().filter((e) => e.when).length);
  const pieces = $derived(new Set((story?.manuscripts ?? []).flatMap(filesOf)));
  const manuscriptOf = (id: string) => (id.startsWith(BOARD) ? (story?.manuscripts.find((m) => m.path === id.slice(BOARD.length)) ?? null) : null);
  const row = $derived(nav.panes.filter((id) => id === TIMELINE || id.startsWith(SERIES) || manuscriptOf(id) || index.get(id) || pieces.has(id)));

  function label(id: string): string {
    if (id === TIMELINE) return 'Timeline';
    if (id.startsWith(SERIES)) return id.slice(SERIES.length);
    const m = manuscriptOf(id);
    if (m) return m.title;
    const entry = index.get(id);
    if (entry) return entry.name;
    for (const x of story?.manuscripts ?? []) {
      if (x.path === id || x.book === id) return x.title;
      const s = [...x.front, ...x.sections, ...x.back].find((y) => y.path === id);
      if (s) return s.title;
    }
    return titleFromName(id.split('/').pop() ?? id);
  }

  async function toWindow(id: string) {
    await saveNow(id);
    openInWindow(id, label(id));
    nav.close(id);
  }

  const isOpen = (id: string) => nav.panes.includes(id);
</script>

<div class="boards">
  {#if !ui.full}
    <nav class="sidebar" aria-label="Boards">
      <h2 class="label">Timeline</h2>
      <button type="button" class="board" class:on={isOpen(TIMELINE)} onclick={() => nav.open(TIMELINE)}>
        <span>{worldName}</span><span class="n">{dated} dated</span>
      </button>
      <h2 class="label">Series</h2>
      {#each series as name (name)}
        <button type="button" class="board" class:on={isOpen(SERIES + name)} onclick={() => nav.open(SERIES + name)}>
          <span>{name}</span><span class="n">{counted(booksIn(name), wordOf(name))}</span>
        </button>
      {:else}
        <p class="hint">No series yet. A book joins a series from its title page, or start one with + New in Story.</p>
      {/each}
      <h2 class="label">Manuscripts</h2>
      {#each manuscripts as m (m.path)}
        <button type="button" class="board" class:on={isOpen(BOARD + m.path)} onclick={() => nav.open(BOARD + m.path)}>
          <span>{m.title}</span><span class="n">{m.partWord === 'Chapter' ? `${m.sections.length} ch` : counted(m.sections.length, m.partWord)}</span>
        </button>
      {:else}
        <p class="hint">No manuscripts yet.</p>
      {/each}
    </nav>
  {/if}
  {#if row.length}
    <Panes {nav} ids={row} {label} onWindow={toWindow}>
      {#snippet pane(id, i, next, full)}
        {#if id === TIMELINE}
          <TimelineView {index} {fs} {rebuild} world={worldName} onOpen={(target) => nav.open(target, i)} />
        {:else if id.startsWith(SERIES)}
          <SeriesPane
            {fs}
            root={storiesDir}
            series={id.slice(SERIES.length)}
            {index}
            books={booksIn(id.slice(SERIES.length))}
            words={wordsIn(id.slice(SERIES.length))}
            onOpenEntry={(entry) => nav.open(entry, i)}
            onOpenBook={(book) => nav.open(book, i)}
            onChanged={refresh}
            onRenamed={async (name) => {
              await refresh();
              nav.replace(id, SERIES + name);
            }} />
        {:else if manuscriptOf(id)}
          <ManuscriptBoard
            {fs}
            manuscript={manuscriptOf(id)!}
            {index}
            onOpenEntry={(entry) => nav.open(entry, i)}
            onWrite={(path) => nav.open(path, i)}
            onRenamed={async (from, to) => {
              await refresh();
              nav.replace(id, BOARD + to);
              nav.replacePrefix(from, to);
            }} />
        {:else if index.get(id)}
          <EntryView {index} {fs} {id} view="narrator" {next} fresh={false} onOpen={(target) => nav.open(target, i)} onWindow={() => toWindow(id)} />
        {:else}
          <ManuscriptPane
            {fs}
            {index}
            {story}
            {id}
            {next}
            drafting={full}
            onOpen={(target) => nav.open(target, i)}
            onCursor={() => {}}
            onMoveTo={() => {}}
            onOpenPiece={(path) => nav.open(path, i)}
            onWindow={() => toWindow(id)}
            onSeries={(name) => nav.open(SERIES + name, i)} />
        {/if}
      {/snippet}
    </Panes>
  {:else}
    <main class="home sheet">
      <h1>Boards</h1>
      <p>Every board in {worldName}: the timeline of its history, each series, and each manuscript, with When along one side and threads along the other.</p>
      <div class="cards">
        <button type="button" class="card" onclick={() => nav.open(TIMELINE)}>
          <span class="kind">Timeline</span><span class="name">{worldName}</span>
          <span class="n">{line(`${dated} dated ${dated === 1 ? 'entry' : 'entries'}`, eras > 0 && counted(eras, 'era'))}</span>
        </button>
        {#each seriesRecentFirst as name (name)}
          <button type="button" class="card" onclick={() => nav.open(SERIES + name)}>
            <span class="kind">Series</span><span class="name">{name}</span>
            <span class="n">{line(counted(booksIn(name), wordOf(name)), words(wordsIn(name)))}</span>
            <span class="n when">{whenEdited(editedIn(name))}</span>
          </button>
        {/each}
        {#each recentFirst as m (m.path)}
          <button type="button" class="card" onclick={() => nav.open(BOARD + m.path)}>
            <span class="kind">{line('Manuscript', PLACES[m.place])}</span><span class="name">{m.title}</span>
            <span class="n">{line(counted(m.sections.length, m.partWord), words(m.words), structureName(m.structure))}</span>
            <span class="n when">{whenEdited(m.modified)}</span>
          </button>
        {/each}
      </div>
    </main>
  {/if}
</div>

<style>
  .boards {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .sidebar {
    width: 290px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--line);
    padding: 12px 0 24px;
  }
  .sidebar .label {
    margin: 16px 18px 6px;
    font-size: calc(11px * var(--type));
  }
  .board {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    text-align: left;
    font-size: calc(15px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    padding: 7px 18px;
    min-height: 34px;
  }
  .board:hover {
    background: var(--surface);
  }
  .board.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    box-shadow: inset 2px 0 0 var(--selected-border);
  }
  .n {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
    flex-shrink: 0;
  }
  .hint {
    margin: 2px 18px 6px;
    font-size: calc(13px * var(--type));
    line-height: 1.5;
    color: var(--muted);
  }
  .home {
    flex: 1;
    overflow-y: auto;
    padding: 36px 48px 60px;
  }
  .home h1 {
    color: var(--title);
    margin: 0 0 12px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(60px * var(--type));
    letter-spacing: 0.02em;
  }
  .home p {
    max-width: 640px;
    color: var(--text-soft);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
    margin-top: 24px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    padding: 18px 18px 16px;
    min-height: 120px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--round-box);
  }
  .card:hover {
    border-color: var(--hover-edge);
  }
  .kind {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--structure);
  }
  .name {
    font-family: var(--font-display);
    font-size: calc(30px * var(--type));
    line-height: 1.05;
    color: var(--title);
  }
  .card .when {
    margin-top: auto;
    opacity: 0.8;
  }
</style>
