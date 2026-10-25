<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import { buildStoryIndex, titleFromName, type Manuscript, type Section, type StoryIndex } from '../../lib/story/index';
  import { fileSource, folderSource } from '../../lib/story/outlineSource';
  import { withFirstChapter } from '../../lib/story/outline';
  import { saveNow } from '../../lib/saves';
  import { withHeader } from '../../lib/world';
  import { slugify } from '../../lib/slug';
  import { ui } from '../../lib/ui.svelte';
  import Panes from '../Panes.svelte';
  import EntryView from '../world/EntryView.svelte';
  import StorySidebar from './StorySidebar.svelte';
  import ManuscriptPane from './ManuscriptPane.svelte';
  import Dialog from '../shelf/Dialog.svelte';
  import CreateDialog from '../world/CreateDialog.svelte';
  import { createEntry, likelyCategory } from '../../lib/index/create';
  import Heatmap from './Heatmap.svelte';
  import type { Activity } from '../../lib/story/activity';

  /**
   * The Story module (Milestone 3): the binder and the drawer on the left, and the
   * writing in sliding panes. Names in a manuscript open their wiki entries beside it,
   * as in the World module (Mike, October 24).
   */
  let {
    index,
    fs,
    nav,
    storiesDir,
    rebuild,
  }: { index: WikiIndex; fs: WorldFs; nav: Navigator; storiesDir: string; rebuild: () => Promise<void> } = $props();

  let story = $state.raw<StoryIndex | null>(null);
  let jump = $state<{ path: string; offset: number; at: number; title?: string } | null>(null);
  let cursor = $state<{ path: string; pos: number } | null>(null);
  let fresh = $state<string | null>(null);
  let problem = $state('');
  let activity = $state.raw<Activity | null>(null);

  // A year of history is read from git, so it refreshes less often than the word counts.
  async function refreshActivity() {
    try {
      activity = await fs.writingActivity(storiesDir, 371);
    } catch {
      activity = null;
    }
  }

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
    refreshActivity();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let slow: ReturnType<typeof setTimeout> | null = null;
    const stop = fs.onChange((paths) => {
      if (!paths.some((p) => p.startsWith(storiesDir))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 300);
      if (slow) clearTimeout(slow);
      slow = setTimeout(refreshActivity, 3000);
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
  function openPiece(path: string, offset?: number | null, title?: string) {
    nav.open(path);
    if (offset !== null && offset !== undefined) jump = { path, offset, at: Date.now(), title };
  }

  async function declare(path: string, manuscript: boolean) {
    problem = '';
    try {
      const text = withHeader(await fs.readText(path), { manuscript: manuscript ? true : undefined });
      // A new manuscript's prose belongs to a chapter, so it shows in outline view.
      await fs.writeText(path, manuscript ? withFirstChapter(text).text : text);
      await refresh();
    } catch (e) {
      problem = String(e);
    }
  }

  /** Adds the next chapter to a manuscript and opens it there, ready for writing. */
  async function addChapter(m: Manuscript) {
    problem = '';
    try {
      const source = sourceOf(m);
      const at = await source.add();
      await refresh();
      openPiece(at.path, at.offset);
    } catch (e) {
      problem = String(e);
    }
  }

  /** Puts a manuscript away on the binder's shelf, or takes it back out. */
  async function shelve(m: Manuscript, shelved: boolean) {
    problem = '';
    const path = m.kind === 'file' ? m.path : `${m.path}/book.md`;
    try {
      await saveNow(path);
      await fs.writeText(path, withHeader(await fs.readText(path), { shelved: shelved ? true : undefined }));
      await refresh();
    } catch (e) {
      problem = String(e);
    }
  }

  function sourceOf(m: Manuscript) {
    return m.kind === 'file' ? fileSource(fs, m.path) : folderSource(fs, m);
  }

  /** The place in outline view of the chapter a binder section stands for. */
  async function cardOf(m: Manuscript, s: Section) {
    const source = sourceOf(m);
    const cards = await source.load();
    const i = cards.findIndex((c) => (m.kind === 'file' ? c.offset === s.offset : c.path === s.path));
    if (i < 0) throw new Error('That chapter has changed. Try again in a moment.');
    return { source, cards, i };
  }

  /** Moves a chapter from the binder, with its outline and prose. */
  async function moveChapter(m: Manuscript, s: Section, by: -1 | 1) {
    problem = '';
    try {
      // Whatever is waiting to be saved goes into the files before they change.
      for (const p of m.kind === 'file' ? [m.path] : m.sections.map((x) => x.path)) await saveNow(p);
      const { source, cards, i } = await cardOf(m, s);
      if (i + by < 0 || i + by >= cards.length) return;
      await source.move(i, i + by);
      if (m.kind === 'folder') {
        // The chapter files were renumbered, so open panes follow them to their new names.
        await refresh();
        const now = story?.manuscripts.find((x) => x.path === m.path);
        const renamed = new Map<string, string>();
        const order = [...m.sections.map((x) => x.path)];
        const [moved] = order.splice(i, 1);
        order.splice(i + by, 0, moved);
        order.forEach((old, k) => now?.sections[k] && old !== now.sections[k].path && renamed.set(old, now.sections[k].path));
        for (const [from, to] of renamed) if (nav.panes.includes(from)) nav.replace(from, to);
      } else await refresh();
    } catch (e) {
      problem = String(e);
    }
  }

  let renaming = $state<{ m: Manuscript; s: Section } | null>(null);
  let chapterName = $state('');
  async function renameChapter() {
    if (!renaming || !chapterName.trim()) return;
    busy = true;
    problem = '';
    try {
      const { m, s } = renaming;
      await saveNow(s.path);
      const { source, i } = await cardOf(m, s);
      await source.rename(i, chapterName.trim().replace(/\s+/g, ' '));
      await refresh();
      renaming = null;
    } catch (e) {
      problem = String(e);
    } finally {
      busy = false;
    }
  }

  // A wiki entry started from a name selected in the writing (Mike, October 25). It
  // opens beside the pane the name was selected in.
  let makingEntry = $state<{ name: string; after: number } | null>(null);
  let freshEntry = $state<string | null>(null);
  async function makeEntry(name: string, folder: string): Promise<string | null> {
    try {
      const path = await createEntry(fs, name, folder);
      await rebuild();
      freshEntry = path;
      nav.open(path, makingEntry?.after);
      makingEntry = null;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
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
      // A new manuscript opens on its first chapter, with the cursor ready in it.
      const first = withFirstChapter(withHeader(start, { manuscript: true }));
      await fs.writeText(path, creating === 'manuscript' ? first.text : start);
      await refresh();
      fresh = path;
      nav.open(path);
      if (creating === 'manuscript') jump = { path, offset: first.offset, at: Date.now() };
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
        onDeclare={declare}
        onOpenPiece={() => {}} />
    </div>
  </div>
{:else}
  <div class="story">
    <StorySidebar
      {fs}
      {story}
      {activity}
      open={row}
      {cursor}
      onOpen={openPiece}
      onDeclare={declare}
      onAddChapter={addChapter}
      onShelve={shelve}
      onMoveChapter={moveChapter}
      onRenameChapter={(m, s) => {
        renaming = { m, s };
        chapterName = s.title;
        problem = '';
      }}
      onMoved={async (from, to) => {
        await refresh();
        nav.replace(from, to);
      }}
      onNew={(kind) => {
        creating = kind;
        problem = '';
      }} />
    {#if row.length}
      <Panes {nav} ids={row} {label}>
        {#snippet pane(id, i, next)}
          {#if index.get(id)}
            <EntryView
              {index}
              {fs}
              {id}
              view="narrator"
              {next}
              fresh={freshEntry === id}
              onOpen={(target) => nav.open(target, i)}
              onMakeEntry={(name) => (makingEntry = { name, after: i })}
              onMoved={async (from, to) => {
                await rebuild();
                nav.replace(from, to);
              }} />
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
              onDeclare={declare}
              onOpenPiece={openPiece}
              onMakeEntry={(name) => (makingEntry = { name, after: i })}
              onMoved={async (from, to) => {
                await refresh();
                nav.replace(from, to);
              }} />
          {/if}
        {/snippet}
      </Panes>
    {:else}
      <main class="home">
        <h1>Story</h1>
        <p>Open a manuscript from the binder, or a piece from the drawer. Names in your writing open their wiki entries beside it.</p>
        {#if activity}
          <h2 class="label">Writing, the last year</h2>
          <div class="year"><Heatmap {activity} weeks={53} months /></div>
        {/if}
        {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
      </main>
    {/if}
  </div>
{/if}

{#if makingEntry}
  <CreateDialog {index} kind="entry" startFolder={likelyCategory(index)} startName={makingEntry.name} onCreate={makeEntry} onCancel={() => (makingEntry = null)} />
{/if}

{#if renaming}
  <Dialog title="Rename chapter" action="Rename" ready={!!chapterName.trim()} {busy} {problem} onSubmit={renameChapter} onCancel={() => (renaming = null)}>
    <label for="story-chapter-name" class="label">Chapter title</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="story-chapter-name" type="text" bind:value={chapterName} autofocus autocomplete="off" />
  </Dialog>
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
  .home h2 {
    margin: 36px 0 12px;
    font-size: 11px;
    font-weight: 400;
  }
  .year {
    overflow-x: auto;
    padding-bottom: 4px;
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
