<script lang="ts">
  import { sync } from '../lib/sync.svelte';
  import { ui } from '../lib/ui.svelte';

  // A quiet word in the header about Git sync (Mike, October 26). It says nothing for a
  // world that does not sync, and opens This computer in Settings when clicked.
  const LABELS: Record<string, string> = { syncing: 'Syncing…', synced: 'Synced', local: 'Saved here', waiting: 'Sync waiting', problem: 'Sync problem' };
  const label = $derived(LABELS[sync.state] ?? '');
  const time = $derived(sync.at ? new Date(sync.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
  const title = $derived(sync.message || (sync.state === 'synced' && time ? `Synced with Git at ${time}` : 'Git sync'));
</script>

{#if label}
  <button type="button" class="sync {sync.state}" {title} onclick={() => (ui.settings = 'computer')}>
    <span class="dot" aria-hidden="true"></span>{label}
  </button>
{/if}

<style>
  .sync {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 6px 4px;
  }
  .sync:hover {
    color: var(--text);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--structure);
  }
  .syncing .dot {
    animation: pulse 1s ease-in-out infinite alternate;
  }
  .waiting .dot,
  .local .dot {
    background: var(--muted);
  }
  .problem {
    color: var(--danger);
  }
  .problem .dot {
    background: var(--danger);
  }
  @keyframes pulse {
    from {
      opacity: 0.3;
    }
  }
</style>
