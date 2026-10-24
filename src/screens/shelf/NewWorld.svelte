<script lang="ts">
  import { onMount } from 'svelte';
  import type { Library } from '../../lib/library/types';
  import type { ImageSource } from '../../lib/fs/types';
  import { slugify } from '../../lib/slug';
  import { worldFile } from '../../lib/world';
  import Dialog from './Dialog.svelte';

  // A new world with starter shelves (Mike, October 24): a wiki with a folder for each
  // kind of entry most worlds need, and an empty stories folder.
  let { library, onCreated, onCancel }: { library: Library; onCreated: (path: string) => void; onCancel: () => void } = $props();

  const SHELVES = ['people', 'places', 'factions', 'history'];

  let name = $state('');
  let tagline = $state('');
  let location = $state('');
  let shelves = $state<Record<string, boolean>>(Object.fromEntries(SHELVES.map((s) => [s, true])));
  let cover = $state<ImageSource | null>(null);
  let busy = $state(false);
  let problem = $state('');

  const folder = $derived(slugify(name));
  // Shown with the separator the location already uses, so Windows paths read naturally.
  const separator = $derived(location.includes('\\') ? '\\' : '/');
  const coverName = $derived(cover ? (cover.kind === 'path' ? cover.path.split(/[\\/]/).pop() : cover.file.name) : '');

  onMount(async () => {
    location = await library.defaultLocation();
  });

  async function chooseLocation() {
    const picked = await library.pickFolder('Where should the new world go?');
    if (picked) location = picked;
  }

  async function chooseCover() {
    cover = (await library.pickImage()) ?? cover;
  }

  async function create() {
    busy = true;
    problem = '';
    try {
      const dirs = ['stories', ...SHELVES.filter((s) => shelves[s]).map((s) => `wiki/${s}`)];
      if (!dirs.some((d) => d.startsWith('wiki/'))) dirs.push('wiki');
      const text = worldFile({ name: name.trim(), tagline: tagline.trim(), wikiDir: 'wiki', storiesDir: 'stories' });
      const path = await library.create(location, folder, text, dirs);
      if (cover) await library.setCover(path, cover);
      onCreated(path);
    } catch (e) {
      problem = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog title="New world" action="Create world" ready={!!folder && !!location} {busy} {problem} onSubmit={create} {onCancel}>
  <label for="nw-name" class="label">Name</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="nw-name" type="text" bind:value={name} autofocus autocomplete="off" placeholder="Harrowgate" />
  <label for="nw-tagline" class="label">Tagline</label>
  <input id="nw-tagline" type="text" bind:value={tagline} autocomplete="off" placeholder="A harbor town on stilts" />

  <div class="label">Starter shelves</div>
  <div class="shelves">
    {#each SHELVES as s}
      <label class="check"><input type="checkbox" bind:checked={shelves[s]} /> {s[0].toUpperCase() + s.slice(1)}</label>
    {/each}
  </div>

  <div class="label">Cover</div>
  <div class="row">
    <button type="button" class="secondary" onclick={chooseCover}>{cover ? 'Change picture' : 'Choose a picture'}</button>
    <span class="hint">{coverName || 'Optional. You can add one later.'}</span>
  </div>

  <div class="label">Location</div>
  <div class="row">
    <button type="button" class="secondary" onclick={chooseLocation}>Change</button>
    <span class="hint path">{location}{folder ? `${separator}${folder}` : ''}</span>
  </div>
</Dialog>

<style>
  .shelves {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    min-height: 32px;
  }
  .check input {
    accent-color: var(--structure);
    width: 16px;
    height: 16px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .path {
    font-family: var(--font-label);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
</style>
