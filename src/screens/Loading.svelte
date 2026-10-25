<script lang="ts">
  import { onMount } from 'svelte';
  import { textColorOver } from '../lib/contrast';
  import type { World } from '../lib/world';
  import { appVersion } from '../lib/version';
  import { dropImage } from '../lib/drop';
  import { pickImage } from '../lib/pickImage';
  import type { ImageSource } from '../lib/fs/types';

  let {
    world,
    imageUrl,
    onEnter,
    onSetCover,
  }: { world: World; imageUrl: string | null; onEnter: () => void; onSetCover: (image: ImageSource) => Promise<void> } = $props();

  // A world with no cover invites one right here (Mike, October 25).
  let coverProblem = $state('');
  async function setCover(image: ImageSource | null) {
    if (!image) return;
    coverProblem = '';
    try {
      await onSetCover(image);
    } catch (e) {
      coverProblem = e instanceof Error ? e.message : String(e);
    }
  }

  // Light text until the image has been measured.
  let tone = $state<'light' | 'dark'>('light');
  let enterButton: HTMLButtonElement | undefined = $state();
  let version = $state('');

  // The name sits in the bottom-left corner, so that is the part of the image measured.
  const TEXT_REGION = { left: 0.03, top: 0.62, width: 0.5, height: 0.33 };

  async function measure() {
    if (!imageUrl) return;
    try {
      tone = await textColorOver(imageUrl, { width: window.innerWidth, height: window.innerHeight }, TEXT_REGION);
    } catch {
      tone = 'light';
    }
  }

  // A cover chosen on this screen is measured again, so the name stays readable over it.
  $effect(() => {
    void imageUrl;
    measure();
  });

  onMount(() => {
    appVersion().then((v) => (version = v));
    measure();
    const onResize = () => measure();
    // Focus the enter button, so a key press never reaches a control behind this screen.
    enterButton?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<section class:dark={tone === 'dark'}>
  {#if imageUrl}
    <img src={imageUrl} alt="" crossorigin="anonymous" />
  {:else}
    <div class="invite" use:dropImage={setCover}>
      <p>{world.name} has no cover yet. Drop a picture here, or</p>
      <button type="button" class="choose" onclick={async () => setCover(await pickImage())}>Choose a picture</button>
      {#if coverProblem}<p class="problem" role="alert">{coverProblem}</p>{/if}
    </div>
  {/if}
  <div class="corner">
    <div>
      {#if world.tagline}<div class="tagline">{world.tagline}</div>{/if}
      <h1>{world.name}</h1>
    </div>
    <div class="enter">
      <button type="button" bind:this={enterButton} onclick={onEnter}>Enter the world</button>
      {#if version}<div class="version">Immersion {version}</div>{/if}
    </div>
  </div>
</section>

<style>
  section {
    --ink: #ffffff;
    --ink-inverse: #0b0b0b;
    position: relative;
    height: 100%;
    overflow: hidden;
    background: var(--bg-deep);
    color: var(--ink);
  }
  section.dark {
    --ink: #0b0b0b;
    --ink-inverse: #ffffff;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .invite {
    position: absolute;
    inset: 15% 20% 40%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
    border: 1px dashed var(--rule-strong);
    color: var(--text-soft);
  }
  :global(.invite.drop-over) {
    border-color: var(--structure);
    background: color-mix(in srgb, var(--structure-deep) 50%, transparent);
  }
  .invite p {
    margin: 0;
    font-size: 16px;
  }
  .invite .choose {
    font-size: 14px;
    font-weight: 400;
    color: var(--structure);
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 8px 14px;
    min-height: 40px;
  }
  .invite .problem {
    color: var(--danger);
  }
  .corner {
    position: absolute;
    left: 48px;
    right: 48px;
    bottom: 44px;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
  }
  .tagline {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  h1 {
    margin: 4px 0 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(72px, 10vw, 148px);
    line-height: 0.95;
    letter-spacing: 0.02em;
  }
  .enter {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .version {
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }
  button {
    font-weight: 700;
    font-size: 16px;
    color: var(--ink-inverse);
    background: var(--ink);
    border: 0;
    padding: 14px 32px;
    min-height: 48px;
  }
</style>
