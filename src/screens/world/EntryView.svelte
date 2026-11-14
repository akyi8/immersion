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
  import { BEHIND_FADE, BEHIND_TOP, defaultShape, frameStyle, spineName, writeFrame, type Frame, type Shape } from '../../lib/index/frame';
  import { withHeader } from '../../lib/world';
  import { saveNow } from '../../lib/saves';
  import { views } from '../../lib/view.svelte';
  import { pageActions, pictureActions } from '../../lib/pane.svelte';

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
  let actions: EntryActions | undefined = $state();

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
  const shape = $derived<Shape>(entry.picture ?? defaultShape(entry.category, index.pictures));
  // The page's own view can put the picture away, for reading with nothing but text.
  const picture = $derived(views.of(id).picture);
  const pictured = $derived(picture !== 'hide');
  const banner = $derived(!!entry.imagePath && shape === 'banner' && picture === 'show');

  // Behind the page (Mike, November 10), chosen where the picture is framed: the page is set like a card from the Radiance
  // Adventure Engine. The name runs up the spine with its category above it, the entry's
  // first sentence sits top right as a card's storyline does, and the picture stands down
  // the page's left side, behind the name, fading toward the text.
  const card = $derived(!!entry.imagePath && shape === 'behind' && pictured);
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
  // The name's first word stands large on the spine, with the rest small beside it, so a
  // long name still fits. A very long first word is set smaller.
  const spine = $derived(spineName(entry.name));
  const spineSize = $derived(Math.round(Math.max(34, Math.min(64, 820 / Math.max(spine.main.length, 1)))));
  let framing = $state(false);
  let framingBusy = $state(false);
  let framingProblem = $state('');

  async function saveFraming(result: { shape: Shape | null; portrait: Frame; banner: Frame; behind: Frame }) {
    framingBusy = true;
    framingProblem = '';
    try {
      await saveNow(id);
      const changes = { picture: result.shape ?? undefined, portrait_frame: writeFrame(result.portrait), banner_frame: writeFrame(result.banner), behind_frame: writeFrame(result.behind) };
      await fs.writeText(id, withHeader(await fs.readText(id), changes));
      framing = false;
    } catch (e) {
      framingProblem = e instanceof Error ? e.message : String(e);
    } finally {
      framingBusy = false;
    }
  }

  /** Sets how the picture shows, from the page's view menu. */
  async function setShape(to: Shape) {
    pictureProblem = '';
    try {
      await saveNow(id);
      await fs.writeText(id, withHeader(await fs.readText(id), { picture: to === defaultShape(entry.category, index.pictures) ? undefined : to }));
    } catch (e) {
      pictureProblem = e instanceof Error ? e.message : String(e);
    }
  }

  // Everything about the picture is offered in the page's view menu: how it shows, or that it is hidden.
  $effect(() => {
    if (view !== 'narrator') return;
    const has = !!entry.imagePath;
    const at = shape;
    const showing = pictured;
    const choose = (to: Shape) => () => {
      views.set(id, { picture: 'show' });
      if (at !== to) void setShape(to);
    };
    pictureActions.set(id, [
      ...(has
        ? [
            { label: 'Hide', pressed: !showing, run: () => views.set(id, { picture: 'hide' }) },
            { label: 'Portrait', pressed: showing && at === 'portrait', run: choose('portrait') },
            { label: 'Banner', pressed: showing && at === 'banner', run: choose('banner') },
            { label: 'Behind', pressed: showing && at === 'behind', run: choose('behind') },
          ]
        : []),
      { label: has ? 'Change the picture…' : 'Add a picture…', run: async () => setPicture(await pickImage()) },
      ...(has
        ? [
            { label: 'Frame and place the picture…', run: () => ((framingProblem = ''), (framing = true)) },
            { label: 'Remove the picture', run: () => void takePictureAway() },
          ]
        : []),
    ]);
    return () => pictureActions.clear(id);
  });

  // What can be done to the entry sits behind the ⋯ in the pane's corner.
  $effect(() => {
    if (view !== 'narrator' || !onMoved) return;
    pageActions.set(id, [
      { label: 'Rename', run: () => void actions?.start('rename') },
      { label: 'Other names', run: () => void actions?.start('names') },
      { label: 'Move to another category', run: () => void actions?.start('move') },
      'separator',
      { label: 'Archive', run: () => void actions?.start('archive') },
    ]);
    return () => pageActions.clear(id);
  });

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

