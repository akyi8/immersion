<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { StoryIndex } from '../../lib/story/index';
  import { fileSource, folderSource, type OutlineSource } from '../../lib/story/outlineSource';
  import EntryEditor from '../world/EntryEditor.svelte';
  import OutlineView from './OutlineView.svelte';

  /**
   * A piece of writing open in the Story module: a manuscript, one chapter of a
   * manuscript kept as a folder, or something from the drawer. It uses the same editor
   * as wiki entries, so names link and open beside it.
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
    onDraft,
    onDeclare,
    onOpenPiece,
    onMakeEntry,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    story: StoryIndex | null;
    id: string;
    next: string | null;
    fresh?: boolean;
    drafting?: boolean;
    jump?: { offset: number; at: number } | null;
    onOpen: (id: string) => void;
    onCursor: (pos: number) => void;
    onDraft: () => void;
    /** Moves a piece into the binder, or back to the drawer. */
    onDeclare: (path: string, manuscript: boolean) => void;
    /** Opens a piece of writing, at a chapter when `offset` is given. */
    onOpenPiece: (path: string, offset: number | null) => void;
    /** Starts a wiki entry for a name selected in the writing. */
    onMakeEntry?: (name: string) => void;
  } = $props();

  // Writing and outline are two views of the same chapters (Mike, October 25).
  let mode = $state<'write' | 'outline'>('write');
  let outlineFocus = $state<number | null>(null);

  /** The chapters behind outline view: this file's headings, or the files of its folder. */
  const source = $derived.by((): OutlineSource | null => {
    if (!story) return null;
    if (story.manuscripts.some((m) => m.kind === 'file' && m.path === id)) return fileSource(fs, id);
    const folder = story.manuscripts.find((m) => m.kind === 'folder' && m.sections.some((s) => s.path === id));
    return folder ? folderSource(fs, folder) : null;
  });

  /** Opens outline view at the chapter whose folded outline was clicked. */
  function showOutline(at: number) {
    const m = story?.manuscripts.find((x) => x.path === id);
    if (m?.kind === 'file') {
      const chapters = m.sections.filter((s) => s.depth === 2);
      let index = 0;
      chapters.forEach((s, i) => {
        if (s.offset !== null && s.offset <= at) index = i;
      });
      outlineFocus = index;
    } else {
      const folder = story?.manuscripts.find((x) => x.sections.some((s) => s.path === id));
      outlineFocus = folder ? folder.sections.findIndex((s) => s.path === id) : null;
    }
    mode = 'outline';
  }

  const about = $derived.by(() => {
    if (!story) return null;
    const whole = story.manuscripts.find((m) => m.kind === 'file' && m.path === id);
    if (whole) {
      const chapters = whole.sections.filter((s) => s.depth === 2).length;
      return { kind: 'manuscript' as const, title: whole.title, label: 'Manuscript', meta: `${words(whole.words)}${chapters ? ` · ${chapters} ${chapters === 1 ? 'chapter' : 'chapters'}` : ''}` };
    }
    for (const m of story.manuscripts) {
      const i = m.sections.findIndex((s) => s.path === id);
      if (i >= 0) {
        const s = m.sections[i];
        return { kind: 'chapter' as const, title: s.title, label: `${m.title}${s.part ? ` · ${s.part}` : ''} · chapter ${i + 1}`, meta: words(s.words) };
      }
    }
    const piece = story.drawer.find((d) => d.path === id);
    if (piece) return { kind: 'drawer' as const, title: piece.title, label: `In the drawer${piece.group ? ` · ${piece.group}` : ''}`, meta: words(piece.words) };
    return null;
  });

  function words(n: number): string {
    return `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`;
  }
</script>

{#if about}
  <article class:drafting>
    {#if !drafting}
      <header>
        <div class="label">{about.label}</div>
        <h1>{about.title}</h1>
        <div class="row">
          {#if source}
            <div class="views" role="group" aria-label="View">
              <button type="button" class:on={mode === 'write'} aria-pressed={mode === 'write'} onclick={() => (mode = 'write')}>Write</button>
              <button type="button" class:on={mode === 'outline'} aria-pressed={mode === 'outline'} onclick={() => ((outlineFocus = null), (mode = 'outline'))}>Outline</button>
            </div>
          {/if}
          <span class="meta">{about.meta}</span>
          {#if mode === 'write'}<button type="button" class="action" onclick={onDraft}>Drafting mode</button>{/if}
          {#if about.kind === 'drawer'}
            <button type="button" class="action" onclick={() => onDeclare(id, true)}>Make this a manuscript</button>
          {:else if about.kind === 'manuscript'}
            <button type="button" class="quiet" onclick={() => onDeclare(id, false)}>Back to the drawer</button>
          {/if}
        </div>
      </header>
    {/if}
    {#if mode === 'outline' && source && !drafting}
      <OutlineView
        {fs}
        {source}
        focus={outlineFocus}
        onWrite={(card) => {
          mode = 'write';
          onOpenPiece(card.path, card.offset);
        }}
        onAdded={() => {}} />
    {:else}
      <div class="book">
        {#key id}
          <EntryEditor {fs} {index} {id} title={about.title} autofocus={fresh} {onOpen} {next} {jump} {onCursor} onOutline={showOutline} {onMakeEntry} />
        {/key}
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
  .views {
    display: flex;
    border: 1px solid var(--rule-strong);
  }
  .views button {
    font-size: 13px;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 6px 12px;
    min-height: 32px;
  }
  .views button.on {
    color: var(--structure-soft);
    background: var(--structure-deep);
  }
  article.drafting {
    margin: 0 auto;
  }
  header {
    margin-bottom: 22px;
  }
  h1 {
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 60px;
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
    font-size: 12px;
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
  .action,
  .quiet {
    font-size: 13px;
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 6px 10px;
    min-height: 32px;
  }
  .action {
    color: var(--structure);
  }
  .quiet {
    color: var(--muted);
    border-color: transparent;
  }
  .action:hover,
  .quiet:hover {
    border-color: var(--structure);
    color: var(--text);
  }
</style>
