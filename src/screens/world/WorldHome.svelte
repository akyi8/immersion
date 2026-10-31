<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { Navigator } from '../../lib/nav.svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import { openedTimes } from '../../lib/recent';
  import { dropImage } from '../../lib/drop';

  // What the World module shows before any entry is open: every category and its entries.
  // An empty category still shows, with a way to start it, so a new world is never blank.
  let {
    index,
    fs,
    nav,
    worldName,
    onNewEntry,
    onTimeline,
  }: { index: WikiIndex; fs: WorldFs; nav: Navigator; worldName: string; onNewEntry: (folder?: string) => void; onTimeline: () => void } = $props();

  /**
   * Faces (Mike, October 31): the home page opens with the faces of the world, large, so
   * the people the writer has been living with look back at them. People come first,
   * then any other entry with a picture, each group most recently opened first. People
   * with no picture yet are counted below, and a picture dropped on a name becomes theirs.
   */
  const isPerson = (category: string) => category.toLowerCase() === 'people';
  // Read when the home page shows, which is when it matters.
  const opened = $derived(openedTimes(worldName));
  const faces = $derived(
    index
      .all()
      .filter((e) => e.imagePath)
      .sort((a, b) => Number(isPerson(b.category)) - Number(isPerson(a.category)) || (opened[b.id] ?? 0) - (opened[a.id] ?? 0) || a.name.localeCompare(b.name)),
  );
  const faceless = $derived(
    index
      .all()
      .filter((e) => !e.imagePath && isPerson(e.category))
      .sort((a, b) => (opened[b.id] ?? 0) - (opened[a.id] ?? 0) || a.name.localeCompare(b.name)),
  );
  let showFaceless = $state(false);
  let pictureProblem = $state('');
  async function giveFace(id: string, image: import('../../lib/fs/types').ImageSource) {
    pictureProblem = '';
    try {
      await fs.setImage(id.replace(/\.md$/i, ''), image);
    } catch (e) {
      pictureProblem = e instanceof Error ? e.message : String(e);
    }
  }

  const dated = $derived(index.all().filter((e) => e.when).length);

  function allIn(folder: import('../../lib/index/wiki').Folder): string[] {
    return [...folder.entries, ...folder.folders.flatMap(allIn)];
  }
</script>

