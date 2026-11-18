<script lang="ts" generics="T">
  /**
   * The one control for choosing between two or three things (Mike, November 17): a soft
   * track with the chosen part raised, in the same grey as a selected row. Every such
   * choice in the app is drawn with it, so the idea has one look.
   */
  let {
    options,
    value,
    onpick,
    label,
    fill = false,
    small = false,
    disabled = false,
  }: {
    /** Each choice: its value, its words, and what it says on hover, if anything. */
    options: readonly (readonly [T, string, string?])[];
    value: T;
    onpick: (value: T) => void;
    /** What is being chosen, for a screen reader. */
    label: string;
    /** Stretches across the space it is given, each part the same width. */
    fill?: boolean;
    small?: boolean;
    disabled?: boolean;
  } = $props();

  function step(e: KeyboardEvent) {
    const by = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!by || disabled) return;
    e.preventDefault();
    const at = options.findIndex(([v]) => v === value);
    const next = (Math.max(at, 0) + by + options.length) % options.length;
    onpick(options[next][0]);
    const parts = (e.currentTarget as HTMLElement).querySelectorAll('button');
    parts[next]?.focus();
  }
</script>

<div class="pick" class:fill class:small role="radiogroup" aria-label={label} tabindex="-1" onkeydown={step}>
  {#each options as [v, words, about] (words)}
    <button type="button" role="radio" aria-checked={value === v} class:on={value === v} tabindex={value === v || (!options.some(([o]) => o === value) && v === options[0][0]) ? 0 : -1} title={about} {disabled} onclick={() => onpick(v)}>{words}</button>
  {/each}
</div>

<style>
  .pick {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    background: color-mix(in oklab, var(--text) 7%, transparent);
    border-radius: 10px;
    max-width: 100%;
    box-sizing: border-box;
  }
  .pick.fill {
    display: flex;
  }
  .pick.fill button {
    flex: 1;
  }
  button {
    font-family: inherit;
    font-size: calc(13px * var(--type));
    line-height: 1.2;
    color: var(--muted);
    background: none;
    border: 0;
    /* The layouts round every button their own way. This one keeps the track's shape. */
    border-radius: 8px !important;
    padding: 7px 13px;
    min-height: 30px;
    white-space: nowrap;
  }
  .small button {
    font-size: calc(12px * var(--type));
    padding: 4px 10px;
    min-height: 24px;
  }
  button:hover:not(:disabled) {
    color: var(--text);
  }
  button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.18);
  }
</style>
