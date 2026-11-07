<script lang="ts">
  import type { Kind } from '../../lib/game/elements';
  import type { Placed } from '../../lib/game/game';

  /**
   * Every element of one kind from one place, the engine or the world, as a list to open
   * and to add to. Core elements a world sets aside or reskins stay listed, marked.
   */
  let {
    kind,
    where,
    worldName,
    elements,
    onOpen,
    onNew,
  }: {
    kind: Kind;
    /** The engine's or the world's name. */
    where: string;
    worldName: string;
    elements: Placed[];
    onOpen: (key: string) => void;
    onNew: (name: string) => Promise<void>;
  } = $props();

  let filter = $state('');
  let naming = $state(false);
  let name = $state('');
  let problem = $state('');

  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return elements;
    return elements.filter((p) => p.element.name.toLowerCase().includes(q) || p.element.tags.some((t) => t.toLowerCase().includes(q)));
  });

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    problem = '';
    try {
      await onNew(n);
      naming = false;
      name = '';
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<article class="kind">
  <header>
    <div class="label">{where} · Kind</div>
    <h1>{kind.plural}</h1>
    <div class="row">
      <span class="meta">{elements.length} {elements.length === 1 ? 'element' : 'elements'}</span>
      <span class="spacer"></span>
      <input class="filter" type="search" placeholder="Filter by name or tag" bind:value={filter} aria-label="Filter {kind.plural}" />
      {#if naming}
        <form class="naming" onsubmit={add}>
          <!-- svelte-ignore a11y_autofocus -->
          <input type="text" bind:value={name} placeholder="Name" aria-label="New {kind.name}'s name" autofocus autocomplete="off" />
          <button type="submit" class="tool" disabled={!name.trim()}>Add</button>
          <button type="button" class="tool" onclick={() => ((naming = false), (name = ''))}>Cancel</button>
        </form>
      {:else}
        <button type="button" class="tool" onclick={() => (naming = true)}>+ {kind.name}</button>
      {/if}
    </div>
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  </header>
  {#if kind.about}<p class="about">{kind.about}</p>{/if}
  <ul>
    {#each shown as p (p.key)}
      <li>
        <button type="button" class:dim={p.setAside || !!p.reskinnedBy} onclick={() => onOpen(p.key)}>
          <span class="name">{p.element.name}</span>
          <span class="tags">{p.element.tags.filter((t) => t.toLowerCase() !== kind.id).join(', ')}</span>
          {#if p.setAside}<span class="flag">Set aside in {worldName}</span>{/if}
          {#if p.reskinnedBy}<span class="flag">Reskinned as {p.reskinnedBy.element.name}</span>{/if}
          {#if p.base}<span class="flag">Reskin of {p.base.element.name}</span>{/if}
        </button>
      </li>
    {:else}
      <li class="none">{filter ? 'Nothing matches.' : `No ${kind.plural.toLowerCase()} yet.`}</li>
    {/each}
  </ul>
</article>

<style>
  article {
    max-width: 720px;
  }
  header {
    margin-bottom: 14px;
  }
  h1 {
    color: var(--title);
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(48px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .spacer {
    flex: 1;
  }
  .meta {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .filter,
  .naming input {
    font: inherit;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
    box-sizing: border-box;
  }
  .naming {
    display: flex;
    gap: 6px;
  }
  .tool {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tool:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .about {
    margin: 0 0 14px;
    color: var(--text-soft);
    font-size: calc(14px * var(--type));
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  li button {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    text-align: left;
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--line);
    padding: 9px 4px;
  }
  li button:hover {
    background: var(--surface);
  }
  li button.dim .name {
    color: var(--muted);
    text-decoration: line-through;
  }
  .name {
    font-size: calc(16px * var(--type));
  }
  .tags,
  .flag {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .flag {
    color: var(--structure);
  }
  .none {
    padding: 12px 4px;
    color: var(--muted);
  }
</style>
