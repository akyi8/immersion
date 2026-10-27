<script lang="ts">
  import { portal } from '../../lib/portal';
  import type { Folder, WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';

  // One small form for a new entry or a new category. Categories are chosen as chips,
  // so nobody has to think about folders (Mike, October 25).
  let {
    index,
    kind,
    startFolder,
    startName = '',
    onCreate,
    onCancel,
  }: {
    index: WikiIndex;
    kind: 'entry' | 'folder';
    startFolder: string;
    startName?: string;
    onCreate: (name: string, folder: string) => Promise<string | null>;
    onCancel: () => void;
  } = $props();

  const root = $derived(index.root);
  const categories = $derived(root.folders);

  /** The top-level category that holds a folder, or the wiki itself. */
  function categoryOf(path: string): Folder | null {
    return categories.find((c) => path === c.path || path.startsWith(c.path + '/')) ?? null;
  }

  function flatten(folder: Folder, depth: number): { path: string; label: string }[] {
    const here = { path: folder.path, label: `${'  '.repeat(depth)}${folderLabel(folder.name)}` };
    return [here, ...folder.folders.flatMap((f) => flatten(f, depth + 1))];
  }

  // svelte-ignore state_referenced_locally
  let folder = $state(startFolder);
  // svelte-ignore state_referenced_locally
  let name = $state(startName);
  let problem = $state('');
  let busy = $state(false);

  const category = $derived(categoryOf(folder));
  const inside = $derived(category && category.folders.length ? flatten(category, 0) : []);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    busy = true;
    problem = (await onCreate(name.trim(), folder)) ?? '';
    busy = false;
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onCancel()} />

<div class="backdrop" role="presentation" onclick={onCancel} use:portal></div>
<form use:portal class="dialog" aria-label={kind === 'entry' ? 'New entry' : 'New category'} onsubmit={submit}>
  <h2>{kind === 'entry' ? 'New entry' : 'New category'}</h2>
  <label for="create-name" class="label">Name</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="create-name" type="text" bind:value={name} autofocus autocomplete="off" placeholder={kind === 'entry' ? 'Tomas Reyes' : 'Factions'} />
  <div class="label">{kind === 'entry' ? 'Category' : 'Inside'}</div>
  <div class="chips" role="radiogroup" aria-label={kind === 'entry' ? 'Category' : 'Inside'}>
    {#if kind === 'folder' || !categories.length}
      <button type="button" role="radio" aria-checked={folder === root.path} class:on={folder === root.path} onclick={() => (folder = root.path)}>
        {kind === 'folder' ? 'Top level' : 'Unfiled'}
      </button>
    {/if}
    {#each categories as c}
      <button type="button" role="radio" aria-checked={category?.path === c.path} class:on={category?.path === c.path} onclick={() => (folder = c.path)}>
        {folderLabel(c.name)}
      </button>
    {/each}
  </div>
  {#if inside.length > 1}
    <label for="create-folder" class="label">Within {category ? folderLabel(category.name) : ''}</label>
    <select id="create-folder" bind:value={folder}>
      {#each inside as f}
        <option value={f.path}>{f.label}</option>
      {/each}
    </select>
  {/if}
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  <div class="actions">
    <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
    <button type="submit" class="create" disabled={busy || !name.trim()}>Create</button>
  </div>
</form>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--shadow);
    z-index: 20;
  }
  .dialog {
    position: fixed;
    top: 18vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(480px, calc(100vw - 32px));
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 21;
  }
  h2 {
    margin: 0 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(34px * var(--type));
    letter-spacing: 0.02em;
  }
  .label {
    font-size: calc(11px * var(--type));
    margin-top: 6px;
  }
  input,
  select {
    font: inherit;
    font-size: calc(16px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 10px 12px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    font-size: calc(14px * var(--type));
    color: var(--text-soft);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 12px;
    min-height: 36px;
  }
  .chips button.on {
    color: var(--structure-soft);
    background: var(--structure-deep);
    border-color: var(--structure);
  }
  .problem {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
  .actions button {
    font-size: calc(14px * var(--type));
    padding: 10px 16px;
    min-height: 44px;
    border: 0;
  }
  .cancel {
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--edge) !important;
    border-radius: var(--round);
  }
  .create {
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
  }
  .create:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
