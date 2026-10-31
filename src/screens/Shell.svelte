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
  import SyncStatus from './SyncStatus.svelte';
  import BoardsModule from './boards/BoardsModule.svelte';
  import UpdateButton from './UpdateButton.svelte';
  import Finder from './Finder.svelte';

  let {
    index,
    fs,
    rebuild,
    worldName,
    storiesDir,
    journal = false,
    daily = false,
    onShowLoading,
    onShowShelf,
    onTheme,
    onDetails,
  }: {
    index: WikiIndex | null;
    fs: WorldFs;
    rebuild: () => Promise<void>;
    worldName: string;
    storiesDir: string;
    /** Real World, the journal, which opens on its vault. */
    journal?: boolean;
    daily?: boolean;
    onShowLoading: () => void;
    onShowShelf: () => void;
    /** Opens the theme panel for this world. */
    onTheme: () => void;
    /** Opens the world's name and tagline. */
    onDetails: () => void;
  } = $props();

  const nav = new Navigator();

  // The quick finder (Mike, October 31), from its button or Ctrl or Cmd and K anywhere.
  let finding = $state(false);
  const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  function worldMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    contextMenu.show(
      e,
      [
        { label: 'All worlds', run: onShowShelf },
        'separator',
        { label: 'Show the loading screen', run: onShowLoading },
        { label: 'Edit details', run: onDetails },
        { label: 'Theme', run: onTheme },
        { label: 'Settings', run: () => (ui.settings = 'world') },
      ],
      { x: r.left, y: r.bottom + 4 },
    );
  }

  // Full screen belongs to the module it was opened in, so leaving the module leaves it too.
  const currentModule = $derived(nav.current.module);
  $effect(() => {
    void currentModule;
    ui.full = null;
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
    ['boards', 'Boards'],
    ['story', 'Story'],
  ];
  const COMING: Record<Module, string> = {
    character: 'The Character module gets its own design session first.',
    play: 'Play is built after World and Story.',
    story: '',
    world: '',
    boards: '',
  };

  // Real World opens on its journal (Mike, October 26).
  onMount(() => {
    if (journal) nav.openIn('story', '@vault');
  });

  onMount(() => {
    // Back and forward from the keyboard and from the mouse's side buttons.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        finding = !finding;
        return;
      }
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
  {#if !ui.full}
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
      <!-- The world's name opens the world's menu, which also leads back to every world
           (Mike, October 31). The arrow says it can be clicked. -->
      <button type="button" class="world-name" title="All worlds, this world's details, theme, and loading screen" aria-haspopup="menu" onclick={worldMenu} oncontextmenu={worldMenu}>
        {worldName}
        <svg class="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
      </button>
      <nav aria-label="Modules">
        {#each TABS as [module, label]}
          <button type="button" class:on={nav.current.module === module} aria-pressed={nav.current.module === module} onclick={() => nav.show(module)}>{label}</button>
        {/each}
      </nav>
    </div>
    <div class="right">
      <button type="button" class="find" title="Find anything in this world" onclick={() => (finding = true)}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10.4 10.4 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        Find <kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <SyncStatus />
      <UpdateButton />
      {#if nav.current.module === 'world'}
        <div class="toggle" role="group" aria-label="Wiki view">
          <button type="button" class:on={view === 'narrator'} aria-pressed={view === 'narrator'} onclick={() => setView('narrator')}>Narrator</button>
          <button type="button" class:on={view === 'protagonist'} aria-pressed={view === 'protagonist'} onclick={() => setView('protagonist')}>Protagonist</button>
        </div>
      {/if}
    </div>
  </header>
  {/if}

  {#if nav.current.module === 'world'}
    {#if index}
      <WorldModule {index} {fs} {nav} {view} {worldName} {rebuild} />
    {:else}
      <div class="waiting">Reading the world…</div>
    {/if}
  {:else if nav.current.module === 'boards'}
    {#if index}
      <BoardsModule {index} {fs} {nav} {worldName} {storiesDir} {rebuild} />
    {:else}
      <div class="waiting">Reading the world…</div>
    {/if}
  {:else if nav.current.module === 'story'}
    {#if index}
      <StoryModule {index} {fs} {nav} {storiesDir} {rebuild} {journal} {daily} />
    {:else}
      <div class="waiting">Reading the world…</div>
    {/if}
  {:else}
    <div class="waiting">{COMING[nav.current.module]}</div>
  {/if}
</div>

{#if finding && index}
  <Finder {index} {fs} {nav} {storiesDir} onClose={() => (finding = false)} {onShowShelf} {onTheme} {onDetails} {onShowLoading} />
{/if}

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
    border-bottom: 1px solid var(--line);
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
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-display);
    font-size: calc(26px * var(--type));
    letter-spacing: 0.02em;
    color: var(--text);
    background: none;
    border: 0;
    border-radius: var(--round);
    padding: 6px 10px 6px 8px;
  }
  .world-name:hover {
    background: var(--surface);
  }
  .chevron {
    color: var(--muted);
    margin-top: 2px;
  }
  .world-name:hover .chevron {
    color: var(--text);
  }
  nav {
    display: flex;
    gap: 4px;
  }
  nav button {
    font-size: calc(14px * var(--type));
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
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .toggle button {
    font-size: calc(13px * var(--type));
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
  .waiting {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    padding: 0 24px;
    text-align: center;
  }
  .find {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: calc(13px * var(--type));
    color: var(--muted);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 7px 10px 7px 12px;
    min-height: 36px;
    min-width: 150px;
  }
  .find:hover {
    color: var(--text);
  }
  .find kbd {
    margin-left: auto;
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    letter-spacing: 0.04em;
    opacity: 0.8;
  }
</style>
