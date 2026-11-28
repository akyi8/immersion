<script lang="ts">
  import { errorText } from '../../lib/errors';
  import { onMount } from 'svelte';
  import type { FolderShape, Library, ShelfWorld } from '../../lib/library/types';
  import type { ImageSource, Pending, SyncReport } from '../../lib/fs/types';
  import SyncCount from '../SyncCount.svelte';
  import { dropImage } from '../../lib/drop';
  import { appVersion } from '../../lib/version';
  import { contextMenu } from '../../lib/contextMenu.svelte';
  import NewWorld from './NewWorld.svelte';
  import AddWorld from './AddWorld.svelte';
  import WorldDetails from './WorldDetails.svelte';
  import ThemeEditor from '../ThemeEditor.svelte';
  import type { Mode, ThemeSpec } from '../../lib/theme';
  import UpdateButton from '../UpdateButton.svelte';
  import { account } from '../../lib/account.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { JOURNAL_FOLDER, journalFile, splitHeader, withHeader } from '../../lib/world';
  import realWorld from '../../assets/real-world.jpg';

  /**
   * The world shelf (Cerys, October 24): every world this machine knows, shown as covers,
   * with a card for making a new world and one for adding a folder that already holds
   * writing. Choosing a cover opens that world.
   */
  let {
    library,
    onOpen,
    onPreviewTheme,
  }: {
    library: Library;
    onOpen: (path: string, by?: { straight?: boolean; baseGame?: boolean }) => void;
    /** Shows a theme on the app while it is chosen; undefined returns to the shelf's own. */
    onPreviewTheme: (preview: { spec: ThemeSpec | null; side: Mode } | undefined) => void;
  } = $props();

  let theming = $state<ShelfWorld | null>(null);
  function closeTheme() {
    theming = null;
    onPreviewTheme(undefined);
  }

  let worlds = $state<ShelfWorld[] | null>(null);
  let version = $state('');
  let making = $state(false);
  let adding = $state<{ path: string; shape: FolderShape } | null>(null);
  let editing = $state<ShelfWorld | null>(null);
  let problem = $state('');

  async function refresh() {
    worlds = await library.list();
  }

  // The whole library's sync (Cerys, October 28): what waits to go out from every world
  // and immersion.md, what other computers have that has not come in, and a button that
  // syncs it all and brings in new worlds. Asking the remote needs the network, so it
  // happens at most every two minutes; counting what is here is instant.
  let libraryCounts = $state.raw<Pending | null>(null);
  let librarySyncing = $state(false);
  let libraryState = $state<SyncReport['state'] | null>(null);
  let fetchedAt = 0;
  async function countLibrary(ask = false) {
    const fetch = ask && Date.now() - fetchedAt > 2 * 60 * 1000;
    if (fetch) fetchedAt = Date.now();
    try {
      libraryCounts = await library.pending(fetch);
    } catch {
      // The last count stays.
    }
  }
  let librarySynced = 0;
  /** Syncs the library. On its own (`quiet`), a sync that only has to wait says nothing. */
  async function syncLibrary(quiet = false) {
    librarySyncing = true;
    librarySynced = Date.now();
    if (!quiet) problem = '';
    try {
      const r = await library.syncLibrary();
      libraryState = r.state;
      if (r.state === 'problem' || (r.state === 'waiting' && !quiet)) problem = r.message;
      if (r.state === 'synced') await account.refresh();
      await refresh();
    } catch (e) {
      libraryState = 'problem';
      problem = errorText(e);
    } finally {
      librarySyncing = false;
      fetchedAt = Date.now();
      void countLibrary();
    }
  }

  // The library (Cerys, October 26): asked once on each computer, and never again after
  // an answer or "Not now".
  const info = $derived(account.info);
  async function chooseLibrary() {
    problem = '';
    const path = await library.pickFolder('Choose your library: the folder that holds your worlds', info?.path);
    if (!path) return;
    try {
      await library.setLibrary(path);
      await account.refresh();
      await refresh();
    } catch (e) {
      problem = errorText(e);
    }
  }
  // Real World, the writer's journal (Cerys, October 26), is always on the Worlds page once
  // there is a library. Its folder is made the first time it is opened.
  const hasJournal = $derived(!!worlds?.some((w) => w.journal));
  async function openJournal() {
    const lib = info?.path;
    if (!lib) return;
    problem = '';
    try {
      const sep = lib.includes('\\') ? '\\' : '/';
      const existing = (await library.list()).find((w) => w.journal);
      const straight = { straight: true };
      onOpen(existing ? existing.path : await library.create(lib, JOURNAL_FOLDER, journalFile(), ['wiki', 'stories']).catch(async (e) => {
        // A folder left from before is opened as it is.
        const path = `${lib}${sep}${JOURNAL_FOLDER}`;
        if ((await library.inspect(path).catch(() => null))?.hasWorld) return path;
        throw e;
      }), straight);
    } catch (e) {
      problem = errorText(e);
    }
  }

  async function notNow() {
    await library.skipLibrary();
    await account.refresh();
  }

  onMount(() => {
    appVersion().then((v) => (version = v));
    refresh();
    void countLibrary().then(() => countLibrary(true));
    // Worlds arrive from other computers and from Claude sessions while the app is open,
    // so the page looks again whenever the app comes back to the front (Cerys, October 28),
    // and syncs the library then too, unless it did so in the last two minutes (Cerys, October 31).
    const again = () => {
      void refresh();
      if (libraryCounts?.state === 'git' && Date.now() - librarySynced > 2 * 60 * 1000) void syncLibrary(true);
      else void countLibrary(true);
    };
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  });
  // The pull at launch can bring in worlds made on another computer.
  $effect(() => {
    if (account.pulled) {
      void refresh();
      void countLibrary();
    }
  });

  async function add() {
    problem = '';
    // The picker starts in the library, where most worlds live (Cerys, October 26).
    const path = await library.pickFolder('Choose a folder that holds a world', account.info?.path);
    if (!path) return;
    try {
      const shape = await library.inspect(path);
      if (shape.hasWorld) {
        await library.add(path, null);
        onOpen(path);
      } else {
        adding = { path, shape };
      }
    } catch (e) {
      problem = errorText(e);
    }
  }

  async function setCover(world: ShelfWorld, image: ImageSource | null) {
    if (!image) return;
    problem = '';
    try {
      await library.setCover(world.path, image);
      await refresh();
    } catch (e) {
      problem = errorText(e);
    }
  }

  async function forget(world: ShelfWorld) {
    await library.forget(world.path);
    await refresh();
  }

  // A world not in use is archived (Cerys, November 15): it moves below the others, under
  // its own heading, and nothing else about it changes. The world's own `world.md` says
  // so, which carries the choice to every computer.
  const isArchived = (world: ShelfWorld) => !!world.worldMd && splitHeader(world.worldMd).header.archived === true;
  const active = $derived((worlds ?? []).filter((w) => !isArchived(w)));
  const archived = $derived((worlds ?? []).filter(isArchived));

  // The lower shelf (Cerys, November 28): what is on the page and is not a world to walk
  // into. Real World, the journal, opens straight to writing. A base game is found on its
  // own, wherever a world names one as its engine, and opens straight to its book.
  const shelved = $derived(active.filter((w) => !w.journal));
  const journals = $derived(active.filter((w) => w.journal));
  const engineOf = (w: ShelfWorld) => {
    const e = w.worldMd ? splitHeader(w.worldMd).header.engine : null;
    return typeof e === 'string' && e.trim() ? e.trim() : null;
  };
  const baseGames = $derived.by(() => {
    const found = new Map<string, ShelfWorld[]>();
    for (const w of [...active, ...archived]) {
      const rel = w.missing ? null : engineOf(w);
      if (rel) found.set(rel, [...(found.get(rel) ?? []), w]);
    }
    return [...found].map(([rel, built]) => ({ rel, built }));
  });
  let engineNames = $state<Record<string, string>>({});
  $effect(() => {
    const missing = baseGames.map((b) => b.rel).filter((rel) => !(rel in engineNames));
    if (!missing.length) return;
    void (async () => {
      const names: Record<string, string> = {};
      for (const rel of missing) {
        const fallback = rel.split('/').filter(Boolean).pop() ?? rel;
        try {
          const efs = await library.openEngine(rel);
          const md = efs && (await efs.exists('engine.md')) ? await efs.readText('engine.md') : '';
          const { header, body } = splitHeader(md);
          names[rel] = (typeof header.name === 'string' && header.name.trim()) || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || fallback;
        } catch {
          names[rel] = fallback;
        }
      }
      await library.openEngine(null).catch(() => {});
      engineNames = { ...engineNames, ...names };
    })();
  });
  const listed = (names: string[]) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);
  const lower = $derived(journals.length > 0 || baseGames.length > 0 || (!!info?.path && !hasJournal));
  async function archive(world: ShelfWorld, on: boolean) {
    if (world.worldMd === null) return;
    await library.writeWorldMd(world.path, withHeader(world.worldMd, { archived: on ? true : undefined }));
    await refresh();
  }

  function worldMenu(event: MouseEvent, world: ShelfWorld) {
    contextMenu.show(event, [
      { label: 'Open', run: () => onOpen(world.path), disabled: world.missing },
      { label: 'Edit details', run: () => (editing = world), disabled: world.missing },
      { label: 'Change cover', run: async () => setCover(world, await library.pickImage()), disabled: world.missing },
      { label: 'Theme', run: () => (theming = world), disabled: world.missing },
      { label: isArchived(world) ? 'Unarchive' : 'Archive', run: () => archive(world, !isArchived(world)), disabled: world.missing },
      'separator',
      { label: 'Remove from this page', run: () => forget(world) },
    ]);
  }
