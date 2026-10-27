<script lang="ts">
  import { onMount } from 'svelte';
  import type { FolderShape, Library, ShelfWorld } from '../../lib/library/types';
  import type { ImageSource } from '../../lib/fs/types';
  import { dropImage } from '../../lib/drop';
  import { appVersion } from '../../lib/version';
  import { contextMenu } from '../../lib/contextMenu.svelte';
  import NewWorld from './NewWorld.svelte';
  import AddWorld from './AddWorld.svelte';
  import WorldDetails from './WorldDetails.svelte';
  import ThemeEditor from '../ThemeEditor.svelte';
  import type { Mode, ThemeSpec } from '../../lib/theme';
  import ModeToggle from '../ModeToggle.svelte';
  import UpdateButton from '../UpdateButton.svelte';
  import { account } from '../../lib/account.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { JOURNAL_FOLDER, journalFile } from '../../lib/world';
  import realWorld from '../../assets/real-world.jpg';

  /**
   * The world shelf (Mike, October 24): every world this machine knows, shown as covers,
   * with a card for making a new world and one for adding a folder that already holds
   * writing. Choosing a cover opens that world.
   */
  let {
    library,
    onOpen,
    onPreviewTheme,
  }: {
    library: Library;
    onOpen: (path: string) => void;
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

  // The library (Mike, October 26): asked once on each computer, and never again after
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
      problem = String(e);
    }
  }
  // Real World, the writer's journal (Mike, October 26), is always on the Worlds page once
  // there is a library. Its folder is made the first time it is opened.
  const hasJournal = $derived(!!worlds?.some((w) => w.journal));
  async function openJournal() {
    const lib = info?.path;
    if (!lib) return;
    problem = '';
    try {
      const sep = lib.includes('\\') ? '\\' : '/';
      const existing = (await library.list()).find((w) => w.journal);
      onOpen(existing ? existing.path : await library.create(lib, JOURNAL_FOLDER, journalFile(), ['wiki', 'stories']).catch(async (e) => {
        // A folder left from before is opened as it is.
        const path = `${lib}${sep}${JOURNAL_FOLDER}`;
        if ((await library.inspect(path).catch(() => null))?.hasWorld) return path;
        throw e;
      }));
    } catch (e) {
      problem = String(e);
    }
  }

  async function notNow() {
    await library.skipLibrary();
    await account.refresh();
  }

  onMount(() => {
    appVersion().then((v) => (version = v));
    refresh();
  });

  async function add() {
    problem = '';
    // The picker starts in the library, where most worlds live (Mike, October 26).
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
      problem = String(e);
    }
  }

  async function setCover(world: ShelfWorld, image: ImageSource | null) {
    if (!image) return;
    problem = '';
    try {
      await library.setCover(world.path, image);
      await refresh();
    } catch (e) {
      problem = String(e);
    }
  }

  async function forget(world: ShelfWorld) {
    await library.forget(world.path);
    await refresh();
  }

  function worldMenu(event: MouseEvent, world: ShelfWorld) {
    contextMenu.show(event, [
      { label: 'Open', run: () => onOpen(world.path), disabled: world.missing },
      { label: 'Edit details', run: () => (editing = world), disabled: world.missing },
      { label: 'Change cover', run: async () => setCover(world, await library.pickImage()), disabled: world.missing },
      { label: 'Theme', run: () => (theming = world), disabled: world.missing },
      'separator',
      { label: 'Remove from the shelf', run: () => forget(world) },
    ]);
  }
</script>

<main>
  <header>
    <h1>Worlds</h1>
    <div class="corner">
      {#if version}<div class="label">Immersion {version}</div>{/if}
      <UpdateButton />
      <ModeToggle />
      <button type="button" class="gear" aria-label="Settings" title="Settings" onclick={() => (ui.settings = 'you')}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M8 1.2 V3 M8 13 V14.8 M1.2 8 H3 M13 8 H14.8 M3.2 3.2 L4.5 4.5 M11.5 11.5 L12.8 12.8 M3.2 12.8 L4.5 11.5 M11.5 4.5 L12.8 3.2" stroke="currentColor" stroke-width="1.4" /></svg>
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

  {#if worlds}
    <div class="grid">
      {#if info?.path && !hasJournal}
        <div class="card">
          <button type="button" class="cover" onclick={openJournal} title="Your journal">
            <img src={realWorld} alt="" />
            <span class="words"><span class="tagline">Your journal</span><span class="name">Real World</span></span>
          </button>
        </div>
      {/if}
      {#each worlds as world (world.path)}
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
            <button type="button" onclick={() => forget(world)} title="Takes the world off this shelf. Its files stay where they are.">Remove</button>
          </div>
        </div>
      {/each}

      <button type="button" class="card blank new" onclick={() => (making = true)}>
        <span class="plus" aria-hidden="true">+</span>
        <span class="name">New world</span>
        <span class="hint">Starts with shelves for people, places, factions, and history</span>
      </button>
      <button type="button" class="card blank" onclick={add}>
        <span class="plus folder" aria-hidden="true">
          <svg width="30" height="24" viewBox="0 0 30 24"><path d="M1 3 H11 L14 6 H29 V23 H1 Z" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        </span>
        <span class="name">Add a world</span>
        <span class="hint">Bring in a folder you already write in</span>
      </button>
    </div>
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
    font-size: calc(72px * var(--type));
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
