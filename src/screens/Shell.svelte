<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../lib/index/wiki';
  import type { WorldFs } from '../lib/fs/types';
  import { Navigator, type Module } from '../lib/nav.svelte';
  import type { View } from '../lib/render';
  import WorldModule from './world/WorldModule.svelte';
  import StoryModule from './story/StoryModule.svelte';
  import { ui } from '../lib/ui.svelte';
  import { findUpdate, installUpdate } from '../lib/updates';
  import type { Update } from '@tauri-apps/plugin-updater';

  let {
    index,
    fs,
    rebuild,
    worldName,
    storiesDir,
    onShowLoading,
    onShowShelf,
  }: {
    index: WikiIndex | null;
    fs: WorldFs;
    rebuild: () => Promise<void>;
    worldName: string;
    storiesDir: string;
    onShowLoading: () => void;
    onShowShelf: () => void;
  } = $props();

  const nav = new Navigator();

  // Drafting mode belongs to the Story module, so leaving the module leaves it too.
  $effect(() => {
    if (nav.current.module !== 'story') ui.drafting = null;
  });

  // A newer build, if GitHub has one. Checked once at startup.
  let update = $state<Update | null>(null);
  let updating = $state(false);
  let updateError = $state('');
  async function runUpdate() {
    if (!update) return;
    updating = true;
    updateError = '';
    try {
      await installUpdate(update);
    } catch (e) {
      updateError = String(e);
      updating = false;
    }
  }

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
    findUpdate().then((u) => (update = u));
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
      <button type="button" class="world-name" title="Show the loading screen" onclick={onShowLoading}>{worldName}</button>
      <nav aria-label="Modules">
        {#each TABS as [module, label]}
          <button type="button" class:on={nav.current.module === module} aria-pressed={nav.current.module === module} onclick={() => nav.show(module)}>{label}</button>
        {/each}
      </nav>
    </div>
    <div class="right">
      {#if update}
        <button type="button" class="update" disabled={updating} title={updateError || `Install Immersion ${update.version}`} onclick={runUpdate}>
          {updating ? 'Updating…' : updateError ? 'Update failed, retry' : `Update to ${update.version}`}
        </button>
      {/if}
      {#if nav.current.module === 'world'}
        <div class="toggle" role="group" aria-label="Wiki view">
          <button type="button" class:on={view === 'narrator'} aria-pressed={view === 'narrator'} onclick={() => setView('narrator')}>Narrator</button>
          <button type="button" class:on={view === 'protagonist'} aria-pressed={view === 'protagonist'} onclick={() => setView('protagonist')}>Protagonist</button>
        </div>
      {/if}
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
      <StoryModule {index} {fs} {nav} {storiesDir} />
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
    color: var(--structure-soft);
    background: var(--structure-deep);
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
    color: var(--structure-soft);
    background: var(--structure-deep);
  }
  .update {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border: 0;
    padding: 9px 14px;
    min-height: 40px;
  }
  .update:disabled {
    opacity: 0.7;
    cursor: default;
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
