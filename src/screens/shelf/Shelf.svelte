<script lang="ts">
  import { onMount } from 'svelte';
  import type { FolderShape, Library, ShelfWorld } from '../../lib/library/types';
  import type { ImageSource } from '../../lib/fs/types';
  import { dropImage } from '../../lib/drop';
  import { appVersion } from '../../lib/version';
  import NewWorld from './NewWorld.svelte';
  import AddWorld from './AddWorld.svelte';
  import WorldDetails from './WorldDetails.svelte';

  /**
   * The world shelf (Mike, October 24): every world this machine knows, shown as covers,
   * with a card for making a new world and one for adding a folder that already holds
   * writing. Choosing a cover opens that world.
   */
  let { library, onOpen }: { library: Library; onOpen: (path: string) => void } = $props();

  let worlds = $state<ShelfWorld[] | null>(null);
  let version = $state('');
  let making = $state(false);
  let adding = $state<{ path: string; shape: FolderShape } | null>(null);
  let editing = $state<ShelfWorld | null>(null);
  let problem = $state('');

  async function refresh() {
    worlds = await library.list();
  }

  onMount(() => {
    appVersion().then((v) => (version = v));
    refresh();
  });

  async function add() {
    problem = '';
    const path = await library.pickFolder('Choose a folder that holds a world');
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
</script>

<main>
  <header>
    <h1>Worlds</h1>
    {#if version}<div class="label">Immersion {version}</div>{/if}
  </header>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}

  {#if worlds}
    <div class="grid">
      {#each worlds as world (world.path)}
        <div class="card" class:missing={world.missing} use:dropImage={(image) => !world.missing && setCover(world, image)}>
          <button type="button" class="cover" disabled={world.missing} onclick={() => onOpen(world.path)} title={world.path}>
            {#if world.cover}<img src={world.cover} alt="" />{/if}
            <span class="words">
              {#if world.missing}
                <span class="tagline">Not found on this computer</span>
              {:else if world.tagline}
                <span class="tagline">{world.tagline}</span>
              {/if}
              <span class="name">{world.name}</span>
            </span>
            <span class="drop-hint">Drop a picture to make it the cover</span>
          </button>
          <div class="tools">
            {#if !world.missing}
              <button type="button" onclick={() => (editing = world)}>Edit details</button>
              <button type="button" onclick={async () => setCover(world, await library.pickImage())}>Change cover</button>
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
    font-size: 72px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .problem {
    color: #ff9a9a;
    margin: 0 0 20px;
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
    border: 1px solid var(--rule);
    background: var(--surface);
  }
  .card:hover,
  .card:focus-within {
    border-color: var(--structure);
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
    background: linear-gradient(transparent, rgb(7 9 11 / 0.92));
  }
  .tagline {
    font-family: var(--font-label);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .name {
    font-family: var(--font-display);
    font-size: 46px;
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
    font-size: 13px;
    color: var(--text);
    background: rgb(7 9 11 / 0.75);
    border: 1px solid var(--rule-strong);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tools button:hover {
    border-color: var(--structure);
  }
  .drop-hint {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: center;
    background: rgb(11 52 51 / 0.85);
    color: var(--structure-soft);
    font-family: var(--font-label);
    font-size: 13px;
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
    background: transparent;
    border: 1px dashed var(--rule-strong);
    color: var(--text);
    padding: 20px;
    text-align: center;
  }
  .blank:hover {
    border-style: solid;
  }
  .blank .name {
    font-size: 36px;
  }
  .plus {
    height: 44px;
    display: flex;
    align-items: center;
    font-family: var(--font-display);
    font-size: 64px;
    line-height: 1;
    color: var(--accent);
  }
  .plus.folder {
    color: var(--structure);
  }
  .blank .hint {
    font-size: 14px;
    color: var(--muted);
    max-width: 260px;
  }
</style>
