<script lang="ts">
  import type { Pending } from '../lib/fs/types';

  /**
   * What waits to sync, and a button that syncs now (Mike, October 28). The number is
   * the files that would go out to other computers, and an arrow down counts the files
   * that would come in. A dash means this does not sync through Git.
   */
  let {
    counts,
    busy = false,
    tone = 'calm',
    note = '',
    onSync,
    onDetails,
  }: {
    counts: Pending | null;
    busy?: boolean;
    /** `calm` when all is well, `quiet` for waiting or saved here, `problem` for a problem. */
    tone?: 'calm' | 'quiet' | 'problem';
    /** A word or two after the count, such as "Waiting". */
    note?: string;
    onSync: () => void;
    onDetails?: () => void;
  } = $props();

  const syncs = $derived(counts?.state === 'git' || counts?.state === 'local');
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const title = $derived.by(() => {
    if (!counts) return 'Counting what waits to sync';
    if (counts.state === 'not-git') return 'Not synced through Git';
    if (counts.state === 'off') return 'Syncing is switched off on this computer';
    const parts = [`${plural(counts.out, 'file')} to send`];
    if (counts.state === 'git') parts.push(`${plural(counts.incoming, 'file')} to bring in`);
    else parts.push('nowhere to push to yet');
    return parts.join(' · ');
  });
</script>

{#if counts}
  <div class="count {tone}" class:off={!syncs}>
    <button type="button" class="figures" {title} aria-label={title} onclick={() => onDetails?.()} disabled={!onDetails}>
      {#if syncs}
        <span class="dot" aria-hidden="true"></span>
        <span class="out">{counts.out}</span>
        {#if counts.incoming > 0}<span class="in">↓{counts.incoming}</span>{/if}
        {#if note}<span class="note">{note}</span>{/if}
      {:else}
        <span class="dash">–</span>
      {/if}
    </button>
    {#if syncs}
      <button type="button" class="now" class:busy title={busy ? 'Syncing…' : 'Sync now'} aria-label={busy ? 'Syncing' : 'Sync now'} disabled={busy} onclick={onSync}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13.2 6.2 A5.4 5.4 0 0 0 3.4 4.6 M2.8 9.8 A5.4 5.4 0 0 0 12.6 11.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          <path d="M13.6 2.6 V6.4 H9.8 M2.4 13.4 V9.6 H6.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    {/if}
  </div>
{/if}

<style>
  .count {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    letter-spacing: 0.04em;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 6px 6px;
    min-height: 32px;
  }
  button:not(:disabled):hover {
    color: var(--text);
  }
  .figures:disabled {
    cursor: default;
  }
  .out {
    color: var(--text-soft);
  }
  .in {
    color: var(--structure);
  }
  .note {
    font-size: calc(11px * var(--type));
    text-transform: uppercase;
  }
  .dash {
    padding: 0 4px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--structure);
  }
  .quiet .dot {
    background: var(--muted);
  }
  .problem .figures,
  .problem .out {
    color: var(--danger);
  }
  .problem .dot {
    background: var(--danger);
  }
  .now {
    width: 32px;
    justify-content: center;
    padding: 0;
  }
  .now.busy svg {
    animation: turn 1.1s linear infinite;
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
</style>
