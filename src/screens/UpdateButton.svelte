<script lang="ts">
  import { installUpdate } from '../lib/updates';
  import { updates } from '../lib/updates.svelte';

  // The shelf and the world's header show the same button, from the one shared check.
  const update = $derived(updates.available);
  let updating = $state(false);
  let updateError = $state('');

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
    font-size: calc(13px * var(--type));
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
