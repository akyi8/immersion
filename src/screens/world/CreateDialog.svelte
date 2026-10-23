<script lang="ts">
  import type { Folder, WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';

  // One small form for both a new entry and a new folder.
  let {
    index,
    kind,
    startFolder,
    onCreate,
    onCancel,
  }: {
    index: WikiIndex;
    kind: 'entry' | 'folder';
    startFolder: string;
    onCreate: (name: string, folder: string) => Promise<string | null>;
    onCancel: () => void;
  } = $props();

  function flatten(folder: Folder, depth: number): { path: string; label: string }[] {
    const here = { path: folder.path, label: depth === 0 ? 'Top of the wiki' : `${'  '.repeat(depth - 1)}${folderLabel(folder.name)}` };
    return [here, ...folder.folders.flatMap((f) => flatten(f, depth + 1))];
  }
  const folders = $derived(flatten(index.root, 0));

  // svelte-ignore state_referenced_locally
  let folder = $state(startFolder);
  let name = $state('');
  let problem = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    busy = true;
    problem = (await onCreate(name.trim(), folder)) ?? '';
    busy = false;
  }
</script>

<div class="backdrop" role="presentation" onclick={onCancel}></div>
<form class="dialog" aria-label={kind === 'entry' ? 'New entry' : 'New folder'} onsubmit={submit}>
  <h2>{kind === 'entry' ? 'New entry' : 'New folder'}</h2>
  <label for="create-name" class="label">Name</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="create-name" type="text" bind:value={name} autofocus autocomplete="off" placeholder={kind === 'entry' ? 'Tomas Reyes' : 'Minor characters'} />
  <label for="create-folder" class="label">{kind === 'entry' ? 'In folder' : 'Inside'}</label>
  <select id="create-folder" bind:value={folder}>
    {#each folders as f}
      <option value={f.path}>{f.label}</option>
    {/each}
  </select>
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
    background: rgb(0 0 0 / 0.5);
    z-index: 20;
  }
  .dialog {
    position: fixed;
    top: 18vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(440px, calc(100vw - 32px));
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--rule-strong);
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
    font-size: 34px;
    letter-spacing: 0.02em;
  }
  .label {
    font-size: 11px;
    margin-top: 6px;
  }
  input,
  select {
    font: inherit;
    font-size: 16px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--rule-strong);
    padding: 10px 12px;
  }
  .problem {
    margin: 4px 0 0;
    color: #ff9a9a;
    font-size: 14px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
  .actions button {
    font-size: 14px;
    padding: 10px 16px;
    min-height: 44px;
    border: 0;
  }
  .cancel {
    color: var(--text);
    background: none;
    border: 1px solid var(--rule-strong) !important;
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
