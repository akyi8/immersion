<script lang="ts">
  import { mode, type ModeChoice } from '../lib/mode.svelte';

  // Dark, light, or whatever the computer is set to (Mike, October 25).
  const CHOICES: [ModeChoice, string, string][] = [
    ['dark', 'Dark', 'M11.5 9.5 A5 5 0 0 1 6.5 3.5 A5 5 0 1 0 11.5 9.5 Z'],
    ['light', 'Light', ''],
    ['system', 'Match this computer', ''],
  ];
</script>

<div class="mode" role="radiogroup" aria-label="Light or dark">
  {#each CHOICES as [value, label, path]}
    <button type="button" role="radio" aria-checked={mode.choice === value} class:on={mode.choice === value} title={label} aria-label={label} onclick={() => mode.set(value)}>
      <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
        {#if value === 'dark'}
          <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" />
        {:else if value === 'light'}
          <circle cx="7.5" cy="7.5" r="2.8" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M7.5 1 V2.8 M7.5 12.2 V14 M1 7.5 H2.8 M12.2 7.5 H14 M2.9 2.9 L4.2 4.2 M10.8 10.8 L12.1 12.1 M2.9 12.1 L4.2 10.8 M10.8 4.2 L12.1 2.9" stroke="currentColor" stroke-width="1.4" />
        {:else}
          <circle cx="7.5" cy="7.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M7.5 2 A5.5 5.5 0 0 1 7.5 13 Z" fill="currentColor" />
        {/if}
      </svg>
    </button>
  {/each}
</div>

<style>
  .mode {
    display: flex;
    border: 1px solid var(--rule-strong);
  }
  button {
    width: 36px;
    min-height: 38px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 0;
  }
  button:hover {
    color: var(--text);
  }
  button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
</style>
