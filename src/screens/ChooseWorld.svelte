<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { openWorldFolder } from '../lib/fs/disk';
  import { appVersion } from '../lib/version';
  import { onMount } from 'svelte';

  let { onOpened }: { onOpened: () => void } = $props();
  let error = $state('');
  let busy = $state(false);
  let version = $state('');
  onMount(() => {
    appVersion().then((v) => (version = v));
  });

  async function choose() {
    error = '';
    const picked = await open({ directory: true, title: 'Choose a world folder' });
    if (typeof picked !== 'string') return;
    busy = true;
    try {
      await openWorldFolder(picked);
      onOpened();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<main>
  <div class="mark" aria-hidden="true"></div>
  <h1>Immersion</h1>
  <p>Choose a world folder to open. A world is any folder with a <code>world.md</code> file in it.</p>
  <button type="button" onclick={choose} disabled={busy}>Choose a world folder</button>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if version}<p class="label">Immersion {version}</p>{/if}
</main>

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 0 16px;
    text-align: center;
  }
  .mark {
    width: 60px;
    height: 132px;
    border: 10px solid var(--accent);
    border-bottom: 0;
    box-sizing: border-box;
    margin-bottom: 8px;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 96px;
    letter-spacing: 0.02em;
    line-height: 0.95;
  }
  p {
    margin: 0;
    max-width: 520px;
    font-size: var(--prose-size);
    line-height: 1.6;
    color: var(--text-soft);
  }
  code {
    font-family: var(--font-label);
    font-size: 0.9em;
    color: var(--text);
  }
  button {
    margin-top: 8px;
    font-weight: 700;
    font-size: 16px;
    color: var(--accent-ink);
    background: var(--accent);
    border: 0;
    padding: 14px 28px;
    min-height: 48px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .error {
    color: #ff9a9a;
  }
</style>
