<script lang="ts">
  import { onMount } from 'svelte';
  import { inDesktopApp } from './lib/runtime';
  import type { WorldFs } from './lib/fs/types';
  import type { Library } from './lib/library/types';
  import { loadWorld, type World } from './lib/world';
  import { buildWikiIndex, type WikiIndex } from './lib/index/wiki';
  import Shelf from './screens/shelf/Shelf.svelte';
  import Loading from './screens/Loading.svelte';
  import Shell from './screens/Shell.svelte';

  type Phase = 'starting' | 'shelf' | 'loading' | 'inside' | 'error';

  let phase = $state<Phase>('starting');
  let fs = $state<WorldFs | null>(null);
  let world = $state<World | null>(null);
  let index = $state<WikiIndex | null>(null);
  let problem = $state('');
  let library = $state.raw<Library | null>(null);

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

  async function open(path: string) {
    if (!library) return;
    try {
      await enter(await library.open(path));
    } catch (e) {
      problem = String(e);
      phase = 'error';
    }
  }

  async function showShelf() {
    stopWatching();
    await library?.close();
    fs = null;
    world = null;
    phase = 'shelf';
  }

  // The app opens straight into the world used last, and otherwise shows the shelf.
  onMount(async () => {
    if (inDesktopApp) {
      const { DiskLibrary } = await import('./lib/library/disk');
      library = new DiskLibrary();
    } else {
      const [{ MemoryLibrary }, { sampleWorld }] = await Promise.all([import('./lib/library/memory'), import('./lib/sample')]);
      library = new MemoryLibrary(sampleWorld());
    }
    const last = await library.last();
    if (last) {
      try {
        await enter(await library.open(last));
        return;
      } catch {
        // Fall through to the shelf.
      }
    }
    phase = 'shelf';
  });
</script>

{#if phase === 'shelf' && library}
  <Shelf {library} onOpen={open} />
{:else if (phase === 'loading' || phase === 'inside') && world && fs}
  <!-- The main screen stays alive under the loading screen, so history survives a visit to it. -->
  <Shell
    {index}
    {fs}
    {rebuild}
    worldName={world.name}
    storiesDir={world.storiesDir}
    onShowLoading={() => (phase = 'loading')}
    onShowShelf={showShelf}
  />
  {#if phase === 'loading'}
    <div class="overlay">
      <Loading
        {world}
        imageUrl={world.imagePath ? fs.imageUrl(world.imagePath) : null}
        onEnter={() => (phase = 'inside')}
        onSetCover={async (image) => {
          if (!fs) return;
          await fs.setImage('world', image);
          world = await loadWorld(fs);
        }} />
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
