<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import { folderLabel } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { renderBody, type View } from '../../lib/render';
  import type { ImageSource } from '../../lib/fs/types';
  import { dropImage } from '../../lib/drop';
  import { pickImage } from '../../lib/pickImage';
  import { removePicture } from '../../lib/index/manage';
  import Portrait from './Portrait.svelte';
  import EntryEditor from './EntryEditor.svelte';
  import EntryActions from './EntryActions.svelte';

  let {
    index,
    fs,
    id,
    view,
    next,
    fresh,
    onOpen,
    onMakeEntry,
    onMoved,
  }: {
    index: WikiIndex;
    fs: WorldFs;
    id: string;
    view: View;
    /** The entry open in the pane to the right, whose name is marked in this one. */
    next: string | null;
    fresh: boolean;
    onOpen: (id: string) => void;
    /** Starts a new entry for a name selected in this one. */
    onMakeEntry?: (name: string) => void;
    /** Called after the entry is renamed, moved, or archived (null). */
    onMoved?: (from: string, to: string | null) => void;
  } = $props();

  const entry = $derived(index.get(id)!);
  const html = $derived(renderBody(entry.body, index, id, view));
  let body: HTMLDivElement | undefined = $state();
  let pictureProblem = $state('');

  // A picture dropped on the portrait, or chosen with Change picture, is copied in beside
  // the entry under the entry's own name (design: the world shelf).
  async function takePictureAway() {
    if (!entry.imagePath) return;
    pictureProblem = '';
    try {
      await removePicture(fs, entry.imagePath, index.root.path);
    } catch (e) {
      pictureProblem = String(e);
    }
  }

  async function setPicture(image: ImageSource | null) {
    if (!image) return;
    pictureProblem = '';
    try {
      await fs.setImage(id.replace(/\.md$/i, ''), image);
    } catch (e) {
      pictureProblem = String(e);
    }
  }


  // One listener handles every automatic link in the body.
  function onclick(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]');
    if (link?.dataset.entry) onOpen(link.dataset.entry);
  }

  $effect(() => {
    // Mark the name whose entry is open to the right, so it is clear where that pane came from.
    void html;
    body?.querySelectorAll<HTMLElement>('.mention').forEach((el) => el.classList.toggle('active', el.dataset.entry === next));
  });
</script>

<article>
  <header>
    {#if view === 'narrator'}
      <div class="picture" use:dropImage={setPicture}>
        <Portrait url={entry.imagePath ? fs.imageUrl(entry.imagePath) : null} name={entry.name} size="large" />
        <div class="change">
          <button type="button" onclick={async () => setPicture(await pickImage())}>{entry.imagePath ? 'Change' : 'Add picture'}</button>
          {#if entry.imagePath}<button type="button" onclick={takePictureAway}>Remove</button>{/if}
        </div>
        <span class="drop-hint" aria-hidden="true">Drop to set</span>
      </div>
    {:else}
      <Portrait url={entry.imagePath ? fs.imageUrl(entry.imagePath) : null} name={entry.name} size="large" />
    {/if}
    <div class="title">
      <div class="name">
        <h1>{entry.name}</h1>
        {#if view === 'narrator' && onMoved}<EntryActions {fs} {index} {entry} {onMoved} />{/if}
      </div>
      <div class="meta">{[...entry.aliases, folderLabel(entry.category)].join(' · ')}</div>
      {#if pictureProblem}<div class="problem" role="alert">{pictureProblem}</div>{/if}
    </div>
  </header>
  <!-- In Narrator view every entry is editable in place. Protagonist view reads only,
       because narrator-only text is hidden there and typing near it could damage it. -->
  {#if view === 'narrator'}
    {#key id}
      <EntryEditor {fs} {index} {id} title={entry.name} autofocus={fresh} {onOpen} {next} narratorTool {onMakeEntry} />
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
  .name {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 60px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .picture {
    position: relative;
  }
  .change {
    position: absolute;
    inset: auto 0 0 0;
    display: flex;
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    border-top: 1px solid var(--rule-strong);
    opacity: 0;
    transition: opacity 150ms;
  }
  .change button {
    flex: 1;
    font-size: 12px;
    color: var(--text);
    background: none;
    border: 0;
    padding: 6px 4px;
  }
  .change button + button {
    border-left: 1px solid var(--rule-strong);
  }
  .change button:hover {
    color: var(--structure-soft);
  }
  .picture:hover .change,
  .change:focus-within {
    opacity: 1;
  }
  .drop-hint {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: color-mix(in srgb, var(--structure-deep) 88%, transparent);
    border: 1px solid var(--structure);
    color: var(--structure-soft);
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  :global(.picture.drop-over) .drop-hint {
    display: flex;
  }
  .problem {
    margin-top: 8px;
    font-size: 13px;
    color: var(--danger);
  }
  .meta {
    margin-top: 8px;
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--muted);
  }
</style>
