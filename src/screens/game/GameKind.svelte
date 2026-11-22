<script lang="ts">
  import { keepWord, word } from '../../lib/prefs';
  import { errorText } from '../../lib/errors';
  import type { Element, Kind } from '../../lib/game/elements';
  import Pick from '../Pick.svelte';
  import SheetRow from './SheetRow.svelte';
  import type { Placed } from '../../lib/game/game';

  /**
   * Every element of one kind from one place, the engine or the world, as a list to open
   * and to add to. Core elements a world sets aside or reskins stay listed, marked.
   *
   * The same elements also show as a sheet (Cerys, November 21): one row for each, one
   * column for each of the kind's fields, typed in place. The list and each element's own
   * form stay as they were, and the page remembers which of the two was last used.
   */
  let {
    kind,
    where,
    worldName,
    elements,
    engineName = '',
    onOpen,
    onNew,
    onSave,
    onNewHere,
  }: {
    kind: Kind;
    /** The engine's or the world's name. */
    where: string;
    worldName: string;
    elements: Placed[];
    onOpen: (key: string) => void;
    onNew: (name: string) => Promise<void>;
    engineName?: string;
    /** Saves one element from its row of the sheet. Without it the page is a list only. */
    onSave?: (p: Placed, next: Element, base: Element) => Promise<void>;
    /** Adds an element and stays on this page, for the sheet's last row. */
    onNewHere?: (name: string) => Promise<void>;
  } = $props();

  const SHOW = 'immersion.game.kind-view';
  let show = $state<'list' | 'sheet'>(word(SHOW) === 'sheet' ? 'sheet' : 'list');
  function setShow(v: 'list' | 'sheet') {
    show = v;
    keepWord(SHOW, v);
  }
  const sheet = $derived(show === 'sheet' && !!onSave);
  let fresh = $state('');
  async function addHere(e: SubmitEvent) {
    e.preventDefault();
    const n = fresh.trim();
    if (!n) return;
    problem = '';
    try {
      await (onNewHere ?? onNew)(n);
      fresh = '';
    } catch (err) {
      problem = errorText(err);
    }
  }

  let filter = $state('');
  let naming = $state(false);
  let name = $state('');
  let problem = $state('');

  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return elements;
    return elements.filter((p) => p.element.name.toLowerCase().includes(q) || p.element.tags.some((t) => t.toLowerCase().includes(q)));
  });

  // A reskin takes its mechanics from another element, so it is edited in its own form.
  const rows = $derived(shown.filter((p) => !p.base));

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
      problem = errorText(err);
    }
  }
</script>

<article class="kind" class:wide={sheet}>
  <header>
    <div class="label">{where} · Kind</div>
    <h1>{kind.plural}</h1>
    <div class="row">
      <span class="meta">{elements.length} {elements.length === 1 ? 'element' : 'elements'}</span>
      <span class="spacer"></span>
      {#if onSave}<Pick small label="Show {kind.plural} as" value={show} onpick={setShow} options={[['list', 'List'], ['sheet', 'Sheet']] as const} />{/if}
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
  {#if sheet}
    <div class="sheet">
      <table>
        <thead>
          <tr>
            <th scope="col" class="name-col">Name</th>
            {#each kind.fields as f (f.key)}<th scope="col" class={f.type}>{f.label}</th>{/each}
            <th scope="col" class="text">{kind.body ?? 'Flavor'}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as p (p.key)}
            <SheetRow placed={p} {kind} {engineName} onSave={(next, base) => onSave!(p, next, base)} onOpen={() => onOpen(p.key)} />
          {:else}
            <tr><td class="none" colspan={kind.fields.length + 2}>{filter ? 'Nothing matches.' : `No ${kind.plural.toLowerCase()} yet.`}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <form class="fresh" onsubmit={addHere}>
      <input type="text" bind:value={fresh} placeholder="+ New {kind.name.toLowerCase()}: type its name and press Enter" aria-label="New {kind.name}'s name" autocomplete="off" />
    </form>
    <p class="keys">Tab moves across. Alt with an up or down arrow moves between rows, and Enter moves down from a one-line cell.</p>
  {:else}
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
  {/if}
</article>

<style>
  article {
    max-width: 720px;
  }
  /* The sheet takes the page's whole width and scrolls sideways inside its own box. */
  article.wide {
    max-width: none;
  }
  .sheet {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: var(--round);
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    width: max-content;
    min-width: 100%;
  }
  thead th {
    position: sticky;
    top: 0;
    padding: 6px 8px;
    font-family: var(--font-label);
    font-size: calc(10.5px * var(--type));
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-align: left;
    color: var(--structure);
    border-right: 1px solid var(--line);
    background: var(--paper, var(--bg));
  }
  thead th.name-col {
    left: 0;
    z-index: 2;
    width: 190px;
  }
  thead th.line {
    width: 120px;
  }
  thead th.text,
  thead th.list {
    width: 300px;
  }
  td.none {
    padding: 10px;
    color: var(--muted);
  }
  .fresh input {
    width: 100%;
    box-sizing: border-box;
    margin-top: 8px;
    font: inherit;
    font-size: calc(13.5px * var(--type));
    color: var(--text);
    background: none;
    border: 1px dashed var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
  }
  .keys {
    margin: 8px 0 0;
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  header {
    margin-bottom: 14px;
  }
  h1 {
    color: var(--title);
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(var(--title-size) * var(--type));
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
