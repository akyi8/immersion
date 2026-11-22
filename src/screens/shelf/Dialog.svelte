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
    wide = false,
    above = false,
  }: {
    title: string;
    action: string;
    ready: boolean;
    busy: boolean;
    problem: string;
    onSubmit: () => void;
    onCancel: () => void;
    children: Snippet;
    /** A wider dialog, for work that needs room, such as framing a picture. */
    wide?: boolean;
    /** Stands above the Settings page, for a dialog opened from it. */
    above?: boolean;
  } = $props();

  // A form that is partway through its work stays until the work ends, so nothing is
  // left half done behind a closed form.
  const cancel = () => {
    if (!busy) onCancel();
  };

  /**
   * Keeps the keyboard inside the form while it is open, and gives it back to whatever
   * had it when the form closes.
   */
  function held(node: HTMLElement) {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const stops = () => [...node.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex], [contenteditable]')].filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0 && el.offsetParent !== null);
    queueMicrotask(() => {
      if (!node.contains(document.activeElement)) stops()[0]?.focus();
    });
    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = stops();
      if (!all.length) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    node.addEventListener('keydown', keys);
    return {
      destroy() {
        node.removeEventListener('keydown', keys);
        if (before?.isConnected) before.focus({ preventScroll: true });
      },
    };
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (e.preventDefault(), cancel())} />

<div class="backdrop" class:above role="presentation" onclick={cancel} use:portal></div>
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<form use:portal use:held class="dialog" class:wide class:above role="dialog" aria-modal="true" aria-label={title} onsubmit={submit}>
  <h2>{title}</h2>
  {@render children()}
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  <div class="actions">
    <button type="button" class="cancel" disabled={busy} onclick={cancel}>Cancel</button>
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
  .backdrop.above {
    z-index: 26;
  }
  .dialog.above {
    z-index: 27;
  }
  .dialog.wide {
    width: min(760px, calc(100vw - 32px));
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