<section>
  <div class="top">
    <div>
      <h1>{worldName}</h1>
      <p class="count">
        {index.entries.size
          ? `${index.entries.size} ${index.entries.size === 1 ? 'entry' : 'entries'}`
          : 'An empty world. Start with a person or a place, and every name you write that matches an entry becomes a link.'}
      </p>
    </div>
    <div class="actions">
      <button type="button" class="timeline" onclick={onTimeline} title="Every entry with a date, in order, with its eras">Timeline{#if dated}<span>{dated}</span>{/if}</button>
      <button type="button" class="new" onclick={() => onNewEntry()}>+ New entry</button>
    </div>
  </div>
  {#if faces.length}
    <div class="faces" aria-label="Faces">
      {#each faces as e (e.id)}
        <button type="button" class="face" onclick={() => nav.open(e.id)} title={e.summary}>
          <img src={fs.imageUrl(e.imagePath!)} alt="" loading="lazy" />
          <span class="face-name">{e.name}</span>
          {#if e.summary}<span class="face-line">{e.summary}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
  {#if faceless.length}
    <p class="faceless">
      <button type="button" class="faceless-toggle" aria-expanded={showFaceless} onclick={() => (showFaceless = !showFaceless)}>
        {faceless.length} {faceless.length === 1 ? 'person has' : 'people have'} no face yet
      </button>
    </p>
    {#if showFaceless}
      <p class="hint">Drop a picture on a name to give them a face.</p>
      <div class="chips">
        {#each faceless as e (e.id)}
          <button type="button" class="drop" use:dropImage={(image) => giveFace(e.id, image)} onclick={() => nav.open(e.id)}>{e.name}</button>
        {/each}
      </div>
      {#if pictureProblem}<p class="problem" role="alert">{pictureProblem}</p>{/if}
    {/if}
  {/if}
  {#each index.root.folders as folder}
    {@const ids = allIn(folder)}
    <h2 class="label">{folderLabel(folder.name)} {#if ids.length}<span>{ids.length}</span>{/if}</h2>
    <div class="chips">
      {#each ids as id}
        <button type="button" onclick={() => nav.open(id)}>{index.get(id)!.name}</button>
      {/each}
      <button type="button" class="add" onclick={() => onNewEntry(folder.path)}>+ Add</button>
    </div>
  {/each}
  {#if index.root.entries.length}
    <h2 class="label">Unfiled</h2>
    <div class="chips">
      {#each index.root.entries as id}
        <button type="button" onclick={() => nav.open(id)}>{index.get(id)!.name}</button>
      {/each}
    </div>
  {/if}
</section>

<style>
  section {
    max-width: 900px;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .timeline {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: calc(14px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 10px 16px;
    min-height: 44px;
  }
  .timeline:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .timeline span {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .new {
    font-size: calc(14px * var(--type));
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border: 0;
    padding: 10px 16px;
    min-height: 44px;
  }
  h1 {
    color: var(--title);
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(72px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .count {
    margin: 6px 0 24px;
    color: var(--muted);
  }
  h2 {
    margin: 26px 0 10px;
    font-weight: 500;
  }
  h2 span {
    color: var(--text-soft);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--round-box);
    padding: 7px 12px;
    min-height: 36px;
  }
  .chips button:hover {
    border-color: var(--hover-edge);
  }
  .chips .add {
    color: var(--structure);
    border-style: dashed;
  }
  .count {
    max-width: 560px;
  }
  .faces {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
    gap: 14px;
    margin: 28px 0 8px;
  }
  .face {
    position: relative;
    aspect-ratio: 3 / 4;
    padding: 0;
    overflow: hidden;
    background: var(--surface);
    border: 0;
    border-radius: var(--round-box);
    box-shadow: var(--lift);
    text-align: left;
  }
  .face img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 600ms var(--ease, ease);
  }
  .face:hover img,
  .face:focus-visible img {
    transform: scale(1.04);
  }
  /* The name sits on a darkening at the foot of the picture, the first line rises on hover. */
  .face::after {
    content: '';
    position: absolute;
    inset: 45% 0 0;
    background: linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.78));
    pointer-events: none;
  }
  .face-name,
  .face-line {
    position: absolute;
    left: 12px;
    right: 12px;
    z-index: 1;
    color: #fff;
  }
  .face-name {
    bottom: 10px;
    font-family: var(--font-display);
    font-size: calc(22px * var(--type));
    line-height: 1.05;
    letter-spacing: 0.02em;
    transition: bottom 300ms var(--ease, ease);
  }
  .face-line {
    bottom: 10px;
    font-size: calc(12px * var(--type));
    line-height: 1.35;
    opacity: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: opacity 300ms var(--ease, ease);
  }
  .face:hover .face-name,
  .face:focus-visible .face-name {
    bottom: 70px;
  }
  .face:hover .face-line,
  .face:focus-visible .face-line {
    opacity: 0.92;
  }
  .face:hover::after {
    inset: 20% 0 0;
  }
  .faceless {
    margin: 4px 0 0;
  }
  .faceless-toggle {
    font-size: calc(13px * var(--type));
    color: var(--muted);
    background: none;
    border: 0;
    padding: 4px 0;
  }
  .faceless-toggle:hover {
    color: var(--text);
  }
  .hint {
    margin: 4px 0 8px;
    font-size: calc(13px * var(--type));
    color: var(--muted);
  }
  .drop:global(.drop-over) {
    background: var(--selected-bg);
    color: var(--selected-fg);
  }
  .problem {
    color: var(--danger);
  }
</style>
