<script lang="ts">
  import { errorText } from './lib/errors';
  import { fade } from 'svelte/transition';
  import { onShortcut } from './lib/shortcuts';
  import { room } from './lib/room.svelte';
  import { noteTrouble, watchForTrouble } from './lib/trouble';
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
  import { spell } from './lib/spell';
  import Dialog from './screens/shelf/Dialog.svelte';
  import { frameStyle, writeFrame } from './lib/index/frame';
  import type { RoomPicture } from './lib/room.svelte';
  import Reader from './screens/Reader.svelte';
  import { readerPage, setWindowWorld } from './lib/windows';
  import { account } from './lib/account.svelte';
  import { ui } from './lib/ui.svelte';
  import { splitHeader, withHeader } from './lib/world';
  import Settings from './screens/Settings.svelte';
  import realWorld from './assets/real-world.jpg';
  import WorldDetails from './screens/shelf/WorldDetails.svelte';
  import type { ShelfWorld } from './lib/library/types';
  import { sync } from './lib/sync.svelte';
  import { updates } from './lib/updates.svelte';
  import { BOARD_FONTS } from './lib/you';
  import { zoom } from './lib/zoom.svelte';
  import { vault } from './lib/vault/vault.svelte';
  import { saveAll } from './lib/saves';
  import { quiet } from './lib/view.svelte';

  type Phase = 'starting' | 'shelf' | 'loading' | 'inside' | 'reader' | 'error';

  let phase = $state<Phase>('starting');
  let fs = $state<WorldFs | null>(null);
  let world = $state<World | null>(null);
  let index = $state<WikiIndex | null>(null);
  let problem = $state('');
  /** True while a world is being opened, when its loading screen may enter on its own. */
  let arriving = $state(false);
  let library = $state.raw<Library | null>(null);

  // The open world wears its own theme, and the shelf wears Night. A theme being edited
  // shows on the whole app until it is saved or cancelled.
  let previewTheme = $state<{ spec: ThemeSpec | null; side: Mode } | undefined>(undefined);
  $effect(() => {
    if (phase === 'reader') return;
    if (previewTheme) applyTheme(previewTheme.spec, previewTheme.side);
    else applyTheme(phase === 'shelf' ? null : (world?.theme ?? null), mode.current);
  });

  // The writer's layout, the same on every world (Cerys, October 27). In Soft, the open
  // world's picture can glow through the desk.
  $effect(() => {
    // Radiance is Soft with a picture that belongs to the room, so it wears Soft's rules.
    document.documentElement.dataset.layout = account.look.layout === 'radiance' ? 'soft' : account.look.layout;
    room.on = account.look.layout === 'radiance';
    const face = BOARD_FONTS.find(([id]) => id === account.look.boardFont)?.[2];
    if (face) document.documentElement.style.setProperty('--board-font', face);
    else document.documentElement.style.removeProperty('--board-font');
  });
  const backdrop = $derived(
    account.look.layout !== 'classic' && account.look.backdrop && fs && world && (phase === 'loading' || phase === 'inside')
      ? world.imagePath
        ? fs.imageUrl(world.imagePath)
        : world.journal
          ? realWorld
          : null
      : null,
  );

  // Spelling (Cerys, November 21): the writer's own words and the world's names are never
  // misspelled, and the open world says which English it is written in.
  $effect(() => spell.allow('mine', account.words));
  $effect(() => spell.allow('world', index ? [...index.entries.values()].flatMap((e) => [e.name, ...e.aliases]) : []));
  $effect(() => {
    const inside = !!world && !!fs && (phase === 'loading' || phase === 'inside');
    spell.setLanguage(inside ? world!.spelling : 'american', inside && world!.spanish);
    spell.onSpanish = inside
      ? async (on) => {
          await fs!.writeText('world.md', withHeader(await fs!.readText('world.md'), { spelling_also: on ? 'spanish' : undefined }));
          world = await loadWorld(fs!);
        }
      : null;
    spell.onLanguage = inside
      ? async (language) => {
          await fs!.writeText('world.md', withHeader(await fs!.readText('world.md'), { spelling: language === 'british' ? 'british' : undefined }));
          world = await loadWorld(fs!);
        }
      : null;
  });
  spell.onAdd = (word) => void account.addWord(word);

  // The room's picture, in the Radiance layout: the page in use, or else the world's.
  const worldPicture = $derived(fs && world ? (world.imagePath ? fs.imageUrl(world.imagePath) : world.journal ? realWorld : null) : null);
  const roomPicture = $derived<RoomPicture | null>(
    room.on && fs && world && phase === 'inside' ? (room.pictureFor(room.open) ?? (worldPicture ? { url: worldPicture, frame: world.roomFrame } : null)) : null,
  );
  $effect(() => {
    document.documentElement.dataset.room = roomPicture ? 'radiance' : '';
  });

  async function enter(source: WorldFs) {
    try {
      fs = source;
      world = await loadWorld(source);
      index = null;
      arriving = true;
      phase = 'loading';
      // The index builds while the loading screen is up.
      index = await buildWikiIndex(source, world);
      watchWorld(source);
      sync.start(source, world.name);
    } catch (e) {
      problem = errorText(e);
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
    // Only a change to the wiki or to the world's own card rebuilds the index (code review,
    // November 21). Every save of a chapter, a board, or a session used to rebuild it too,
    // which read every wiki file again and held the screen for a moment in a large world.
    let wikiChanged = false;
    stopWatching = source.onChange((paths) => {
      const wiki = `${(world?.wikiDir ?? 'wiki').replace(/\/+$/, '')}/`;
      const touches = (p: string) => {
        const q = p.replace(/\\/g, '/');
        return q.startsWith(wiki) || /^world\.(md|jpe?g|png|webp)$/i.test(q);
      };
      if (paths.some(touches)) wikiChanged = true;
      if (!wikiChanged) return;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        wikiChanged = false;
        void rebuild();
      }, 250);
    });
  }

  let openPath = $state('');
  $effect(() => {
    ui.world = openPath && world && phase !== 'shelf' ? { path: openPath, name: world.name } : null;
  });
  async function open(path: string) {
    if (!library) return;
    openPath = path;
    setWindowWorld(path);
    try {
      await enter(await library.open(path));
    } catch (e) {
      problem = errorText(e);
      phase = 'error';
    }
  }

  // While the writer types, everything but the page steps back (lib/view.svelte.ts).
  $effect(() => {
    document.documentElement.classList.toggle('typing', quiet.on && quiet.typing);
  });

  /** Sets how every entry in the open world shows its picture (Cerys, November 10). */
  async function setPictures(shape: 'portrait' | 'banner' | 'behind' | null) {
    if (!fs) return;
    await fs.writeText('world.md', withHeader(await fs.readText('world.md'), { pictures: shape ?? undefined }));
    await rebuild();
  }

  /** Takes each entry's own choice of shape away, so every entry follows the world's. Framing is kept. */
  async function followWorldPictures() {
    if (!fs || !index) return;
    await saveAll();
    for (const e of index.entries.values()) {
      if (e.picture) await fs.writeText(e.id, withHeader(await fs.readText(e.id), { picture: undefined }));
    }
    await rebuild();
  }

  /** Writes everything still waiting to be saved, giving up after a few seconds so nothing hangs on it. */
  // A save in the background, when the window loses the keyboard: best effort, and silent.
  const saveEverything = () => Promise.race([saveAll().catch(() => {}), new Promise((done) => setTimeout(done, 3000))]);

  /**
   * The last save before a world or the window closes (code review, November 21). A clash
   * still open is settled in the writer's favor, and the answer says whether everything
   * typed is on disk. When it is not, what was about to close stays open and says so, so
   * a failed save is never followed by the page that held it going away.
   */
  async function saveBeforeClosing(): Promise<boolean> {
    const slow = new Promise<boolean>((done) => setTimeout(() => done(false), 8000));
    return Promise.race([saveAll(true).catch(() => false), slow]);
  }
  let closingAnyway = false;
  /** What could not be saved, and what to do if the writer closes anyway. */
  let unsaved = $state<{ what: string; anyway: () => void | Promise<void> } | null>(null);


  async function showShelf(anyway = false) {
    // The last words typed are written while the world is still open to write into.
    if (!anyway && !(await saveBeforeClosing())) {
      unsaved = { what: 'go to the Worlds page', anyway: () => showShelf(true) };
      return;
    }
    stopWatching();
    sync.stop();
    await library?.close();
    fs = null;
    world = null;
    phase = 'shelf';
  }

  // Settings shows the open world's author details, so they can become a profile.
  let settingsWorld = $state<{ name: string; path: string; author: string; copyright: string } | null>(null);
  $effect(() => {
    if (!ui.settings) return;
    const source = fs;
    const w = world;
    const path = openPath;
    if (!source || !w || phase === 'shelf') {
      settingsWorld = null;
      settingsWorldMd = null;
      return;
    }
    source.readText('world.md').then((text) => {
      settingsWorldMd = text;
      const { header } = splitHeader(text);
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      settingsWorld = { name: w.name, path, author: str(header.author), copyright: str(header.copyright) };
    });
  });

  // The open world's name and tagline, from the menu on its name (Cerys, October 26).
  let detailsFor = $state<ShelfWorld | null>(null);
  async function editDetails() {
    if (!library) return;
    detailsFor = (await library.list()).find((w) => w.path === openPath) ?? null;
  }

  // The open world's theme is a group of Settings (Cerys, November 18).
  const editTheme = () => (ui.settings = 'theme');
  let settingsWorldMd = $state<string | null>(null);

  // The app opens straight into the world used last, and otherwise shows the shelf.
  // A reading window shows one page of the world the main window has open.
  let readerId = $state('');

  onMount(async () => {
    // Ctrl or Cmd, Shift, L locks the vault at once, wherever the writer is.
    onShortcut((e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        void vault.lock();
      }
    });
    zoom.start();
    quiet.start();
    watchForTrouble();
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
      // A reading window wears the writer's layout too.
      if (inDesktopApp) void import('./lib/library/disk').then(({ DiskLibrary }) => account.attach(new DiskLibrary())).catch(() => {});
      return;
    }
    // Typing is saved a moment after it stops, so the moment is closed whenever the writer
    // turns to another program, and before the window closes.
    window.addEventListener('blur', () => void saveEverything());
    // A link to somewhere else opens in the computer's browser and never inside the app's
    // own window (code review, November 21), where the page it led to would replace the
    // app, drop what was unsaved, and could pose as it.
    document.addEventListener(
      'click',
      (e) => {
        const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!link) return;
        const href = link.getAttribute('href') ?? '';
        if (href.startsWith('#')) return;
        e.preventDefault();
        if (!/^https?:\/\//i.test(href)) return;
        if (inDesktopApp) void import('@tauri-apps/plugin-opener').then((m) => m.openUrl(href)).catch((err) => noteTrouble('link', err));
        else window.open(href, '_blank', 'noopener');
      },
      true,
    );
    if (inDesktopApp) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested(async (event) => {
        if (closingAnyway || (await saveBeforeClosing())) return;
        // The window stays open, and the writer chooses.
        event.preventDefault();
        unsaved = { what: 'close the window', anyway: () => ((closingAnyway = true), getCurrentWindow().close()) };
      })).catch(() => {});
    }
    if (inDesktopApp) {
      const { DiskLibrary } = await import('./lib/library/disk');
      library = new DiskLibrary();
    } else {
      const [{ MemoryLibrary }, { sampleWorld }, game] = await Promise.all([import('./lib/library/memory'), import('./lib/sample'), import('./lib/sample/game')]);
      const trial = game.trialGame();
      const { MemoryFs } = await import('./lib/fs/memory');
      // A second sample world with no game yet, so starting one can be tried in the browser.
      const bare = new MemoryFs({ 'world.md': '---\nname: Low Tide\ntagline: A sample world with no game yet\n---\n', 'wiki/places/the-flats.md': '# The Flats\n\nMud to the horizon at low water.\n' });
      library = new MemoryLibrary(sampleWorld(), { '/worlds/low-tide': bare, ...(trial ? { '/worlds/game-trial': trial.world } : {}) }, {
        [game.SAMPLE_ENGINE]: game.sampleEngine(),
        ...(trial ? { [trial.engine]: trial.engineFs } : {}),
      });
    }
    await account.attach(library);
    updates.start();
    // At launch the library brings in what other computers saved to immersion.md, so a
    // vault passphrase or a layout chosen there is here before it is needed.
    void library
      .syncYou()
      .then(async (r) => {
        if (r.state !== 'synced') return;
        await account.refresh();
        account.pulled++;
      })
      .catch(() => {});
    // The app opens on the Worlds page, where the library's sync and every world can be
    // seen before one is chosen (Cerys, October 28).
    phase = 'shelf';
  });
