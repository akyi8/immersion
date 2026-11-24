<script lang="ts">
  import Dialog from './shelf/Dialog.svelte';
  import Icon from './Icon.svelte';
  import { icons, ICON_GROUPS, NO_ICON } from '../lib/icons.svelte';

  /**
   * ICONS TRIAL (Cerys, November 24). The form for choosing an icon, for a wiki category, a
   * game label, or one entry. A search over the names of every icon, tabs that gather
   * icons by what they show, and the icons themselves to click.
   */
  let {
    what,
    current,
    start = 'characters',
    fallback = false,
    onPick,
    onCancel,
  }: {
    /** What the icon is for, such as "People" or "Tomas Reyes". */
    what: string;
    current: string | null;
    /** The tab the form opens on. */
    start?: string;
    /** True for one entry, which can go back to its category's icon. */
    fallback?: boolean;
    /** Called with an icon's name, with NO_ICON for none, or with null to go back to the type's icon. */
    onPick: (name: string | null) => Promise<void>;
    onCancel: () => void;
  } = $props();

  const SHOWN = 240;
  let query = $state('');
  let tab = $state((() => start)());
  let chosen = $state((() => current)());
  let busy = $state(false);
  let problem = $state('');

  $effect(() => void icons.load());

  const found = $derived.by(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '-');
    const test = ICON_GROUPS.find(([id]) => id === tab)?.[2] ?? null;
    // A search looks through every icon, whatever tab is open.
    return icons.names.filter((n) => (q ? n.includes(q) : !test || test.test(n)));
  });

  async function use(name: string | null) {
    busy = true;
    problem = '';
    try {
      await onPick(name);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog title="An icon for {what}" action="Use this icon" ready={!!chosen && chosen !== current} {busy} {problem} wide onSubmit={() => use(chosen)} {onCancel}>
  <input id="icon-search" class="search" type="text" bind:value={query} placeholder="Search {icons.names.length ? icons.names.length.toLocaleString() : ''} icons" aria-label="Search icons" autocomplete="off" />
  <div class="tabs" role="tablist" aria-label="Kinds of icon">
    {#each ICON_GROUPS as [id, label] (id)}
      <button type="button" role="tab" aria-selected={!query && tab === id} class:on={!query && tab === id} onclick={() => ((tab = id), (query = ''))}>{label}</button>
    {/each}
  </div>
  <div class="grid" role="listbox" aria-label="Icons">
    {#each found.slice(0, SHOWN) as name (name)}
      <button type="button" role="option" aria-selected={chosen === name} class:on={chosen === name} title={name.replace(/-/g, ' ')} aria-label={name.replace(/-/g, ' ')} onclick={() => (chosen = name)} ondblclick={() => use(name)}>
        <Icon {name} size={24} />
      </button>
    {:else}
      <p class="none">{icons.names.length ? 'No icon has that in its name.' : 'Fetching the icons…'}</p>
    {/each}
  </div>
  <p class="count">
    {#if found.length > SHOWN}Showing {SHOWN} of {found.length.toLocaleString()}. Search to narrow them.{:else if found.length}{found.length.toLocaleString()} {found.length === 1 ? 'icon' : 'icons'}{/if}
    {#if chosen && chosen !== NO_ICON}<span class="picked">· {chosen.replace(/-/g, ' ')}</span>{/if}
  </p>
  <div class="other">
    <button type="button" disabled={busy} onclick={() => use(NO_ICON)}>No icon</button>
    {#if fallback}<button type="button" disabled={busy} onclick={() => use(null)}>Use its category's icon</button>{/if}
  </div>
</Dialog>

<style>
  .search {
    width: 100%;
    box-sizing: border-box;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .tabs button {
    padding: 4px 10px;
    font: inherit;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    background: none;
    border: 0;
    border-radius: var(--round);
    cursor: pointer;
  }
  .tabs button:hover {
    color: var(--text);
  }
  .tabs button.on {
    color: var(--text);
    background: var(--selected-bg);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
    gap: 4px;
    height: 300px;
    overflow-y: auto;
    align-content: start;
    padding: 2px;
  }
  .grid button {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    color: var(--text-soft);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--round);
    cursor: pointer;
  }
  .grid button:hover {
    color: var(--text);
    background: var(--selected-bg);
  }
  .grid button.on {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--selected-bg);
  }
  .none {
    grid-column: 1 / -1;
    margin: 20px 0;
    color: var(--muted);
  }
  .count {
    margin: 0;
    min-height: 1.4em;
    color: var(--muted);
    font-size: calc(12px * var(--type));
  }
  .picked {
    color: var(--text-soft);
  }
  .other {
    display: flex;
    gap: 8px;
  }
  .other button {
    padding: 6px 10px;
    font: inherit;
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--round);
    cursor: pointer;
  }
  .other button:hover {
    color: var(--text);
  }
  /* In the picker an icon is the color of its button, so the chosen one shows. */
  .grid {
    --icon: currentColor;
  }
</style>
