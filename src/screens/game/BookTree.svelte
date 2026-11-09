<script lang="ts">
  import type { BookTree, DivisionNode, SectionNode } from '../../lib/game/game';

  /**
   * A game's book as a tree (Mike, November 9). The divisions are folders, each section
   * inside them is a folder, and the rules are where the text lives. A division with a
   * catalog lists its kinds as folders, and their elements inside. Rules and sections can
   * be dragged to a new place, and the + on a folder adds a rule or a section to it.
   */
  let {
    tree,
    worldName,
    open,
    onOpen,
    onMoveRule,
    onMoveSection,
    onAddRule,
    onAddSection,
  }: {
    tree: BookTree;
    worldName: string;
    /** The pane ids open now, which the tree marks. */
    open: string[];
    onOpen: (id: string) => void;
    onMoveRule: (rule: string, from: string, to: string, before: string | null) => void;
    onMoveSection: (section: string, from: string | null, to: string, before: string | null) => void;
    onAddRule: (section: string, name: string) => Promise<void>;
    onAddSection: (division: string, name: string) => Promise<void>;
  } = $props();

  const STORE = 'immersion.game.tree';
  const remembered = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem(STORE) ?? '[]');
    } catch {
      return [];
    }
  };
  let expanded = $state<Set<string>>(new Set(remembered()));
  function toggle(key: string, to?: boolean) {
    const next = new Set(expanded);
    if (to ?? !next.has(key)) next.add(key);
    else next.delete(key);
    expanded = next;
    try {
      localStorage.setItem(STORE, JSON.stringify([...next]));
    } catch {
      // A browser without storage keeps the folders open for this visit only.
    }
  }

  // Dragging: a rule onto a rule lands before it, onto a section at its end; a section
  // onto a section lands before it, onto a division at its end.
  type Drag = { type: 'rule' | 'section'; key: string; from: string | null };
  let drag = $state<Drag | null>(null);
  let over = $state<{ key: string; mode: 'before' | 'into' } | null>(null);

  function start(e: DragEvent, d: Drag) {
    drag = d;
    e.dataTransfer?.setData('text/plain', d.key);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function hover(e: DragEvent, key: string, accepts: 'rule' | 'section', mode: 'before' | 'into') {
    if (!drag || drag.type !== accepts || drag.key === key) return;
    e.preventDefault();
    over = { key, mode };
  }
  function end() {
    drag = null;
    over = null;
  }
  const mark = (key: string) => (over?.key === key ? `drop-${over.mode}` : '');

  let adding = $state<{ type: 'rule' | 'section'; parent: string } | null>(null);
  let name = $state('');
  let busy = $state(false);
  async function add(e: SubmitEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !adding || busy) return;
    busy = true;
    try {
      if (adding.type === 'rule') await onAddRule(adding.parent, n);
      else await onAddSection(adding.parent, n);
      adding = null;
      name = '';
    } finally {
      busy = false;
    }
  }
  function startAdding(type: 'rule' | 'section', parent: string) {
    toggle(parent, true);
    adding = { type, parent };
    name = '';
  }
  const autofocus = (el: HTMLInputElement) => el.focus();

  const isOpen = (id: string) => open.includes(id);
</script>

