<script lang="ts">
  import { onMount } from 'svelte';
  import { inDesktopApp } from './lib/runtime';
  import type { WorldFs } from './lib/fs/types';
  import { DiskFs, closeWorld, openWorldFolder, rememberedWorld } from './lib/fs/disk';
  import { loadWorld, type World } from './lib/world';
  import { buildWikiIndex, type WikiIndex } from './lib/index/wiki';
  import ChooseWorld from './screens/ChooseWorld.svelte';
  import Loading from './screens/Loading.svelte';
  import Shell from './screens/Shell.svelte';

  type Phase = 'starting' | 'choose' | 'loading' | 'inside' | 'error';

  let phase = $state<Phase>('starting');
  let fs = $state<WorldFs | null>(null);
  let world = $state<World | null>(null);
  let index = $state<WikiIndex | null>(null);
  let problem = $state('');

  async function enter(source: WorldFs) {
    try {
      fs = source;
      world = await loadWorld(source);
      index = null;
      phase = 'loading';
      // The index builds while the loading screen is up.
      index = await buildWikiIndex(source, world);
      watchWorld(source);
    } catch (e) {
      problem = String(e);
      phase = 'error';
    }
  }

  // Edits from anywhere (this app, Obsidian, a git pull) rebuild the index. Changes
  // usually arrive in bursts, so the rebuild waits until they settle.
  let stopWatching = () => {};
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  async function rebuild() {
    if (!fs || !world) return;
    try {
      world = await loadWorld(fs);
      index = await buildWikiIndex(fs, world);
    } catch {
      // Keep the last good index if a file is mid-write.
    }
  }
  function watchWorld(source: WorldFs) {
    stopWatching();
    stopWatching = source.onChange(() => {
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuild, 250);
    });
  }

  async function switchWorld() {
    stopWatching();
    await closeWorld();
    fs = null;
    world = null;
    phase = 'choose';
  }

  onMount(async () => {
    if (!inDesktopApp) {
      const { sampleWorld } = await import('./lib/sample');
      await enter(sampleWorld());
      return;
    }
    const remembered = await rememberedWorld();
    if (remembered) {
      try {
        await openWorldFolder(remembered);
        await enter(new DiskFs());
        return;
      } catch {
        // Fall through to asking for a folder.
      }
    }
    phase = 'choose';
  });
</script>

{#if phase === 'choose'}
  <ChooseWorld onOpened={() => enter(new DiskFs())} />
{:else if (phase === 'loading' || phase === 'inside') && world && fs}
  <!-- The main screen stays alive under the loading screen, so history survives a visit to it. -->
  <Shell
    {index}
    {fs}
    {rebuild}
    worldName={world.name}
    onShowLoading={() => (phase = 'loading')}
    onSwitchWorld={inDesktopApp ? switchWorld : null}
  />
  {#if phase === 'loading'}
    <div class="overlay">
      <Loading {world} imageUrl={world.imagePath ? fs.imageUrl(world.imagePath) : null} onEnter={() => (phase = 'inside')} />
    </div>
  {/if}
{:else if phase === 'error'}
  <main class="problem" role="alert">{problem}</main>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
  }
  .problem {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 24px;
    color: #ff9a9a;
  }
</style>
