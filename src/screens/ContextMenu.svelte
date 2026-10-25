<script lang="ts">
  import { tick } from 'svelte';
  import { contextMenu } from '../lib/contextMenu.svelte';

  // The one right-click menu, placed at the pointer and kept inside the window.
  let menu: HTMLDivElement | undefined = $state();
  let left = $state(0);
  let top = $state(0);

  $effect(() => {
    if (!contextMenu.open) return;
    left = contextMenu.x;
    top = contextMenu.y;
    tick().then(() => {
      if (!menu) return;
      const box = menu.getBoundingClientRect();
      left = Math.min(left, window.innerWidth - box.width - 8);
      top = Math.min(top, window.innerHeight - box.height - 8);
      menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
  });

  function choose(run: () => void) {
    contextMenu.close();
    run();
  }

  function onkey(event: KeyboardEvent) {
    if (!contextMenu.open || !menu) return;
    if (event.key === 'Escape') return contextMenu.close();
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  }
</script>

<svelte:window onkeydown={onkey} onresize={() => contextMenu.close()} />

{#if contextMenu.open}
  <div class="catch" role="presentation" onmousedown={() => contextMenu.close()} oncontextmenu={(e) => (e.preventDefault(), contextMenu.close())}></div>
  <div class="menu" role="menu" bind:this={menu} style:left="{left}px" style:top="{top}px">
    {#each contextMenu.items as item}
      {#if item === 'separator'}
        <div class="separator" role="separator"></div>
      {:else}
        <button type="button" role="menuitem" disabled={item.disabled} onclick={() => choose(item.run)}>{item.label}</button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .catch {
    position: fixed;
    inset: 0;
    z-index: 30;
  }
  .menu {
    position: fixed;
    z-index: 31;
    display: flex;
    flex-direction: column;
    min-width: 200px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    box-shadow: 0 10px 28px rgb(0 0 0 / 0.55);
  }
  button {
    text-align: left;
    font-size: 14px;
    color: var(--text);
    background: none;
    border: 0;
    padding: 8px 12px;
    min-height: 34px;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    outline: none;
    background: var(--structure-deep);
    color: var(--structure-soft);
  }
  button:disabled {
    color: var(--muted);
    opacity: 0.5;
    cursor: default;
  }
  .separator {
    height: 1px;
    margin: 4px 6px;
    background: var(--rule);
  }
</style>
