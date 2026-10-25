<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../lib/index/wiki';
  import type { WorldFs } from '../lib/fs/types';
  import { Navigator, type Module } from '../lib/nav.svelte';
  import type { View } from '../lib/render';
  import WorldModule from './world/WorldModule.svelte';
  import StoryModule from './story/StoryModule.svelte';
  import { ui } from '../lib/ui.svelte';
  import { contextMenu } from '../lib/contextMenu.svelte';
  import ModeToggle from './ModeToggle.svelte';
  import UpdateButton from './UpdateButton.svelte';

  let {
    index,
    fs,
    rebuild,
    worldName,
    storiesDir,
    onShowLoading,
    onShowShelf,
    onTheme,
  }: {
    index: WikiIndex | null;
    fs: WorldFs;
    rebuild: () => Promise<void>;
    worldName: string;
    storiesDir: string;
    onShowLoading: () => void;
    onShowShelf: () => void;
    /** Opens the theme panel for this world. */
    onTheme: () => void;
  } = $props();

  const nav = new Navigator();

  // Drafting mode belongs to the Story module, so leaving the module leaves it too.
  $effect(() => {
    if (nav.current.module !== 'story') ui.drafting = null;
  });


  function savedView(): View {
    try {
      return localStorage.getItem('immersion.view') === 'protagonist' ? 'protagonist' : 'narrator';
    } catch {
      return 'narrator';
    }
  }
  let view = $state<View>(savedView());
  function setView(v: View) {
    view = v;
    try {
      localStorage.setItem('immersion.view', v);
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  const TABS: [Module, string][] = [
    ['character', 'Character'],
    ['play', 'Play'],
    ['world', 'World'],
    ['story', 'Story'],
  ];
  const COMING: Record<Module, string> = {
    character: 'The Character module gets its own design session first.',
    play: 'Play is built after World and Story.',
    story: '',
    world: '',
  };

  onMount(() => {
    // Back and forward from the keyboard and from the mouse's side buttons.
    const onKey = (e: KeyboardEvent) => {
      const back = (e.altKey && e.key === 'ArrowLeft') || (e.metaKey && e.key === '[');
      const forward = (e.altKey && e.key === 'ArrowRight') || (e.metaKey && e.key === ']');
      if (back) {
        e.preventDefault();
        nav.back();
      } else if (forward) {
        e.preventDefault();
        nav.forward();
      }
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) nav.back();
      if (e.button === 4) nav.forward();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  });
</script>

<div class="shell">
  {#if !ui.drafting}
  <header>
    <div class="left">
      <div class="arrows">
        <button type="button" aria-label="Back" disabled={!nav.canBack} onclick={() => nav.back()}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
        </button>
        <button type="button" aria-label="Forward" disabled={!nav.canForward} onclick={() => nav.forward()}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3 L11 8 L6 13" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
        </button>
      </div>
      <button
        type="button"
        class="world-name"
        title="Show the loading screen. Right-click for the theme."
        onclick={onShowLoading}
        oncontextmenu={(e) =>
          contextMenu.show(e, [
            { label: 'Show the loading screen', run: onShowLoading },
            { label: 'Theme', run: onTheme },
            'separator',
            { label: 'All worlds', run: onShowShelf },
          ])}>{worldName}</button>
      <nav aria-label="Modules">
        {#each TABS as [module, label]}
          <button type="button" class:on={nav.current.module === module} aria-pressed={nav.current.module === module} onclick={() => nav.show(module)}>{label}</button>
        {/each}
      </nav>
    </div>
    <div class="right">
      <UpdateButton />
      {#if nav.current.module === 'world'}
        <div class="toggle" role="group" aria-label="Wiki view">
          <button type="button" class:on={view === 'narrator'} aria-pressed={view === 'narrator'} onclick={() => setView('narrator')}>Narrator</button>
          <button type="button" class:on={view === 'protagonist'} aria-pressed={view === 'protagonist'} onclick={() => setView('protagonist')}>Protagonist</button>
        </div>
      {/if}
      <ModeToggle />
      <button type="button" class="quiet" onclick={onShowShelf} title="Show every world on this computer">Worlds</button>
    </div>
  </header>
  {/if}

  {#if nav.current.module === 'world'}
    {#if index}
      <WorldModule {index} {fs} {nav} {view} {worldName} {rebuild} />
    {:else}
      <div class="waiting">Reading the world…</div>
    {/if}
  {:else if nav.current.module === 'story'}
    {#if index}
      <StoryModule {index} {fs} {nav} {storiesDir} {rebuild} />
    {:else}
      <div class="waiting">Reading the world…</div>
    {/if}
  {:else}
    <div class="waiting">{COMING[nav.current.module]}</div>
  {/if}
</div>

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 60px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--rule);
    box-sizing: border-box;
  }
  .left,
  .right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .arrows {
    display: flex;
  }
  .arrows button {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
    background: none;
    border: 0;
  }
  .arrows button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .world-name {
    font-family: var(--font-display);
    font-size: 26px;
    letter-spacing: 0.02em;
    color: var(--text);
    background: none;
    border: 0;
    padding: 6px 6px;
  }
  nav {
    display: flex;
    gap: 4px;
  }
  nav button {
    font-size: 14px;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 10px 14px;
    min-height: 40px;
  }
  nav button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    font-weight: 700;
  }
  .toggle {
    display: flex;
    border: 1px solid var(--rule-strong);
  }
  .toggle button {
    font-size: 13px;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 9px 12px;
    min-height: 40px;
  }
  .toggle button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .quiet {
    font-size: 13px;
    color: var(--muted);
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 9px 12px;
    min-height: 40px;
  }
  .waiting {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    padding: 0 24px;
    text-align: center;
  }
</style>
