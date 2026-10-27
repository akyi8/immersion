<script lang="ts">
  import { portal } from '../../lib/portal';
  import type { Snippet } from 'svelte';

  // The frame shared by the shelf's forms: a title, the fields, a problem line, and
  // Cancel beside the main action.
  let {
    title,
    action,
    ready,
    busy,
    problem,
    onSubmit,
    onCancel,
    children,
  }: {
    title: string;
    action: string;
    ready: boolean;
    busy: boolean;
    problem: string;
    onSubmit: () => void;
    onCancel: () => void;
    children: Snippet;
  } = $props();

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onCancel()} />

<div class="backdrop" role="presentation" onclick={onCancel} use:portal></div>
<form use:portal class="dialog" aria-label={title} onsubmit={submit}>
  <h2>{title}</h2>
  {@render children()}
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  <div class="actions">
    <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
    <button type="submit" class="go" disabled={!ready || busy}>{busy ? 'Working…' : action}</button>
  </div>
</form>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 20;
  }
  .dialog {
    position: fixed;
    top: 12vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 32px));
    max-height: 80vh;
    overflow-y: auto;
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 26px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 21;
  }
  h2 {
    margin: 0 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(38px * var(--type));
    letter-spacing: 0.02em;
  }
  .dialog :global(.label) {
    font-size: calc(11px * var(--type));
    margin-top: 8px;
  }
  .dialog :global(input[type='text']),
  .dialog :global(select) {
    font: inherit;
    font-size: calc(16px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 10px 12px;
  }
  .dialog :global(.hint) {
    margin: 0;
    font-size: calc(14px * var(--type));
    line-height: 1.5;
    color: var(--muted);
  }
  .dialog :global(.secondary) {
    font-size: calc(14px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 12px;
    min-height: 40px;
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
    margin-top: 16px;
  }
  .actions button {
    font-size: calc(14px * var(--type));
    padding: 10px 18px;
    min-height: 44px;
    border: 0;
  }
  .cancel {
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--edge) !important;
    border-radius: var(--round);
  }
  .go {
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
  }
  .go:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