</script>

{#if roomPicture}
  <div class="room-picture" aria-hidden="true">
    {#key roomPicture.url}
      <img src={roomPicture.url} alt="" style={frameStyle(roomPicture.frame)} transition:fade={{ duration: 900 }} />
    {/key}
  </div>
{/if}
{#if backdrop}
  <div class="backdrop-glass" style:background-image={`url("${backdrop}")`} aria-hidden="true"></div>
{/if}

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
    journal={world.journal}
    daily={world.daily}
    onShowLoading={() => ((arriving = false), (phase = 'loading'))}
    onShowShelf={() => showShelf()}
    onTheme={editTheme}
    onDetails={editDetails}
    engineRel={world.engine}
    gameDir={world.gameDir}
    openEngine={(rel) => (library ? library.openEngine(rel) : Promise.resolve(null))}
    engineChoices={async () => {
      if (!library) return [];
      const named = (await library.list()).map((w) => (w.worldMd ? splitHeader(w.worldMd).header.engine : null));
      return [...new Set(named.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map((e) => e.trim()))];
    }}
  />
  {#if detailsFor && library}
    <WorldDetails
      {library}
      world={detailsFor}
      onCancel={() => (detailsFor = null)}
      onSaved={async () => {
        detailsFor = null;
        world = await loadWorld(fs!);
      }} />
  {/if}
  {#if phase === 'loading'}
    <div class="overlay">
      <Loading
        {world}
        imageUrl={world.imagePath ? fs.imageUrl(world.imagePath) : world.journal ? realWorld : null}
        auto={arriving && account.look.autoEnter}
        onEnter={() => ((phase = 'inside'), (arriving = false))}
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

{#if ui.settings && phase !== 'reader'}
  <Settings
    world={phase === 'shelf' ? null : settingsWorld}
    pictures={phase === 'shelf' || !world || !index || !fs
      ? null
      : {
          shape: world.pictures,
          own: [...index.entries.values()].filter((e) => e.picture).length,
          set: setPictures,
          follow: followWorldPictures,
        }}
    journal={world?.journal ? { daily: world.daily } : null}
    onDaily={async (on) => {
      if (!fs) return;
      await fs.writeText('world.md', withHeader(await fs.readText('world.md'), { daily: on ? true : undefined }));
      world = await loadWorld(fs);
    }}
    theme={phase === 'shelf' || !fs || !world || settingsWorldMd === null
      ? null
      : {
          worldMd: settingsWorldMd,
          preview: (spec, side) => (previewTheme = { spec, side }),
          done: () => (previewTheme = undefined),
          save: async (text) => {
            await fs!.writeText('world.md', text);
            settingsWorldMd = text;
            world = await loadWorld(fs!);
            previewTheme = undefined;
          },
        }}
    roomPicture={phase === 'shelf' || !fs || !world || !worldPicture
      ? null
      : {
          url: worldPicture,
          frame: world.roomFrame,
          set: async (frame) => {
            const text = withHeader(await fs!.readText('world.md'), { room_frame: writeFrame(frame) });
            await fs!.writeText('world.md', text);
            settingsWorldMd = text;
            world = await loadWorld(fs!);
          },
        }} />
{/if}

{#if unsaved}
  <Dialog
    title="Some writing is not saved"
    action="Close anyway"
    ready
    busy={false}
    problem=""
    onSubmit={() => {
      const go = unsaved!.anyway;
      unsaved = null;
      void go();
    }}
    onCancel={() => (unsaved = null)}>
    <p class="unsaved">A page could not be saved, so Immersion did not {unsaved.what}. The page says "Not saved" and why. Cancel to stay and keep your writing on screen, where it can be copied or saved once the cause is fixed.</p>
  </Dialog>
{/if}

<ContextMenu />

<style>
  .unsaved {
    margin: 0;
    line-height: 1.5;
  }
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
