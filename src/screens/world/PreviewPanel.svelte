<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import Portrait from './Portrait.svelte';

  // The fixed-position preview (feature 1). It stays in one place on screen, so
  // selecting or deleting a linked name never sets it off.
  let { index, fs, id, onOpen }: { index: WikiIndex; fs: WorldFs; id: string | null; onOpen: (id: string) => void } = $props();

  const entry = $derived(id ? index.get(id) : undefined);
</script>

<aside class="preview" aria-label="Preview" aria-live="polite">
  <div class="label">Preview</div>
  {#if entry}
    <div class="card">
      <Portrait url={entry.imagePath ? fs.imageUrl(entry.imagePath) : null} name={entry.name} />
      <div class="name">{entry.name}</div>
      <div class="meta">{[...entry.aliases, folderLabel(entry.category)].join(' · ')}</div>
      {#if entry.summary}<p>{entry.summary}</p>{/if}
      <button type="button" onclick={() => onOpen(entry.id)}>Open entry</button>
    </div>
  {:else}
    <p class="hint">Click any underlined name to preview it here.</p>
  {/if}
</aside>

<style>
  .preview {
    width: 320px;
    flex-shrink: 0;
    border-left: 1px solid var(--rule);
    background: var(--surface-alt);
    padding: 24px 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }
  .label {
    font-size: 11px;
  }
  .card {
    background: var(--surface);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .name {
    font-family: var(--font-display);
    font-size: 30px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .meta {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--muted);
  }
  p {
    margin: 0;
    font-size: 15px;
    line-height: 1.55;
    color: var(--text-soft);
  }
  .hint {
    color: var(--muted);
  }
  button {
    align-self: flex-start;
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
    background: none;
    border: 0;
    padding: 8px 0;
    min-height: 40px;
  }
</style>
