<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { renderBody, type View } from '../../lib/render';
  import Portrait from './Portrait.svelte';
  import EntryEditor from './EntryEditor.svelte';

  let {
    index,
    fs,
    id,
    view,
    preview,
    fresh,
    onPreview,
  }: {
    index: WikiIndex;
    fs: WorldFs;
    id: string;
    view: View;
    preview: string | null;
    fresh: boolean;
    onPreview: (id: string) => void;
  } = $props();

  const entry = $derived(index.get(id)!);
  const html = $derived(renderBody(entry.body, index, id, view));
  let body: HTMLDivElement | undefined = $state();

  // One listener handles every automatic link in the body.
  function onclick(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]');
    if (link?.dataset.entry) onPreview(link.dataset.entry);
  }

  $effect(() => {
    // Mark the previewed name, so it is clear which link the preview belongs to.
    void html;
    body?.querySelectorAll<HTMLElement>('.mention').forEach((el) => el.classList.toggle('active', el.dataset.entry === preview));
  });
</script>

<article>
  <header>
    <Portrait url={entry.imagePath ? fs.imageUrl(entry.imagePath) : null} name={entry.name} size="large" />
    <div class="title">
      <h1>{entry.name}</h1>
      <div class="meta">{[...entry.aliases, folderLabel(entry.category)].join(' · ')}</div>
    </div>
  </header>
  <!-- In Narrator view every entry is editable in place. Protagonist view reads only,
       because narrator-only text is hidden there and typing near it could damage it. -->
  {#if view === 'narrator'}
    {#key id}
      <EntryEditor {fs} {index} {id} title={entry.name} autofocus={fresh} {onPreview} />
    {/key}
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="prose" bind:this={body} {onclick}>{@html html}</div>
  {/if}
</article>

<style>
  article {
    max-width: 720px;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: flex-end;
    margin-bottom: 28px;
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 60px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .meta {
    margin-top: 8px;
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--muted);
  }
</style>
