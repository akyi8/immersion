<script lang="ts" module>
  import type { Update } from '@tauri-apps/plugin-updater';
  import { findUpdate, installUpdate } from '../lib/updates';

  // A newer build, if GitHub has one. The question is asked once per launch and shared,
  // so the shelf and the world's header show the same button.
  let shared: Promise<Update | null> | null = null;
  function newerBuild(): Promise<Update | null> {
    shared ??= findUpdate();
    return shared;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  let update = $state<Update | null>(null);
  let updating = $state(false);
  let updateError = $state('');

  onMount(() => {
    newerBuild().then((u) => (update = u));
  });

  async function runUpdate() {
    if (!update) return;
    updating = true;
    updateError = '';
    try {
      await installUpdate(update);
    } catch (e) {
      updateError = String(e);
      updating = false;
    }
  }
</script>

{#if update}
  <button type="button" class="update" disabled={updating} title={updateError || `Install Immersion ${update.version}`} onclick={runUpdate}>
    {updating ? 'Updating…' : updateError ? 'Update failed, retry' : `Update to ${update.version}`}
  </button>
{/if}

<style>
  .update {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border: 0;
    padding: 9px 14px;
    min-height: 40px;
  }
  .update:disabled {
    opacity: 0.7;
    cursor: default;
  }
</style>
