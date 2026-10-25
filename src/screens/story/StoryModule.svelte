<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import { buildStoryIndex, filesOf, titleFromName, type Manuscript, type Place, type Section, type StoryIndex } from '../../lib/story/index';
  import { fileSource, folderSource } from '../../lib/story/outlineSource';
  import { moveToPlace, newManuscript } from '../../lib/story/manage';
  import { saveAllUnder, saveNow } from '../../lib/saves';
  import { openInWindow } from '../../lib/windows';
  import { splitHeader } from '../../lib/world';
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
   * The Story module (Milestone 3): the shelf, the desk, and the drawer on the left, and
   * the writing in sliding panes. Names in a manuscript open their wiki entries beside it,
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

  // The world's author and copyright holder, which new manuscripts start with.
  let defaults = $state({ author: '', copyright: '' });
  async function readDefaults() {
    try {
      const { header } = splitHeader(await fs.readText('world.md'));
      defaults = { author: typeof header.author === 'string' ? header.author : '', copyright: typeof header.copyright === 'string' ? header.copyright : '' };
    } catch {
      defaults = { author: '', copyright: '' };
    }
  }

  // Saves, Obsidian, and git pulls all change the files, and the counts follow.
  onMount(() => {
    refresh();
    refreshActivity();
    readDefaults();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let slow: ReturnType<typeof setTimeout> | null = null;
    const stop = fs.onChange((paths) => {
      if (paths.includes('world.md')) readDefaults();
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
  const pieces = $derived(new Set((story?.manuscripts ?? []).flatMap(filesOf)));
  const row = $derived(nav.panes.filter((id) => index.get(id) || pieces.has(id)));

  function label(id: string): string {
    const entry = index.get(id);
    if (entry) return entry.name;
    const m = story?.manuscripts.find((x) => x.path === id || x.book === id);
    if (m) return m.title;
    for (const x of story?.manuscripts ?? []) {
      const s = [...x.front, ...x.sections, ...x.back].find((y) => y.path === id);
      if (s) return s.title;
    }
    return titleFromName(id.split('/').pop() ?? id);
  }

  /** Moves a page into a reading window of its own; its pane here closes (Mike, October 25). */
  async function toWindow(id: string) {
    await saveNow(id);
    openInWindow(id, label(id));
    if (nav.panes.includes(id)) nav.close(id);
  }

  /** Opens a piece, and moves to a chapter in it when `offset` is given. */
  function openPiece(path: string, offset?: number | null, title?: string) {
    nav.open(path);
    if (offset !== null && offset !== undefined) jump = { path, offset, at: Date.now(), title };
  }

  /** Keeps open panes on a piece whose file or folder moved, or closes them when it was archived. */
  async function followed(from: string, to: string | null) {
    await refresh();
    if (/\.md$/i.test(from)) nav.replace(from, to);
    else nav.replacePrefix(from, to);
  }

  /** Moves a manuscript to the desk, the drawer, or the shelf (Mike, October 25). */
  async function moveTo(m: Manuscript, place: Place) {
    if (!story) return;
    problem = '';
    try {
      await saveNow(m.path);
      await saveAllUnder(m.path);
      const to = await moveToPlace(fs, m, story.root, place);
      await refresh();
      if (m.kind === 'file' && to !== m.path && !/\.md$/i.test(to)) {
        // A file that became a folder: its pane shows the new title page.
        nav.replace(m.path, `${to}/book.md`);
      } else if (m.kind === 'folder') nav.replacePrefix(m.path, to);
      else nav.replace(m.path, to);
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
      // A chapter that is its own file opens with the cursor in it.
      if (at.offset === null) fresh = at.path;
      openPiece(at.path, at.offset);
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

  // Creating a new manuscript on the desk, or a new piece in the drawer.
  let creating = $state<'desk' | 'drawer' | null>(null);
  let newName = $state('');
  let busy = $state(false);
  async function create() {
    const slug = slugify(newName);
    if (!slug || !creating) return;
    busy = true;
    problem = '';
    try {
      if (creating === 'desk') {
        // A manuscript is a folder with its title page and a first chapter, ready for writing.
        const made = await newManuscript(fs, storiesDir, newName, defaults);
        await refresh();
        fresh = made.chapter;
        nav.open(made.chapter);
      } else {
        const path = `${storiesDir}/ideas/${slug}.md`;
        if (await fs.exists(path)) throw new Error(`Something called ${slug} is already in the drawer.`);
        await fs.writeText(path, `# ${newName.trim()}\n\n`);
        await refresh();
        fresh = path;
        nav.open(path);
      }
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
        onMoveTo={() => {}}
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
      onAddChapter={addChapter}
      onMoveTo={moveTo}
      onWindow={toWindow}
      onMoveChapter={moveChapter}
      onRenameChapter={(m, s) => {
        renaming = { m, s };
        chapterName = s.title;
        problem = '';
      }}
      onMoved={followed}
      onNew={(kind) => {
        creating = kind;
        problem = '';
      }} />
    {#if row.length}
      <Panes {nav} ids={row} {label} onWindow={toWindow}>
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
              }}
              onWindow={() => toWindow(id)} />
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
              onMoveTo={moveTo}
              onOpenPiece={openPiece}
              onMakeEntry={(name) => (makingEntry = { name, after: i })}
              onMoved={followed}
              onWindow={() => toWindow(id)}
              {defaults}
              onDefaults={readDefaults} />
          {/if}
        {/snippet}
      </Panes>
    {:else}
      <main class="home">
        <h1>Story</h1>
        {#if story?.missing}
          <p class="problem" role="alert">
            The stories folder is missing. This world's <code>world.md</code> says its stories live in a folder called “{storiesDir}”, and there is no
            folder by that name. If it was renamed, renaming it back brings everything back, or a new empty one can start here.
          </p>
          <button type="button" class="make" onclick={async () => (await fs.createDir(`${storiesDir}/ideas`), await fs.createDir(`${storiesDir}/finished`), refresh())}>
            Make a new stories folder
          </button>
        {:else}
          <p>The desk holds what you are writing, the drawer what you might write, and the shelf what is finished. Names in your writing open their wiki entries beside it.</p>
        {/if}
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
    title={creating === 'desk' ? 'New manuscript' : 'New piece'}
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
      {creating === 'desk' ? 'It goes on the desk, with a title page and a first chapter.' : 'It goes in the drawer.'}
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
    color: var(--title);
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
    color: var(--danger) !important;
  }
  .make {
    font-size: 14px;
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border: 0;
    padding: 10px 16px;
    min-height: 44px;
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
