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
  import { views } from '../../lib/view.svelte';

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
  // The page's own view can put the picture away, for reading with nothing but text.
  const picture = $derived(views.of(id).picture);
  const pictured = $derived(picture !== 'hide');
  const banner = $derived(!!entry.imagePath && shape === 'banner' && picture === 'show');

  // Behind the page (Mike, November 10): the page is set like a card from the Radiance
  // Adventure Engine. The name runs up the spine with its category above it, the entry's
  // first sentence sits top right as a card's storyline does, and the picture rises from
  // the foot through smoke. The text thins out before it reaches the picture, so no word
  // is ever set on the art.
  const card = $derived(!!entry.imagePath && picture === 'behind');
  const brief = $derived.by(() => {
    const first = (/^.*?[.!?](?=\s|$)/.exec(entry.summary.trim())?.[0] ?? entry.summary.trim()).slice(0, 180);
    const parts: { text: string; name: boolean }[] = [];
    let at = 0;
    for (const m of index.scanner.find(first)) {
      if (m.start > at) parts.push({ text: first.slice(at, m.start), name: false });
      parts.push({ text: first.slice(m.start, m.end), name: true });
      at = m.end;
    }
    if (at < first.length) parts.push({ text: first.slice(at), name: false });
    return parts;
  });
  // A long name is set smaller, so it still fits up the spine.
  const spineSize = $derived(Math.round(Math.max(30, Math.min(58, 1050 / Math.max(entry.name.length, 1)))));
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
  <div class="row pane-actions">
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

{#snippet writing()}
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
{/snippet}

{#if card}
<article class="card">
  <div class="card-top">
    <div class="spine">
      <div class="kind">{folderLabel(entry.category)}</div>
      <h1 class="spine-name" style:font-size="calc({spineSize}px * var(--type))">{entry.name}</h1>
    </div>
    <div class="card-main">
      {#if brief.length}
        <div class="brief">
          <p>{#each brief as part}{#if part.name}<b>{part.text}</b>{:else}{part.text}{/if}{/each}</p>
          <span class="tag" aria-hidden="true">In brief</span>
        </div>
      {/if}
      <div class="card-details">{@render details()}</div>
      {@render writing()}
    </div>
  </div>
  <div class="foot" aria-hidden="true">
    <img src={fs.imageUrl(entry.imagePath!)} alt="" style={frameStyle(shape === 'banner' ? entry.bannerFrame : null)} />
    <div class="smoke"><div></div></div>
  </div>
</article>
{:else}
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
          <div class="change on-banner pane-actions">{@render pictureButtons()}</div>
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
      {#if !pictured}
        <!-- The picture is put away in this page's view. -->
      {:else if view === 'narrator'}
        <div class="picture" use:dropImage={setPicture}>
          <Portrait url={entry.imagePath ? fs.imageUrl(entry.imagePath) : null} name={entry.name} size="large" frame={entry.portraitFrame} />
          <div class="change pane-actions">{@render pictureButtons()}</div>
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
  {@render writing()}
</article>
{/if}

<style>
  article {
    max-width: var(--measure, 720px);
  }
  /* The card. The page fills its pane, the name stands on the spine, and the foot holds
     the picture. The foot is drawn over the text, with the page's own color above the
     picture, so text scrolling down goes into the smoke before it could reach the art. */
  article.card {
    max-width: none;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 190px);
  }
  .card-top {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 22px;
  }
  .spine {
    position: sticky;
    top: 10px;
    z-index: 3;
    align-self: start;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .kind {
    font-family: var(--font-display);
    font-size: calc(17px * var(--type));
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--structure);
    white-space: nowrap;
  }
  .spine-name {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    line-height: 0.92;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    /* A page's name on a card is bone, and the highlight stays with the names in the text. */
    color: var(--text);
    max-height: calc(100vh - 250px);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-main {
    position: relative;
    z-index: 1;
    min-width: 0;
  }
  .card-main > :global(*) {
    max-width: var(--measure, 720px);
  }
  .card-main > .brief {
    max-width: none;
  }
  .brief {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-bottom: 18px;
  }
  .brief p {
    margin: 0;
    max-width: 22em;
    font-family: var(--font-display);
    font-size: calc(24px * var(--type));
    line-height: 1.12;
    letter-spacing: 0.02em;
    text-align: right;
    text-transform: uppercase;
    text-wrap: balance;
    color: var(--structure);
  }
  .brief b {
    font-weight: 400;
    color: var(--text);
  }
  .brief .tag {
    writing-mode: vertical-rl;
    font-family: var(--font-display);
    font-size: calc(12px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--structure);
  }
  .card-details {
    margin-bottom: 22px;
  }
  .foot {
    position: sticky;
    /* The pane's own padding lies below the page, and the foot reaches past it to the pane's edge. */
    bottom: -60px;
    z-index: 2;
    flex: none;
    height: 48vh;
    margin: auto -40px -60px;
    overflow: hidden;
    pointer-events: none;
    background: linear-gradient(to bottom, transparent 0, color-mix(in srgb, var(--bg) 80%, transparent) 16%, var(--bg) 30%);
  }
  .foot img {
    position: absolute;
    inset: 18% 0 0 0;
    width: 100%;
    height: 82%;
    display: block;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, rgb(0 0 0 / 0.5) 34%, black 72%);
    mask-image: linear-gradient(to bottom, transparent 0, rgb(0 0 0 / 0.5) 34%, black 72%);
  }
  /* Smoke in the page's own color, thick where the picture begins and gone by its foot. */
  .smoke {
    position: absolute;
    inset: 18% 0 0 0;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 26%, black 42%, transparent 90%);
    mask-image: linear-gradient(to bottom, transparent 0, black 26%, black 42%, transparent 90%);
  }
  .smoke div {
    position: absolute;
    inset: 0;
    background: var(--bg);
    opacity: 0.7;
    --noise: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='500'%3E%3Cfilter id='s' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.005 0.011' numOctaves='4' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 2.6 -1.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E");
    -webkit-mask-image: var(--noise);
    mask-image: var(--noise);
    -webkit-mask-size: cover;
    mask-size: cover;
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
    max-width: var(--measure, 720px);
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
