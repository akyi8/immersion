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
  import EntryDate from './EntryDate.svelte';
  import FramePicture from './FramePicture.svelte';
  import { defaultShape, frameStyle, writeFrame, type Frame, type Shape } from '../../lib/index/frame';
  import { withHeader } from '../../lib/world';
  import { saveNow } from '../../lib/saves';

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
    onWindow,
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
    /** Moves the entry into a reading window of its own. */
    onWindow?: () => void;
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


  // A picture is framed rather than cropped, and an entry outside People shows it as a
  // banner across its top, with its name over it (Mike, November 1).
  const shape = $derived<Shape>(entry.picture ?? defaultShape(entry.category));
  const banner = $derived(!!entry.imagePath && shape === 'banner');
  let framing = $state(false);
  let framingBusy = $state(false);
  let framingProblem = $state('');

  async function saveFraming(result: { shape: Shape | null; portrait: Frame; banner: Frame }) {
    framingBusy = true;
    framingProblem = '';
    try {
      await saveNow(id);
      const changes = { picture: result.shape ?? undefined, portrait_frame: writeFrame(result.portrait), banner_frame: writeFrame(result.banner) };
      await fs.writeText(id, withHeader(await fs.readText(id), changes));
      framing = false;
    } catch (e) {
      framingProblem = e instanceof Error ? e.message : String(e);
    } finally {
      framingBusy = false;
    }
  }

  /** Flips the picture between portrait and banner from the entry's ⋯ (Mike, November 1). */
  async function setShape(to: Shape) {
    pictureProblem = '';
    try {
      await saveNow(id);
      await fs.writeText(id, withHeader(await fs.readText(id), { picture: to === defaultShape(entry.category) ? undefined : to }));
    } catch (e) {
      pictureProblem = e instanceof Error ? e.message : String(e);
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

{#snippet pictureButtons()}
  <button type="button" onclick={async () => setPicture(await pickImage())}>{entry.imagePath ? 'Change' : 'Add picture'}</button>
  {#if entry.imagePath}
    <button type="button" onclick={() => ((framingProblem = ''), (framing = true))}>Frame</button>
    <button type="button" onclick={takePictureAway}>Remove</button>
  {/if}
{/snippet}

{#snippet details()}
  {#if entry.aliases.length}<div class="meta">{entry.aliases.join(' · ')}</div>{/if}
  <div class="row">
    <EntryDate {fs} {entry} editable={view === 'narrator'} />
    <span class="spacer"></span>
    {#if view === 'narrator' && onMoved}
      <EntryActions
        {fs}
        {index}
        {entry}
        {onMoved}
        {onWindow}
        {shape}
        onShape={setShape}
        onFrame={() => ((framingProblem = ''), (framing = true))}
        onAddPicture={async () => setPicture(await pickImage())} />
    {/if}
  </div>
  {#if pictureProblem}<div class="problem" role="alert">{pictureProblem}</div>{/if}
{/snippet}

<article class:has-banner={banner}>
  {#if banner}
    <!-- The banner runs the pane's full width, and the name sits over its foot, like a poster. -->
    <header class="poster">
      {#if view === 'narrator'}
        <div class="banner" use:dropImage={setPicture}>
          <img src={fs.imageUrl(entry.imagePath!)} alt="" style={frameStyle(entry.bannerFrame)} />
          <div class="over">
            <div class="label">{folderLabel(entry.category)}</div>
            <h1>{entry.name}</h1>
          </div>
          <div class="change on-banner">{@render pictureButtons()}</div>
          <span class="drop-hint" aria-hidden="true">Drop to set</span>
        </div>
      {:else}
        <div class="banner">
          <img src={fs.imageUrl(entry.imagePath!)} alt="" style={frameStyle(entry.bannerFrame)} />
          <div class="over">
            <div class="label">{folderLabel(entry.category)}</div>
            <h1>{entry.name}</h1>
          </div>
        </div>
      {/if}
      <div class="title under">{@render details()}</div>
    </header>
  {:else}
    <header>
      {#if view === 'narrator'}
        <div class="picture" use:dropImage={setPicture}>
          <Portrait url={entry.imagePath ? fs.imageUrl(entry.imagePath) : null} name={entry.name} size="large" frame={entry.portraitFrame} />
          <div class="change">{@render pictureButtons()}</div>
          <span class="drop-hint" aria-hidden="true">Drop to set</span>
        </div>
      {:else}
        <Portrait url={entry.imagePath ? fs.imageUrl(entry.imagePath) : null} name={entry.name} size="large" frame={entry.portraitFrame} />
      {/if}
      <!-- Like every pane: where it lives, its name, then one row of actions ending in ⋯ (Mike, October 31). -->
      <div class="title">
        <div class="label">{folderLabel(entry.category)}</div>
        <h1>{entry.name}</h1>
        {@render details()}
      </div>
    </header>
  {/if}
  {#if framing && entry.imagePath}
    <FramePicture
      url={fs.imageUrl(entry.imagePath)}
      category={entry.category}
      shape={entry.picture ?? null}
      portrait={entry.portraitFrame ?? null}
      banner={entry.bannerFrame ?? null}
      busy={framingBusy}
      problem={framingProblem}
      onSave={saveFraming}
      onCancel={() => (framing = false)} />
  {/if}
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
  .title > .label {
    margin-bottom: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .spacer {
    flex: 1;
  }
  h1 {
    color: var(--title);
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(60px * var(--type));
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
    border-top: 1px solid var(--edge);
    opacity: 0;
    transition: opacity 150ms;
  }
  .change button {
    flex: 1;
    font-size: calc(12px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    padding: 6px 4px;
  }
  .change button + button {
    border-left: 1px solid var(--edge);
  }
  .change button:hover {
    color: var(--structure-soft);
  }
  .picture:hover .change,
  .banner:hover .change,
  .change:focus-within {
    opacity: 1;
  }
  /* The poster: the banner bleeds to the pane's edges, past the pane's padding. */
  article.has-banner {
    max-width: none;
  }
  article.has-banner > :global(:not(header)),
  .title.under {
    max-width: 720px;
  }
  header.poster {
    display: block;
    margin: -56px -40px 28px;
  }
  .banner {
    position: relative;
    aspect-ratio: 16 / 7;
    min-height: 220px;
    max-height: 380px;
    width: 100%;
    overflow: hidden;
    background: var(--surface);
  }
  .banner img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  /* Darkening at the top keeps the pane's tools readable, and at the foot carries the name. */
  .banner::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to bottom, rgb(0 0 0 / 0.45), transparent 28%),
      linear-gradient(to bottom, transparent 40%, rgb(0 0 0 / 0.8));
    pointer-events: none;
  }
  .over {
    position: absolute;
    left: 40px;
    right: 40px;
    bottom: 20px;
    z-index: 1;
  }
  .over .label {
    color: rgb(255 255 255 / 0.82);
    text-shadow: 0 1px 6px rgb(0 0 0 / 0.6);
  }
  .over h1 {
    margin-top: 6px;
    text-shadow: 0 2px 18px rgb(0 0 0 / 0.55);
  }
  .title.under {
    padding: 0 40px;
  }
  .change.on-banner {
    inset: 14px auto auto 40px;
    z-index: 2;
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .change.on-banner button {
    flex: none;
    padding: 6px 12px;
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
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  :global(.picture.drop-over) .drop-hint {
    display: flex;
  }
  .problem {
    margin-top: 8px;
    font-size: calc(13px * var(--type));
    color: var(--danger);
  }
  .meta {
    margin-top: 8px;
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
</style>