{#snippet details()}
  <!-- What the entry is called, then when it is, then the small buttons that add to either
       (Mike, November 10). Each is added and changed here, so the file's own header is never edited by hand (Mike, November 10). -->
  <div class="facts pane-actions">
    {#if entry.aliases.length}
      <div class="names" aria-label="Other names">
        {#each entry.aliases as alias (alias)}
          {#if view === 'narrator' && onMoved}
            <button type="button" class="alias" title="Change this entry's other names" onclick={() => actions?.start('names')}>{alias}</button>
          {:else}
            <span class="alias">{alias}</span>
          {/if}
        {/each}
      </div>
    {/if}
    {#if entry.when}
      <div><EntryDate {fs} {entry} editable={view === 'narrator'} /></div>
    {/if}
    {#if view === 'narrator'}
      <div class="adds">
        {#if onMoved}<button type="button" class="add" onclick={() => actions?.start('names')}>+ Alias</button>{/if}
        {#if !entry.when}<EntryDate {fs} {entry} editable />{/if}
      </div>
    {/if}
  </div>
  {#if pictureProblem}<div class="problem" role="alert">{pictureProblem}</div>{/if}
{/snippet}

{#snippet writing()}
  <!-- In Narrator view every entry is editable in place. Protagonist view reads only,
       because narrator-only text is hidden there and typing near it could damage it. -->
  {#if view === 'narrator'}
    {#key id}
      <EntryEditor {fs} {index} {id} title={entry.name} autofocus={fresh} {onOpen} {next} rumorTool narratorTool {onMakeEntry} />
    {/key}
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="prose" bind:this={body} {onclick}>{@html html}</div>
  {/if}
{/snippet}

<!-- The entry's forms. Its menu is the ⋯ in the pane's corner. -->
{#if view === 'narrator' && onMoved}
  <EntryActions bind:this={actions} {fs} {index} {entry} {onMoved} button={false} />
{/if}

{#if card}
<article class="card">
  <div class="card-top">
    <div class="spine">
      <div class="kind">{folderLabel(entry.category)}</div>
      <h1 class="spine-name" aria-label={entry.name}>
        <span class="main" style:font-size="calc({spineSize}px * var(--type))">{spine.main}</span>
        {#if spine.rest}<span class="lead">{spine.rest}</span>{/if}
      </h1>
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
    <div class="corner"><div class="soft" style={BEHIND_TOP}><div class="rise" style={BEHIND_FADE}><img src={fs.imageUrl(entry.imagePath!)} alt="" style={frameStyle(entry.behindFrame)} /></div></div></div>
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
  {@render writing()}
</article>
{/if}
{#if framing && entry.imagePath}
  <FramePicture
    url={fs.imageUrl(entry.imagePath)}
    category={entry.category}
    shape={entry.picture ?? null}
    portrait={entry.portraitFrame ?? null}
    banner={entry.bannerFrame ?? null}
    behind={entry.behindFrame ?? null}
    world={index.pictures}
    busy={framingBusy}
    problem={framingProblem}
    onSave={saveFraming}
    onCancel={() => (framing = false)} />
{/if}

<style>
  article {
    max-width: var(--measure, 720px);
  }
  /* The card. The page fills its pane, and the name stands on the spine. */
  article.card {
    /* The card is as wide as its column and its spine, so on a wide screen the name, the
       first sentence, and the picture stay with the text and do not drift to the far edge. */
    max-width: calc(var(--measure, 720px) + 128px);
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 190px);
  }
  .card-top {
    display: grid;
    /* The spine's column holds the name, and the text begins close beside it. */
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 16px;
  }
  .spine {
    position: sticky;
    top: 10px;
    z-index: 3;
    align-self: start;
    display: flex;
    flex-direction: column;
    /* The category's last letter stands over the foot of the name's letters, as on a card. */
    align-items: flex-end;
    width: fit-content;
    gap: 10px;
    margin-left: 26px;
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
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    text-transform: uppercase;
    /* A page's name on a card is bone, and the highlight stays with the names in the text.
       It stands on the picture, so a soft shadow keeps it clear of what is behind it. */
    color: var(--text);
    text-shadow: 0 2px 14px rgb(0 0 0 / 0.75);
  }
  /* Two lines up the spine: the large one first, which the turn puts on the left. */
  .spine-name span {
    display: block;
    white-space: nowrap;
    max-height: calc(100vh - 250px);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spine-name .lead {
    font-size: calc(22px * var(--type));
    letter-spacing: 0.06em;
    line-height: 1.15;
    opacity: 0.9;
  }
  .spine-name .main {
    line-height: 0.92;
    letter-spacing: 0.01em;
  }
  .card-main {
    position: relative;
    z-index: 1;
    min-width: 0;
    /* Room for the last lines to come clear of the corner. */
    padding-bottom: 16vh;
  }
  /* The text keeps a book's line, and the first sentence above it keeps the same column. */
  .card-main > :global(*) {
    max-width: calc(var(--prose-size) * 33);
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
    /* Bone beside the colored sentence, as a card's own label is. */
    color: var(--text);
  }
  /* On a card, the names, the date, and their buttons sit to the right, under the first sentence. */
  .card-details :global(.facts),
  .card-details :global(.names),
  .card-details :global(.adds) {
    justify-items: end;
    justify-content: flex-end;
    text-align: right;
  }
  .card-details {
    margin-bottom: 22px;
  }
  /* The picture stands down the page's left side, behind the name. */
  .foot {
    position: sticky;
    /* The pane's own padding lies below the page, and the picture reaches past it to the pane's edge. */
    bottom: -60px;
    z-index: 2;
    flex: none;
    height: 0;
    margin: auto -40px -60px;
    pointer-events: none;
  }
  /* The picture is a tall strip down the page's left side, the same shape on every page,
     so what is framed is what shows. `BEHIND_FADE` takes it out toward the text and
     `BEHIND_TOP` softens its top. */
  .corner {
    position: absolute;
    left: 0;
    bottom: 0;
    width: min(36%, 350px);
    aspect-ratio: 10 / 17;
    max-height: 84vh;
  }
  .soft {
    position: absolute;
    inset: 0;
  }
  .rise {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--bg);
  }
  .rise img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
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
  .facts {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }
  .adds {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .names {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .alias {
    padding: 0;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    background: none;
    border: 0;
  }
  button.alias:hover {
    color: var(--text);
  }
  .adds .add {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .adds .add:hover {
    color: var(--text);
  }
</style>
