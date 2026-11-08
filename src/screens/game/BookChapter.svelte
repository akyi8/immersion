<script lang="ts">
  import type { BookItem as Item, Placed } from '../../lib/game/game';

  /**
   * One chapter of a game's book (Mike, November 8): its introduction, then its modules,
   * headings, and catalog elements in order. A module opens with its engine's
   * piece and its world piece side by side; a catalog element opens as its form.
   */
  let {
    chapter,
    bookName,
    worldName,
    items,
    onOpen,
    onEdit,
  }: {
    chapter: Placed;
    bookName: string;
    worldName: string;
    items: Item[];
    /** Opens a module or an element by its key. */
    onOpen: (item: Item) => void;
    /** Opens the chapter itself as a form, to change its introduction or its items. */
    onEdit: () => void;
  } = $props();

  const modules = $derived(items.filter((i) => i.type === 'module').length);
  const elements = $derived(items.filter((i) => i.type === 'element').length);
</script>

<article class="chapter">
  <header>
    <div class="label">{bookName} · {chapter.origin === 'engine' ? 'Core chapter' : `${worldName} chapter`}</div>
    <h1>{chapter.element.name}</h1>
    <div class="row">
      <span class="meta">{modules} {modules === 1 ? 'module' : 'modules'}{elements ? ` · ${elements} catalog ${elements === 1 ? 'entry' : 'entries'}` : ''}</span>
      <span class="spacer"></span>
      <button type="button" class="tool" onclick={onEdit}>Edit the chapter</button>
    </div>
  </header>
  {#if chapter.element.flavor}<p class="intro">{chapter.element.flavor}</p>{/if}
  <ol>
    {#each items as item, i (i)}
      {#if item.type === 'heading'}
        <li class="heading">{item.text}</li>
      {:else if item.type === 'missing'}
        <li class="missing">Missing: {item.ref}</li>
      {:else}
        <li>
          <button type="button" class:element={item.type === 'element'} onclick={() => onOpen(item)}>
            <span class="name">{item.placed.element.name}</span>
            {#if item.type === 'module'}
              {#if item.placed.origin === 'world'}
                <span class="tag">{worldName}</span>
              {:else if item.hasWorldPiece}
                <span class="tag">+ {worldName}</span>
              {/if}
            {:else}
              <span class="kind">{item.kindName}</span>
            {/if}
          </button>
        </li>
      {/if}
    {/each}
  </ol>
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
  .tool {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tool:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .intro {
    margin: 0 0 16px;
    color: var(--text-soft);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  li button {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 12px;
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
  li button.element {
    padding-left: 22px;
  }
  li button.element .name {
    font-size: calc(14px * var(--type));
    color: var(--text-soft);
  }
  .name {
    font-size: calc(16px * var(--type));
    flex: 1;
    min-width: 0;
  }
  .tag,
  .kind {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--structure);
  }
  .kind {
    color: var(--muted);
  }
  .heading {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--structure);
    padding: 16px 4px 6px;
    border-bottom: 1px solid var(--line);
  }
  .missing {
    color: var(--danger);
    font-size: calc(13px * var(--type));
    padding: 8px 4px;
  }
</style>
