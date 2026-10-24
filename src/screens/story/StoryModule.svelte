<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import { buildStoryIndex, titleFromName, type StoryIndex } from '../../lib/story/index';
  import { withHeader } from '../../lib/world';
  import { slugify } from '../../lib/slug';
  import { ui } from '../../lib/ui.svelte';
  import Panes from '../Panes.svelte';
  import EntryView from '../world/EntryView.svelte';
  import StorySidebar from './StorySidebar.svelte';
  import ManuscriptPane from './ManuscriptPane.svelte';
  import Dialog from '../shelf/Dialog.svelte';

  /**
   * The Story module (Milestone 3): the binder and the drawer on the left, and the
   * writing in sliding panes. Names in a manuscript open their wiki entries beside it,
   * as in the World module (Mike, October 24).
   */
  let { index, fs, nav, storiesDir }: { index: WikiIndex; fs: WorldFs; nav: Navigator; storiesDir: string } = $props();

  let story = $state.raw<StoryIndex | null>(null);
  let jump = $state<{ path: string; offset: number; at: number } | null>(null);
  let cursor = $state<{ path: string; pos: number } | null>(null);
  let fresh = $state<string | null>(null);
  let problem = $state('');

  async function refresh() {
    try {
      story = await buildStoryIndex(fs, storiesDir);
    } catch (e) {
      problem = String(e);
    }
  }

  // Saves, Obsidian, and git pulls all change the files, and the counts follow.
  onMount(() => {
    refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = fs.onChange((paths) => {
      if (!paths.some((p) => p.startsWith(storiesDir))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ui.drafting) ui.drafting = null;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
    };
  });

  /** Every piece of writing the stories folder holds, which panes may show. */
  const pieces = $derived(
    new Set([
      ...(story?.manuscripts ?? []).flatMap((m) => (m.kind === 'file' ? [m.path] : m.sections.map((s) => s.path))),
      ...(story?.drawer ?? []).map((d) => d.path),
    ]),
  );
  const row = $derived(nav.panes.filter((id) => index.get(id) || pieces.has(id)));

  function label(id: string): string {
    const entry = index.get(id);
    if (entry) return entry.name;
    const m = story?.manuscripts.find((x) => x.path === id);
    if (m) return m.title;
    for (const x of story?.manuscripts ?? []) {
      const s = x.sections.find((y) => y.path === id);
      if (s) return s.title;
    }
    return story?.drawer.find((d) => d.path === id)?.title ?? titleFromName(id.split('/').pop() ?? id);
  }

  /** Opens a piece, and moves to a chapter in it when `offset` is given. */
  function openPiece(path: string, offset?: number | null) {
    nav.open(path);
    if (offset !== null && offset !== undefined) jump = { path, offset, at: Date.now() };
  }

  async function declare(path: string, manuscript: boolean) {
    problem = '';
    try {
      const text = await fs.readText(path);
      await fs.writeText(path, withHeader(text, { manuscript: manuscript ? true : undefined }));
      await refresh();
    } catch (e) {
      problem = String(e);
    }
  }

  async function declareFolder(folder: string) {
    problem = '';
    const book = `${folder}/book.md`;
    try {
      const text = (await fs.exists(book)) ? await fs.readText(book) : '';
      await fs.writeText(book, withHeader(text, { manuscript: true, title: titleFromName(folder.split('/').pop() ?? folder) }));
      await refresh();
    } catch (e) {
      problem = String(e);
    }
  }

  function draft(path: string) {
    // Drafting picks up where the cursor was.
    if (cursor?.path === path) jump = { path, offset: cursor.pos, at: Date.now() };
    ui.drafting = path;
  }

  // Creating a new manuscript or a new piece for the drawer.
  let creating = $state<'manuscript' | 'drawer' | null>(null);
  let newName = $state('');
  let busy = $state(false);
  async function create() {
    const slug = slugify(newName);
    if (!slug || !creating) return;
    busy = true;
    problem = '';
    const path = `${storiesDir}/${slug}.md`;
    try {
      if (await fs.exists(path)) throw new Error(`Something called ${slug} already exists in the stories folder.`);
      const start = `# ${newName.trim()}\n\n`;
      await fs.writeText(path, creating === 'manuscript' ? withHeader(start, { manuscript: true }) : start);
      await refresh();
      fresh = path;
      nav.open(path);
      creating = null;
      newName = '';
    } catch (e) {
      problem = String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if ui.drafting && pieces.has(ui.drafting)}
  <!-- Drafting mode: the manuscript alone, until Escape or the quiet button. -->
  <div class="drafting">
    <button type="button" class="leave" onclick={() => (ui.drafting = null)}>Leave drafting mode</button>
    <div class="page">
      <ManuscriptPane
        {fs}
        {index}
        {story}
        id={ui.drafting}
        next={null}
        drafting
        jump={jump?.path === ui.drafting ? jump : null}
        onOpen={() => {}}
        onCursor={(pos) => (cursor = { path: ui.drafting!, pos })}
        onDraft={() => {}}
        onDeclare={declare} />
    </div>
  </div>
{:else}
  <div class="story">
    <StorySidebar
      {story}
      open={row}
      {cursor}
      onOpen={openPiece}
      onDeclare={declare}
      onDeclareFolder={declareFolder}
      onNew={(kind) => {
        creating = kind;
        problem = '';
      }} />
    {#if row.length}
      <Panes {nav} ids={row} {label}>
        {#snippet pane(id, i, next)}
          {#if index.get(id)}
            <EntryView {index} {fs} {id} view="narrator" {next} fresh={false} onOpen={(target) => nav.open(target, i)} />
          {:else}
            <ManuscriptPane
              {fs}
              {index}
              {story}
              {id}
              {next}
              fresh={fresh === id}
              jump={jump?.path === id ? jump : null}
              onOpen={(target) => nav.open(target, i)}
              onCursor={(pos) => (cursor = { path: id, pos })}
              onDraft={() => draft(id)}
              onDeclare={declare} />
          {/if}
        {/snippet}
      </Panes>
    {:else}
      <main class="home">
        <h1>Story</h1>
        <p>Open a manuscript from the binder, or a piece from the drawer. Names in your writing open their wiki entries beside it.</p>
        {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
      </main>
    {/if}
  </div>
{/if}

{#if creating}
  <Dialog
    title={creating === 'manuscript' ? 'New manuscript' : 'New piece'}
    action="Create"
    ready={!!slugify(newName)}
    {busy}
    {problem}
    onSubmit={create}
    onCancel={() => (creating = null)}>
    <label for="story-new-name" class="label">Title</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="story-new-name" type="text" bind:value={newName} autofocus autocomplete="off" />
    <p class="hint">
      {creating === 'manuscript' ? 'It goes in the binder, as one file in the stories folder.' : 'It goes in the drawer, as one file in the stories folder.'}
    </p>
  </Dialog>
{/if}

<style>
  .story {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .home {
    flex: 1;
    padding: 36px 48px;
  }
  .home h1 {
    margin: 0 0 12px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 60px;
    letter-spacing: 0.02em;
  }
  .home p {
    max-width: 520px;
    font-size: var(--prose-size);
    line-height: 1.6;
    color: var(--text-soft);
  }
  .problem {
    color: #ff9a9a !important;
  }
  .drafting {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .page {
    padding: 12vh 32px 30vh;
  }
  .leave {
    position: fixed;
    top: 14px;
    right: 18px;
    z-index: 2;
    font-size: 12px;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    padding: 6px 10px;
    opacity: 0.25;
    transition: opacity 200ms;
  }
  .leave:hover,
  .leave:focus-visible {
    opacity: 1;
    border-color: var(--rule-strong);
  }
</style>
