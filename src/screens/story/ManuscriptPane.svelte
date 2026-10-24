<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { StoryIndex } from '../../lib/story/index';
  import EntryEditor from '../world/EntryEditor.svelte';

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
  } = $props();

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
          <span class="meta">{about.meta}</span>
          <button type="button" class="action" onclick={onDraft}>Drafting mode</button>
          {#if about.kind === 'drawer'}
            <button type="button" class="action" onclick={() => onDeclare(id, true)}>Make this a manuscript</button>
          {:else if about.kind === 'manuscript'}
            <button type="button" class="quiet" onclick={() => onDeclare(id, false)}>Back to the drawer</button>
          {/if}
        </div>
      </header>
    {/if}
    <div class="book">
      {#key id}
        <EntryEditor {fs} {index} {id} title={about.title} autofocus={fresh} {onOpen} {next} {jump} {onCursor} />
      {/key}
    </div>
  </article>
{/if}

<style>
  article {
    max-width: 720px;
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
