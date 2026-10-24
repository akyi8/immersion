<script lang="ts">
  import type { FolderShape, Library } from '../../lib/library/types';
  import { worldFile } from '../../lib/world';
  import Dialog from './Dialog.svelte';

  // Describes an existing folder of writing as a world (Mike, October 24). The answers
  // become a world.md written into the folder, and nothing else in it changes.
  let {
    library,
    path,
    shape,
    onAdded,
    onCancel,
  }: { library: Library; path: string; shape: FolderShape; onAdded: (path: string) => void; onCancel: () => void } = $props();

  const folderName = $derived(path.split(/[\\/]/).filter(Boolean).pop() ?? '');
  // A folder name like "project-unflinching-gothic" suggests "Unflinching Gothic".
  function suggestName(folder: string): string {
    return folder
      .replace(/^project[-_ ]/i, '')
      .split(/[-_ ]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }
  // The folder with the most markdown is the likeliest wiki, and one named for
  // stories, drafts, or manuscripts is the likeliest home for stories.
  function guessStories(shape: FolderShape, wiki: string): string {
    const named = shape.folders.find((f) => f.name !== wiki && /stor|draft|manuscript|chapter|book/i.test(f.name));
    return named?.name ?? '';
  }

  // svelte-ignore state_referenced_locally
  let name = $state(suggestName(folderName));
  let tagline = $state('');
  // svelte-ignore state_referenced_locally
  let wiki = $state(shape.folders[0]?.name ?? '');
  // svelte-ignore state_referenced_locally
  let stories = $state(guessStories(shape, shape.folders[0]?.name ?? ''));
  let busy = $state(false);
  let problem = $state('');

  async function add() {
    busy = true;
    problem = '';
    try {
      const text = worldFile({ name: name.trim(), tagline: tagline.trim(), wikiDir: wiki || 'wiki', storiesDir: stories || 'stories' });
      await library.add(path, text);
      onAdded(path);
    } catch (e) {
      problem = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog title="Add a world" action="Add to the shelf" ready={!!name.trim()} {busy} {problem} onSubmit={add} {onCancel}>
  <p class="hint">
    <code>{folderName}</code> becomes a world when it has a <code>world.md</code>. Immersion writes that one file from your
    answers and leaves everything else in the folder as it is.
  </p>
  <label for="aw-name" class="label">Name</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="aw-name" type="text" bind:value={name} autofocus autocomplete="off" />
  <label for="aw-tagline" class="label">Tagline</label>
  <input id="aw-tagline" type="text" bind:value={tagline} autocomplete="off" placeholder="One line for under the name" />
  <label for="aw-wiki" class="label">Wiki folder</label>
  <select id="aw-wiki" bind:value={wiki}>
    {#each shape.folders as f}
      <option value={f.name}>{f.name} · {f.markdown} {f.markdown === 1 ? 'file' : 'files'}</option>
    {/each}
    <option value="">A new wiki folder</option>
  </select>
  <label for="aw-stories" class="label">Stories folder</label>
  <select id="aw-stories" bind:value={stories}>
    <option value="">A new stories folder</option>
    {#each shape.folders.filter((f) => f.name !== wiki) as f}
      <option value={f.name}>{f.name} · {f.markdown} {f.markdown === 1 ? 'file' : 'files'}</option>
    {/each}
  </select>
</Dialog>

<style>
  code {
    font-family: var(--font-label);
    font-size: 0.9em;
    color: var(--text);
  }
</style>
