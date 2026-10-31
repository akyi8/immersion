<script lang="ts">
  import { counted } from '../../lib/story/book';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Manuscript, Place, StoryIndex } from '../../lib/story/index';
  import { folderSource, type OutlineSource } from '../../lib/story/outlineSource';
  import EntryEditor from '../world/EntryEditor.svelte';
  import OutlineView from './OutlineView.svelte';
  import PieceActions from './PieceActions.svelte';
  import OutlineAside from './OutlineAside.svelte';
  import TitlePage from './TitlePage.svelte';
  import { beats } from '../../lib/beats.svelte';
  import { onMount } from 'svelte';
  import type { Thread } from '../../lib/story/threads';
  import type { EditorView } from '@codemirror/view';

  /**
   * A piece of writing open in the Story module: a manuscript's title page, one of its
   * chapters or front and back pages, or a note. It uses the same editor as wiki entries,
   * so names link and open beside it.
   */
  let {
    fs,
    index,
    story,
    id,
    next,
    fresh = false,
    drafting = false,
    jump = null,
    onOpen,
    onCursor,
    onMoveTo,
    onOpenPiece,
    onMakeEntry,
    onMoved,
    onWindow,
    onSeries,
    onMakeManuscript,
    defaults = { profile: '', author: '', copyright: '' },
    onDefaults = () => {},
  }: {
    fs: WorldFs;
    index: WikiIndex;
    story: StoryIndex | null;
    id: string;
    next: string | null;
    fresh?: boolean;
    drafting?: boolean;
    jump?: { offset: number; at: number; title?: string } | null;
    onOpen: (id: string) => void;
    onCursor: (pos: number) => void;
    /** Moves a manuscript to the desk, the drawer, or the shelf. */
    onMoveTo: (m: Manuscript, place: Place) => void;
    /** Opens a piece of writing, at a chapter when `offset` is given. */
    onOpenPiece: (path: string, offset: number | null, title?: string) => void;
    /** Starts a wiki entry for a name selected in the writing. */
    onMakeEntry?: (name: string) => void;
    /** Called after the piece is renamed or archived (null). */
    onMoved?: (from: string, to: string | null) => void;
    /** Moves the page into a reading window of its own. */
    onWindow?: () => void;
    /** Opens a series board beside this pane. */
    onSeries?: (series: string) => void;
    /** Starts making a note into a manuscript. */
    onMakeManuscript?: (note: Manuscript) => void;
    /** The world's author profile, or author and copyright holder, for new manuscripts. */
    defaults?: { profile: string; author: string; copyright: string };
    onDefaults?: () => void;
  } = $props();

  const PLACE_LABELS: Record<Place, string> = { desk: 'On the desk', drawer: 'In the drawer', shelf: 'On the shelf' };

  /** The manuscript this pane's file belongs to. */
  const owner = $derived(
    story?.manuscripts.find((m) => m.path === id || m.book === id || [...m.sections, ...m.front, ...m.back].some((s) => s.path === id)) ?? null,
  );

  // Writing and outline are two views of the same chapters (Mike, October 25).
  let mode = $state<'write' | 'outline'>('write');
  let outlineFocus = $state<number | null>(null);

  // The beats beside the writing, switched from the document toolbar (Mike, October 26).
  const aside = $derived(beats.on);
  let editor = $state.raw<EditorView | null>(null);
  let cursor = $state(0);

  /** The chapters behind outline view: this file's headings, or the files of its folder. */
  const source = $derived.by((): OutlineSource | null => {
    // A note is a single page, so it has no board (Mike, October 26).
    if (!owner || owner.kind === 'file') return null;
    return id === owner.book || owner.sections.some((s) => s.path === id) ? folderSource(fs, owner) : null;
  });

  // The manuscript's threads, for the outline beside the writing. They are read again
  // when outline view closes and when files change.
  let threads = $state<Thread[]>([{ key: '', name: 'Main plot' }]);
  function readThreads() {
    source?.threads().then((t) => (threads = t)).catch(() => {});
  }
  $effect(() => {
    void mode;
    readThreads();
  });
  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return fs.onChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(readThreads, 400);
    });
  });

  /** Opens outline view at the chapter whose folded outline was clicked. */
  function showOutline(at: number) {
    if (owner?.kind === 'file') {
      const chapters = owner.sections.filter((s) => s.depth === 2);
      let index = 0;
      chapters.forEach((s, i) => {
        if (s.offset !== null && s.offset <= at) index = i;
      });
      outlineFocus = index;
    } else {
      outlineFocus = owner ? owner.sections.findIndex((s) => s.path === id) : null;
    }
    mode = 'outline';
  }

  const about = $derived.by(() => {
    const m = owner;
    if (!m) return null;
    const where = PLACE_LABELS[m.place];
    const chapters = m.kind === 'file' ? m.sections.filter((s) => s.depth === 2).length : m.sections.length;
    const summary = `${words(m.words)}${chapters ? ` · ${counted(chapters, m.partWord)}` : ''}`;
    if (m.kind === 'file') return { kind: 'note' as const, title: m.title, label: `${where} · Note`, meta: words(m.words) };
    if (id === m.book) return { kind: 'book' as const, title: m.title, label: `${where} · Title page`, meta: summary };
    const i = m.sections.findIndex((s) => s.path === id);
    if (i >= 0) {
      const s = m.sections[i];
      return { kind: 'chapter' as const, title: s.title, label: `${m.title}${s.part ? ` · ${s.part}` : ''} · ${i + 1} of ${m.sections.length}`, meta: words(s.words) };
    }
    const matter = [...m.front, ...m.back].find((s) => s.path === id)!;
    return { kind: 'matter' as const, title: matter.title, label: `${m.title} · ${m.front.includes(matter) ? 'Before the story' : 'After the story'}`, meta: words(matter.words) };
  });

  function words(n: number): string {
    return `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`;
  }
