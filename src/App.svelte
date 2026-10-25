<script lang="ts">
  import { onMount } from 'svelte';
  import { inDesktopApp } from './lib/runtime';
  import type { WorldFs } from './lib/fs/types';
  import type { Library } from './lib/library/types';
  import { loadWorld, type World } from './lib/world';
  import { applyTheme, type Mode, type ThemeSpec } from './lib/theme';
  import { mode } from './lib/mode.svelte';
  import { buildWikiIndex, type WikiIndex } from './lib/index/wiki';
  import Shelf from './screens/shelf/Shelf.svelte';
  import ContextMenu from './screens/ContextMenu.svelte';
  import Loading from './screens/Loading.svelte';
  import Shell from './screens/Shell.svelte';
  import ThemeEditor from './screens/ThemeEditor.svelte';
  import Reader from './screens/Reader.svelte';
  import { readerPage, setWindowWorld } from './lib/windows';

  type Phase = 'starting' | 'shelf' | 'loading' | 'inside' | 'reader' | 'error';

  let phase = $state<Phase>('starting');
  let fs = $state<WorldFs | null>(null);
  let world = $state<World | null>(null);
  let index = $state<WikiIndex | null>(null);
  let problem = $state('');
  let library = $state.raw<Library | null>(null);

  // The open world wears its own theme, and the shelf wears Night. A theme being edited
  // shows on the whole app until it is saved or cancelled.
  let previewTheme = $state<{ spec: ThemeSpec | null; side: Mode } | undefined>(undefined);
  $effect(() => {
    if (phase === 'reader') return;
    if (previewTheme) applyTheme(previewTheme.spec, previewTheme.side);
    else applyTheme(phase === 'shelf' ? null : (world?.theme ?? null), mode.current);
  });

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
    setWindowWorld(path);
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

  // The theme panel for the open world, with the text of its world.md.
  let themeFor = $state<string | null>(null);
  async function editTheme() {
    if (!fs) return;
    themeFor = await fs.readText('world.md');
  }
  function closeTheme() {
    themeFor = null;
    previewTheme = undefined;
  }

  // The app opens straight into the world used last, and otherwise shows the shelf.
  // A reading window shows one page of the world the main window has open.
  let readerId = $state('');

  onMount(async () => {
    const page = readerPage();
    if (page) {
      readerId = page.id;
      if (inDesktopApp) {
        const { DiskFs } = await import('./lib/fs/disk');
        fs = new DiskFs(page.world);
      } else {
        const [{ MemoryLibrary }, { sampleWorld }] = await Promise.all([import('./lib/library/memory'), import('./lib/sample')]);
        const sample = new MemoryLibrary(sampleWorld());
        fs = await sample.open((await sample.list())[0].path);
      }
      phase = 'reader';
      return;
    }
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
        setWindowWorld(last);
        await enter(await library.open(last));
        return;
      } catch {
        // Fall through to the shelf.
      }
    }
    phase = 'shelf';
  });
</script>

{#if phase === 'reader' && fs}
  <Reader {fs} id={readerId} />
{:else if phase === 'shelf' && library}
  <Shelf {library} onOpen={open} onPreviewTheme={(preview) => (previewTheme = preview)} />
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
    onTheme={editTheme}
  />
  {#if themeFor !== null}
    <ThemeEditor
      worldMd={themeFor}
      worldName={world.name}
      onPreview={(spec, side) => (previewTheme = { spec, side })}
      onSave={async (text) => {
        await fs!.writeText('world.md', text);
        world = await loadWorld(fs!);
        closeTheme();
      }}
      onCancel={closeTheme} />
  {/if}
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

<ContextMenu />

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
    color: var(--danger);
  }
</style>