{#snippet adder(type: 'rule' | 'section', parent: string, depth: number)}
  {#if adding?.type === type && adding.parent === parent}
    <form class="adder" style="--depth: {depth}" onsubmit={add}>
      <input
        use:autofocus
        bind:value={name}
        placeholder={type === 'rule' ? 'Name the rule' : 'Name the section'}
        aria-label={type === 'rule' ? 'New rule name' : 'New section name'}
        onkeydown={(e) => e.key === 'Escape' && (adding = null)} />
    </form>
  {/if}
{/snippet}

{#snippet section(s: SectionNode, from: string | null, depth: number)}
  {@const key = s.placed.key}
  <div
    class="row folder {mark(key)}"
    class:on={isOpen(`@sec:${key}`)}
    style="--depth: {depth}"
    role="treeitem"
    aria-selected={isOpen(`@sec:${key}`)}
    aria-expanded={expanded.has(key)}
    tabindex="-1"
    draggable="true"
    ondragstart={(e) => start(e, { type: 'section', key, from })}
    ondragend={end}
    ondragover={(e) => (drag?.type === 'rule' ? hover(e, key, 'rule', 'into') : hover(e, key, 'section', 'before'))}
    ondragleave={() => over?.key === key && (over = null)}
    ondrop={(e) => {
      e.preventDefault();
      if (drag?.type === 'rule' && drag.from) onMoveRule(drag.key, drag.from, key, null);
      else if (drag?.type === 'section' && from) onMoveSection(drag.key, drag.from, from, key);
      end();
    }}>
    <button type="button" class="twist" aria-label={expanded.has(key) ? 'Close' : 'Open'} onclick={() => toggle(key)}>{expanded.has(key) ? '▾' : '▸'}</button>
    <button type="button" class="name" onclick={() => (toggle(key, true), onOpen(`@sec:${key}`))}>{s.placed.element.name}</button>
    {#if tree.origin === 'world' && s.placed.origin === 'world'}<span class="own" title="{worldName}'s own section">◆</span>{/if}
    <button type="button" class="plus" title="Add a rule" aria-label="Add a rule to {s.placed.element.name}" onclick={() => startAdding('rule', key)}>+</button>
  </div>
  {#if expanded.has(key)}
    {#each s.items as item, i (i)}
      {#if item.type === 'heading'}
        <div class="heading" style="--depth: {depth + 1}">{item.text}</div>
      {:else}
        {@const rk = item.placed.key}
        <div
          class="row leaf {mark(rk)}"
          class:on={isOpen(`@rule:${rk}`)}
          style="--depth: {depth + 1}"
          role="treeitem"
          aria-selected={isOpen(`@rule:${rk}`)}
          tabindex="-1"
          draggable="true"
          ondragstart={(e) => start(e, { type: 'rule', key: rk, from: key })}
          ondragend={end}
          ondragover={(e) => hover(e, rk, 'rule', 'before')}
          ondragleave={() => over?.key === rk && (over = null)}
          ondrop={(e) => {
            e.preventDefault();
            if (drag?.type === 'rule' && drag.from) onMoveRule(drag.key, drag.from, key, rk);
            end();
          }}>
          <button type="button" class="name" onclick={() => onOpen(`@rule:${rk}`)}>{item.placed.element.name}</button>
          {#if tree.origin === 'world' && item.placed.origin === 'world'}
            <span class="own" title="{worldName}'s own rule">◆</span>
          {:else if item.worldPiece}
            <span class="own" title="With {worldName}'s piece">+</span>
          {/if}
        </div>
      {/if}
    {/each}
    {@render adder('rule', key, depth + 1)}
  {/if}
{/snippet}

{#snippet division(d: DivisionNode)}
  {@const key = d.placed.key}
  <div
    class="row folder top {mark(key)}"
    class:on={isOpen(`@div:${key}`)}
    role="treeitem"
    aria-selected={isOpen(`@div:${key}`)}
    aria-expanded={expanded.has(key)}
    tabindex="-1"
    style="--depth: 0"
    ondragover={(e) => !d.catalog.length && hover(e, key, 'section', 'into')}
    ondragleave={() => over?.key === key && (over = null)}
    ondrop={(e) => {
      e.preventDefault();
      if (drag?.type === 'section') onMoveSection(drag.key, drag.from, key, null);
      end();
    }}>
    <button type="button" class="twist" aria-label={expanded.has(key) ? 'Close' : 'Open'} onclick={() => toggle(key)}>{expanded.has(key) ? '▾' : '▸'}</button>
    <button type="button" class="name" onclick={() => (toggle(key, true), onOpen(`@div:${key}`))}>{d.placed.element.name}</button>
    {#if !d.catalog.length}
      <button type="button" class="plus" title="Add a section" aria-label="Add a section to {d.placed.element.name}" onclick={() => startAdding('section', key)}>+</button>
    {/if}
  </div>
  {#if expanded.has(key)}
    {#each d.sections as s (s.placed.key)}{@render section(s, key, 1)}{/each}
    {#each d.catalog as c (c.kind.id)}
      {@const ck = `${key}#${c.kind.id}`}
      <div class="row folder" class:on={isOpen(`@cat:${c.kind.id}`)} style="--depth: 1" role="treeitem" aria-selected={isOpen(`@cat:${c.kind.id}`)} aria-expanded={expanded.has(ck)} tabindex="-1">
        <button type="button" class="twist" aria-label={expanded.has(ck) ? 'Close' : 'Open'} onclick={() => toggle(ck)}>{expanded.has(ck) ? '▾' : '▸'}</button>
        <button type="button" class="name" onclick={() => (toggle(ck, true), onOpen(`@cat:${c.kind.id}`))}>{c.kind.plural}</button>
        <span class="n">{c.elements.length}</span>
      </div>
      {#if expanded.has(ck)}
        {#each c.elements as p (p.key)}
          <div class="row leaf" class:on={isOpen(`@el:${p.key}`)} style="--depth: 2" role="treeitem" aria-selected={isOpen(`@el:${p.key}`)} tabindex="-1">
            <button type="button" class="name" onclick={() => onOpen(`@el:${p.key}`)}>{p.element.name}</button>
            {#if tree.origin === 'world' && p.origin === 'world'}<span class="own" title="{worldName}'s own">◆</span>{/if}
          </div>
        {/each}
      {/if}
    {/each}
    {@render adder('section', key, 1)}
  {/if}
{/snippet}

<div class="tree" role="tree" aria-label="{tree.book.name}'s book">
  <div class="row top front" class:on={isOpen(`@front:${tree.origin}`)} style="--depth: 0" role="treeitem" aria-selected={isOpen(`@front:${tree.origin}`)} tabindex="-1">
    <button type="button" class="name" onclick={() => onOpen(`@front:${tree.origin}`)}>{tree.book.name}</button>
    <span class="n">front page</span>
  </div>
  {#each tree.divisions as d (d.placed.key)}{@render division(d)}{/each}
  {#if tree.loose.length}
    <div class="heading" style="--depth: 0">Not in a division</div>
    {#each tree.loose as s (s.placed.key)}{@render section(s, null, 0)}{/each}
  {/if}
</div>

<style>
  .tree {
    padding-bottom: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 30px;
    padding: 0 10px 0 calc(8px + var(--depth) * 16px);
    position: relative;
  }
  .row:hover {
    background: var(--surface);
  }
  .row.on {
    background: var(--selected-bg);
    box-shadow: inset 2px 0 0 var(--selected-border);
  }
  .row.on .name {
    color: var(--selected-fg);
  }
  .row.leaf {
    padding-left: calc(26px + var(--depth) * 16px);
  }
  .row.drop-before::before {
    content: '';
    position: absolute;
    left: calc(8px + var(--depth) * 16px);
    right: 8px;
    top: -1px;
    border-top: 2px solid var(--structure);
  }
  .row.drop-into {
    background: var(--accent-wash, var(--surface));
    box-shadow: inset 0 0 0 1px var(--structure);
  }
  .twist {
    width: 18px;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 0;
  }
  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    padding: 5px 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top .name {
    font-size: calc(15px * var(--type));
    color: var(--title);
  }
  .front {
    padding-left: 26px;
  }
  .leaf .name {
    color: var(--text-soft);
    font-size: calc(13.5px * var(--type));
  }
  .own,
  .n {
    flex-shrink: 0;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--structure);
    padding: 0 2px;
  }
  .n {
    color: var(--muted);
  }
  .plus {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    font-size: 15px;
    line-height: 1;
    color: var(--structure);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--round);
    padding: 0;
    opacity: 0;
  }
  .row:hover .plus,
  .plus:focus-visible {
    opacity: 1;
  }
  .plus:hover {
    border-color: var(--edge);
  }
  .heading {
    padding: 10px 10px 2px calc(26px + var(--depth) * 16px);
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .adder {
    padding: 2px 10px 4px calc(26px + var(--depth) * 16px);
  }
  .adder input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: calc(13px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 4px 8px;
  }
</style>