</script>

<main>
  <header>
    <h1>Worlds</h1>
    <div class="corner">
      {#if version}<div class="label">Immersion {version}</div>{/if}
      <SyncCount
        counts={libraryCounts}
        busy={librarySyncing}
        tone={libraryState === 'problem' ? 'problem' : libraryState === 'waiting' ? 'quiet' : 'calm'}
        note={libraryState === 'waiting' ? 'Waiting' : libraryState === 'problem' ? 'Problem' : ''}
        onSync={() => syncLibrary()}
        onDetails={() => (ui.settings = 'files')} />
      <UpdateButton />
      <button type="button" class="gear" aria-label="Settings" title="Settings" onclick={() => (ui.settings = 'look')}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M12.97 6.46 L14.90 6.82 L14.90 9.18 L12.97 9.54 L12.60 10.43 L13.72 12.04 L12.04 13.72 L10.43 12.60 L9.54 12.97 L9.18 14.90 L6.82 14.90 L6.46 12.97 L5.57 12.60 L3.96 13.72 L2.28 12.04 L3.40 10.43 L3.03 9.54 L1.10 9.18 L1.10 6.82 L3.03 6.46 L3.40 5.57 L2.28 3.96 L3.96 2.28 L5.57 3.40 L6.46 3.03 L6.82 1.10 L9.18 1.10 L9.54 3.03 L10.43 3.40 L12.04 2.28 L13.72 3.96 L12.60 5.57 Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
    </button>
    </div>
  </header>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  {#if info && !info.asked && !info.path}
    <section class="ask" aria-label="Your library">
      <div>
        <h2>Where is your library?</h2>
        <p>
          Your library is the folder that holds your worlds. Every computer that uses the same folder, synced through Git or Dropbox, shows the same
          worlds and keeps your author profiles. Worlds you added on this computer stay here either way.
        </p>
      </div>
      <div class="ask-buttons">
        <button type="button" class="primary" onclick={chooseLibrary}>Choose a folder</button>
        <button type="button" onclick={notNow}>Not now</button>
      </div>
    </section>
  {/if}

  {#snippet worldCard(world: ShelfWorld)}
        <div class="card" class:missing={world.missing} oncontextmenu={(e) => worldMenu(e, world)} role="presentation" use:dropImage={(image) => !world.missing && setCover(world, image)}>
          <button type="button" class="cover" disabled={world.missing} onclick={() => onOpen(world.path)} title={world.path}>
            {#if world.cover}<img src={world.cover} alt="" />{:else if world.journal}<img src={realWorld} alt="" />{/if}
            <span class="words">
              {#if world.missing}
                <span class="tagline">Not found on this computer</span>
              {:else if world.tagline}
                <span class="tagline">{world.tagline}</span>
              {/if}
              {#if world.local && info?.path}<span class="local">On this computer only</span>{/if}
              <span class="name">{world.name}</span>
            </span>
            <span class="drop-hint">Drop a picture to make it the cover</span>
          </button>
          <div class="tools">
            {#if !world.missing}
              <button type="button" onclick={() => (editing = world)}>Edit details</button>
              <button type="button" onclick={async () => setCover(world, await library.pickImage())}>Change cover</button>
              <button type="button" onclick={() => (theming = world)}>Theme</button>
            {/if}
            {#if !world.missing}
              <button type="button" onclick={() => archive(world, !isArchived(world))} title={isArchived(world) ? 'Moves the world back up with the active ones.' : 'Moves the world down to the archived ones. Nothing else about it changes.'}>{isArchived(world) ? 'Unarchive' : 'Archive'}</button>
            {/if}
            <button type="button" onclick={() => forget(world)} title="Takes the world off the Worlds page on this computer. Its files stay where they are.">Remove from this page</button>
          </div>
        </div>
  {/snippet}

  {#if worlds}
    <div class="grid">
      {#each shelved as world (world.path)}
        {@render worldCard(world)}
      {/each}

      <button type="button" class="card blank new" onclick={() => (making = true)}>
        <span class="plus" aria-hidden="true">+</span>
        <span class="name">New world</span>
        <span class="hint">Starts with categories for people, places, factions, and history</span>
      </button>
      <button type="button" class="card blank" onclick={add}>
        <span class="plus folder" aria-hidden="true">
          <svg width="30" height="24" viewBox="0 0 30 24"><path d="M1 3 H11 L14 6 H29 V23 H1 Z" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        </span>
        <span class="name">Add a world</span>
        <span class="hint">Bring in a folder you already write in</span>
      </button>
    </div>
    {#if lower}
      <h2 class="shelf-head">Game and journal</h2>
      <div class="strips">
        {#each baseGames as base (base.rel)}
          <button type="button" class="strip" onclick={() => onOpen(base.built[0].path, { straight: true, baseGame: true })} title={base.rel}>
            <span class="thumb book" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /><path d="M9 8h6M9 12h4" /></svg>
            </span>
            <span class="about">
              <span class="name">{engineNames[base.rel] ?? ''}</span>
              <span class="does">The base game. {listed(base.built.map((w) => w.name))} {base.built.length === 1 ? 'is' : 'are'} built on it.</span>
            </span>
            <span class="opens">Game</span>
          </button>
        {/each}
        {#each journals as world (world.path)}
          <button type="button" class="strip" disabled={world.missing} onclick={() => onOpen(world.path, { straight: true })} oncontextmenu={(e) => worldMenu(e, world)} title={world.path}>
            <span class="thumb"><img src={world.cover ?? realWorld} alt="" /></span>
            <span class="about">
              <span class="name">{world.name}</span>
              <span class="does">{world.missing ? 'Not found on this computer' : world.tagline || 'Your journal'}</span>
            </span>
            <span class="opens">Story</span>
          </button>
        {/each}
        {#if info?.path && !hasJournal}
          <button type="button" class="strip" onclick={openJournal}>
            <span class="thumb"><img src={realWorld} alt="" /></span>
            <span class="about"><span class="name">Real World</span><span class="does">Your journal</span></span>
            <span class="opens">Story</span>
          </button>
        {/if}
      </div>
    {/if}
    {#if archived.length}
      <h2 class="shelf-head">Archived</h2>
      <div class="grid">
        {#each archived as world (world.path)}
          {@render worldCard(world)}
        {/each}
      </div>
    {/if}
  {/if}
  {#if theming && theming.worldMd !== null}
    <ThemeEditor
      worldMd={theming.worldMd}
      worldName={theming.name}
      onPreview={(spec, side) => onPreviewTheme({ spec, side })}
      onSave={async (text) => {
        await library.writeWorldMd(theming!.path, text);
        closeTheme();
        await refresh();
      }}
      onCancel={closeTheme} />
  {/if}
</main>

{#if making}
  <NewWorld {library} onCancel={() => (making = false)} onCreated={(path) => onOpen(path)} />
{/if}
{#if editing}
  <WorldDetails
    {library}
    world={editing}
    onCancel={() => (editing = null)}
    onSaved={async () => {
      editing = null;
      await refresh();
    }} />
{/if}
{#if adding}
  <AddWorld {library} path={adding.path} shape={adding.shape} onCancel={() => (adding = null)} onAdded={(path) => onOpen(path)} />
{/if}

<style>
  .gear {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .gear:hover {
    color: var(--text);
  }
  .corner {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  main {
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 48px 56px 64px;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 20px;
    margin-bottom: 32px;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(var(--title-size) * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .problem {
    color: var(--danger);
    margin: 0 0 20px;
  }
  .ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 32px;
    margin: 0 0 28px;
    padding: 20px 24px;
    border: 1px solid var(--callout-edge);
    border-radius: var(--round-box);
    background: var(--surface);
  }
  .ask > div:first-child {
    flex: 1 1 420px;
  }
  .ask h2 {
    margin: 0 0 6px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(28px * var(--type));
    color: var(--title);
  }
  .ask p {
    margin: 0;
    max-width: 640px;
    line-height: 1.55;
    color: var(--text-soft);
  }
  .ask-buttons {
    display: flex;
    gap: 10px;
  }
  .ask-buttons button {
    font-size: calc(14px * var(--type));
    padding: 10px 16px;
    min-height: 44px;
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .ask-buttons .primary {
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .local {
    align-self: flex-start;
    margin-top: 6px;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #d8d2cb;
    border: 1px solid rgb(216 210 203 / 0.5);
    padding: 2px 6px;
  }
  /* A shelf's heading is a size down from the page's own title, so each shelf reads as
     its own part of the page (Cerys, November 28). */
  .shelf-head {
    margin: 56px 0 18px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(var(--title-size) * 0.62 * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
    color: var(--title);
  }
  .strips {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 24px;
  }
  .strip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 0 18px 0 0;
    min-height: 88px;
    overflow: hidden;
    text-align: left;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--round-box);
  }
  .strip:hover,
  .strip:focus-visible {
    border-color: var(--hover-edge);
  }
  .strip:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .thumb {
    align-self: stretch;
    width: 104px;
    display: grid;
    place-items: center;
    background: var(--well);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb.book svg {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .about {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 0;
    min-width: 0;
  }
  .strip .name {
    font-size: calc(30px * var(--type));
  }
  .does {
    font-size: calc(14px * var(--type));
    line-height: 1.35;
    color: var(--text-soft);
  }
  .opens {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--structure-soft);
    border: 1px solid var(--edge);
    border-radius: 999px;
    padding: 3px 10px;
    white-space: nowrap;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 24px;
  }
  .card {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--round-box);
    background: var(--surface);
  }
  .card:hover,
  .card:focus-within {
    border-color: var(--hover-edge);
  }
  .cover {
    position: absolute;
    inset: 0;
    width: 100%;
    padding: 0;
    border: 0;
    background:
      radial-gradient(120% 90% at 85% 10%, var(--structure-deep), transparent 60%),
      var(--surface);
    color: var(--text);
    text-align: left;
  }
  .cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 400ms ease;
  }
  .card:hover .cover img {
    transform: scale(1.03);
  }
  .words {
    position: absolute;
    inset: auto 0 0 0;
    padding: 60px 22px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* The words sit on the cover picture, so they stay light on dark in either mode. */
    background: linear-gradient(transparent, rgb(6 7 9 / 0.9));
    color: #f1ece6;
  }
  .words .tagline {
    color: #d8d2cb;
  }
  .tagline {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .name {
    font-family: var(--font-display);
    font-size: calc(46px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .missing .cover {
    cursor: default;
    opacity: 0.45;
  }
  .tools {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 6px;
    opacity: 0;
    transition: opacity 150ms;
  }
  .card:hover .tools,
  .card:focus-within .tools,
  .missing .tools {
    opacity: 1;
  }
  .tools button {
    font-size: calc(13px * var(--type));
    color: var(--text);
    background: color-mix(in srgb, var(--bg) 75%, transparent);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tools button:hover {
    border-color: var(--hover-edge);
  }
  .drop-hint {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--structure-deep) 85%, transparent);
    color: var(--structure-soft);
    font-family: var(--font-label);
    font-size: calc(13px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  :global(.drop-over) .drop-hint {
    display: flex;
  }
  :global(.card.drop-over) {
    border-color: var(--structure);
  }
  .blank {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--well);
    border: 1px dashed var(--edge);
    border-radius: var(--round);
    color: var(--text);
    padding: 20px;
    text-align: center;
  }
  .blank:hover {
    border-style: solid;
  }
  .blank .name {
    font-size: calc(36px * var(--type));
  }
  .plus {
    height: 44px;
    display: flex;
    align-items: center;
    font-family: var(--font-display);
    font-size: calc(64px * var(--type));
    line-height: 1;
    color: var(--accent);
  }
  .plus.folder {
    color: var(--structure);
  }
  .blank .hint {
    font-size: calc(14px * var(--type));
    color: var(--muted);
    max-width: 260px;
  }
</style>
