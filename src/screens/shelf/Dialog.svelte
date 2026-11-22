<script lang="ts">
  import { Dialog } from 'bits-ui';
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

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (ready && !busy) onSubmit();
  }
</script>

<!--
  The form's behavior comes from Bits UI's Dialog: it keeps the keyboard inside the form,
  hands it back to whatever had it when the form closes, answers Escape, and tells a
  screen reader that the rest of the window is set aside. The look is this file's own.
  The form is on screen for as long as this component is, so it is always open, and a
  request to close it is passed to `onCancel`.
-->
<Dialog.Root open onOpenChange={(open) => !open && cancel()}>
  <Dialog.Portal>
    <Dialog.Overlay>
      {#snippet child({ props })}
        <div {...props} class="backdrop" class:above></div>
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content
      aria-label={title}
      onEscapeKeydown={(e) => {
        e.preventDefault();
        cancel();
      }}
      onInteractOutside={(e) => {
        e.preventDefault();
        cancel();
      }}>
      {#snippet child({ props })}
        <form {...props} class="dialog" class:wide class:above onsubmit={submit}>
          <Dialog.Title>
            {#snippet child({ props: heading })}
              <h2 {...heading}>{title}</h2>
            {/snippet}
          </Dialog.Title>
          {@render children()}
          {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
          <div class="actions">
            <button type="button" class="cancel" disabled={busy} onclick={cancel}>Cancel</button>
            <button type="submit" class="go" disabled={!ready || busy}>{busy ? 'Working…' : action}</button>
          </div>
        </form>
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

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