</script>

{#if about}
  <article class:drafting>
    {#if !drafting || mode === 'outline'}
      <header>
        <div class="label">{about.label}</div>
        {#if about.kind !== 'book' || mode === 'outline'}<h1>{about.title}</h1>{/if}
        <div class="row">
          {#if source}
            <div class="views" role="group" aria-label="View">
              <button type="button" class:on={mode === 'write'} aria-pressed={mode === 'write'} onclick={() => (mode = 'write')}>Write</button>
              <button type="button" class:on={mode === 'outline'} aria-pressed={mode === 'outline'} onclick={() => ((outlineFocus = null), (mode = 'outline'))}>Board</button>
            </div>
          {/if}
          <span class="meta">{about.meta}</span>
          {#if owner?.place === 'drawer' && (about.kind === 'note' || about.kind === 'book')}
            <button type="button" class="action" onclick={() => onMoveTo(owner!, 'desk')}>Move to the desk</button>
          {/if}
          {#if about.kind === 'note' && owner && onMakeManuscript}
            <button type="button" class="action" onclick={() => onMakeManuscript(owner!)}>Make it a manuscript…</button>
          {/if}
          {#if onMoved && story && owner}
            <PieceActions
              {fs}
              path={owner.path}
              title={about.title}
              root={story.root}
              {onMoved}
              {onWindow}
              windowOnly={about.kind === 'chapter' || about.kind === 'matter'} />
          {/if}
        </div>
      </header>
    {/if}
    {#if mode === 'outline' && source}
      <OutlineView
        {fs}
        {source}
        partWord={owner?.partWord}
        focus={outlineFocus}
        onWrite={(card) => {
          mode = 'write';
          onOpenPiece(card.path, card.offset, card.title);
        }}
        onAdded={() => {}} />
    {:else if about.kind === 'book' && owner}
      <TitlePage {fs} book={id} folder={owner.path} {defaults} {onDefaults} {onSeries} onMoved={(from, to) => onMoved?.(from, to)} />
      <nav class="contents" aria-label="Contents">
        {#each [...owner.front, ...owner.sections, ...owner.back] as s}
          <button type="button" class:matter={!owner.sections.includes(s)} onclick={() => onOpenPiece(s.path, null, s.title)}>
            <span>{s.title}</span><span class="n">{s.words.toLocaleString()}</span>
          </button>
        {/each}
      </nav>
    {:else}
      <div class="room">
      <div class="writing" class:with-aside={aside && !!source}>
        <div class="book">
          {#key id}
            <EntryEditor
              {fs}
              {index}
              {id}
              title={about.title}
              autofocus={fresh}
              {onOpen}
              {next}
              {jump}
              onCursor={(pos) => {
                cursor = pos;
                onCursor(pos);
              }}
              onOutline={source ? showOutline : undefined}
              {onMakeEntry}
              onReady={(v) => (editor = v)} />
          {/key}
        </div>
        {#if aside && source}
          <OutlineAside
            view={editor}
            {index}
            {threads}
            {fs}
            onOpen={onOpen}
            {cursor}
            wholeBook={false}
            onOpenOutline={(i) => {
              outlineFocus = owner?.sections.findIndex((s) => s.path === id) ?? null;
              mode = 'outline';
            }} />
        {/if}
      </div>
      </div>
    {/if}
  </article>
{/if}

<style>
  article {
    max-width: 720px;
  }
  article:has(:global(.grid)) {
    max-width: none;
  }
  article:has(.with-aside) {
    max-width: 1000px;
  }
  /* The outline sits beside the writing when there is room, and steps away in a narrow pane. */
  .room {
    container-type: inline-size;
  }
  .writing.with-aside {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 28px;
    align-items: start;
  }
  @container (max-width: 760px) {
    .writing.with-aside {
      display: block;
    }
    .writing.with-aside :global(.outline-aside) {
      display: none;
    }
  }
  .views {
    display: flex;
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .views button {
    font-size: calc(13px * var(--type));
    color: var(--muted);
    background: none;
    border: 0;
    padding: 6px 12px;
    min-height: 32px;
  }
  .views button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  article.drafting {
    margin: 0 auto;
  }
  header {
    margin-bottom: 22px;
  }
  h1 {
    color: var(--title);
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(60px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }
  .meta {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  /* In a book, chapters and scenes read as headings, not as the wiki's small labels. */
  .book :global(.cm-h1),
  .book :global(.cm-h2) {
    font-family: var(--font-display) !important;
    font-size: 2.1em !important;
    letter-spacing: 0.02em !important;
    line-height: 1.15 !important;
    text-transform: none !important;
    color: var(--text) !important;
    padding-top: 1.6em !important;
  }
  .book :global(.cm-h3) {
    font-family: var(--font-body) !important;
    font-size: 1em !important;
    font-weight: 700;
    letter-spacing: 0 !important;
    text-transform: none !important;
    color: var(--text-soft) !important;
    padding-top: 1.2em !important;
  }
  .action {
    font-size: calc(13px * var(--type));
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .action {
    color: var(--structure);
  }
  .contents {
    display: flex;
    flex-direction: column;
    margin-top: 24px;
    border-top: 1px solid var(--line);
  }
  .contents button {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
    font-size: calc(16px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--line);
    padding: 10px 4px;
  }
  .contents button:hover {
    background: var(--surface);
  }
  .contents .matter {
    font-style: italic;
    color: var(--text-soft);
  }
  .contents .n {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .action:hover {
    border-color: var(--hover-edge);
    color: var(--text);
  }
</style>
