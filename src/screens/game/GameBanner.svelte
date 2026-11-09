<script module lang="ts">
  import type { ImageSource } from '../../lib/fs/types';

  export interface PictureChoice {
    /** What the buttons call this picture, such as "picture" or "Harrowgate picture". */
    label: string;
    set: (image: ImageSource) => Promise<void>;
    remove: (() => Promise<void>) | null;
  }

</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dropImage } from '../../lib/drop';
  import { pickImage } from '../../lib/pickImage';
  import { frameStyle, type Frame } from '../../lib/index/frame';
  import FramePicture from '../world/FramePicture.svelte';

  /**
   * The top of a page in a game's book (Mike, November 9): a header picture across the
   * pane, like a wiki entry's banner, with the place line and the title over its foot.
   * Without a picture, the place line and title stand alone with a way to add one.
   */
  let {
    url,
    frame,
    place,
    choices,
    onFrame,
    title,
  }: {
    url: string | null;
    frame: Frame | null;
    place: string;
    /** The pictures this page can take: one, or the core picture and the world's own. */
    choices: PictureChoice[];
    onFrame: (frame: Frame) => Promise<void>;
    title: Snippet;
  } = $props();

  let problem = $state('');
  let framing = $state(false);
  let busy = $state(false);

  async function run(job: () => Promise<void>) {
    problem = '';
    try {
      await job();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  const choose = (c: PictureChoice) => run(async () => {
    const image = await pickImage();
    if (image) await c.set(image);
  });

  async function saveFrame(result: { banner: Frame }) {
    busy = true;
    problem = '';
    try {
      await onFrame(result.banner);
      framing = false;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet tools()}
  {#each choices as c (c.label)}
    <button type="button" onclick={() => choose(c)}>{c.remove ? `Change ${c.label}` : `Add ${c.label}`}</button>
    {#if c.remove}<button type="button" onclick={() => run(c.remove!)}>Remove {c.label}</button>{/if}
  {/each}
  {#if url}<button type="button" onclick={() => (framing = true)}>Frame</button>{/if}
{/snippet}

{#if url}
  <header class="poster">
    <div class="banner" use:dropImage={(image) => choices[choices.length - 1] && run(() => choices[choices.length - 1].set(image))}>
      <img src={url} alt="" style={frameStyle(frame)} />
      <div class="tools on-banner">{@render tools()}</div>
      <div class="over">
        <div class="label">{place}</div>
        {@render title()}
      </div>
    </div>
  </header>
{:else}
  <header class="plain">
    <div class="row">
      <div class="label">{place}</div>
      <div class="tools">{@render tools()}</div>
    </div>
    {@render title()}
  </header>
{/if}
{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
{#if framing && url}
  <FramePicture {url} category="" shape="banner" portrait={null} banner={frame} {busy} {problem} bannerOnly onSave={saveFrame} onCancel={() => (framing = false)} />
{/if}

<style>
  .poster {
    display: block;
    margin: -56px -40px 24px;
  }
  .banner {
    position: relative;
    aspect-ratio: 16 / 7;
    min-height: 200px;
    max-height: 340px;
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
    bottom: 18px;
    z-index: 1;
  }
  .over .label {
    color: rgb(255 255 255 / 0.82);
    text-shadow: 0 1px 6px rgb(0 0 0 / 0.6);
  }
  .over :global(input) {
    text-shadow: 0 2px 18px rgb(0 0 0 / 0.55);
  }
  .plain {
    margin-bottom: 14px;
  }
  /* The picture buttons wait until the header is pointed at, so a page without a picture stays quiet. */
  .plain .tools {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .plain:hover .tools,
  .plain .tools:focus-within {
    opacity: 1;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px 12px;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tools button {
    font-size: calc(12px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 4px 9px;
  }
  .tools button:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .tools.on-banner {
    position: absolute;
    top: 14px;
    left: 40px;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .banner:hover .tools.on-banner,
  .tools.on-banner:focus-within {
    opacity: 1;
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
</style>
