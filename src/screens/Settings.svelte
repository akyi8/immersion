<script lang="ts">
  import { tumbling } from '../lib/table/tray.svelte';
  import { clearTroubles, troubleText, troubles } from '../lib/trouble';
  import { portal } from '../lib/portal';
  import { ui } from '../lib/ui.svelte';
  import { account } from '../lib/account.svelte';
  import { BOARD_FONTS, MODULES, newProfileId, profileLabel, type BoardFont, type Profile } from '../lib/you';
  import { zoom } from '../lib/zoom.svelte';
  import { quiet, spellingChoice } from '../lib/view.svelte';
  import { spell } from '../lib/spell';
  import Pick from './Pick.svelte';
  import ThemeEditor from './ThemeEditor.svelte';
  import FramePicture from './world/FramePicture.svelte';
  import type { Frame } from '../lib/index/frame';
  import type { Mode, ThemeSpec } from '../lib/theme';
  import { mode } from '../lib/mode.svelte';
  import { sync } from '../lib/sync.svelte';

  /**
   * Settings, as one page (Cerys, November 17). The groups name what a setting is for:
   * how the app looks, how the desk behaves, which modules show, and where files live.
   * Where a choice applies is a small tag beside its name. All worlds is kept in the
   * library's `immersion.md`, This world in the open world's `world.md`, and This
   * computer on this machine alone. Every setting is changed where it sits.
   */
  let {
    world = null,
    pictures = null,
    journal = null,
    onDaily,
    theme = null,
    roomPicture = null,
  }: {
    /** The open world, with the author details its `world.md` names, if any. */
    world?: { name: string; path: string; author: string; copyright: string } | null;
    /** How the open world shows its pictures, how many entries choose for themselves, and the ways to change both. */
    pictures?: { shape: 'portrait' | 'banner' | 'behind' | null; own: number; set: (shape: 'portrait' | 'banner' | 'behind' | null) => Promise<void>; follow: () => Promise<void> } | null;
    /** The open world's theme: the text of its `world.md`, and how to try a theme on the app and save it. */
    theme?: { worldMd: string; preview: (spec: ThemeSpec | null, side: Mode) => void; done: () => void; save: (text: string) => Promise<void> } | null;
    /** The open world's own picture as the Radiance room shows it, and how to frame it. */
    roomPicture?: { url: string; frame: Frame | null; set: (frame: Frame) => Promise<void> } | null;
    /** For Real World: whether it keeps a page for each day. */
    journal?: { daily: boolean } | null;
    onDaily?: (on: boolean) => Promise<void>;
  } = $props();

  // The record of errors kept on this computer, read when Settings opens.
  let log = $state(troubles());
  type Group = 'look' | 'theme' | 'work' | 'modules' | 'files';
  const GROUPS: [Group, string, string][] = [
    ['look', 'Look', 'How the app appears.'],
    ['theme', 'Theme', "This world's colors and fonts. The pages beside this one show them as you choose."],
    ['work', 'Writing and play', 'How the desk behaves while you work.'],
    ['modules', 'Modules', 'Which parts of the app you see, and how a world opens.'],
    ['files', 'Files', 'Where your worlds live and how they are kept safe.'],
  ];
  const group = $derived<Group>(ui.settings ?? 'look');
  const LAYOUTS: ['classic' | 'soft' | 'radiance', string, string][] = [
    ['classic', 'Classic', 'Ruled with fine lines, every edge drawn.'],
    ['soft', 'Soft', 'Space instead of lines, rounded paper on a desk, and things that settle gently into place.'],
    ['radiance', 'Radiance', "Soft, with a picture that belongs to the room, down its right edge: the world's, or the picture of the page you are in."],
  ];
  const SHAPES: ['category' | 'portrait' | 'banner' | 'behind', string][] = [
    ['category', 'By category'],
    ['portrait', 'Portrait'],
    ['banner', 'Banner'],
    ['behind', 'Behind'],
  ];

  /**
   * One setting: a short name, one sentence, and where the choice applies. `wide` puts its
   * control under the words, for the few that need the room.
   */
  type Where = 'This world' | 'All worlds' | 'This computer';
  type Row = { id: string; group: Group; name: string; tell: string; where: Where; wide?: boolean };

  let find = $state('');
  const need = $derived(find.trim().toLowerCase());

  // The Theme group is the theme editor itself. While it is open the page stands to one
  // side and the ground behind it clears, so the world's pages show the theme being chosen.
  const theming = $derived(!need && group === 'theme');
  let themeTurn = $state(0);
  $effect(() => {
    if (!theming) return;
    const done = theme?.done;
    return () => done?.();
  });

  let framing = $state(false);
  let framingBusy = $state(false);
  let framingProblem = $state('');

  const rows = $derived.by(() => {
    const layout = account.look.layout;
    const list: (Row | false | null | undefined)[] = [
      { id: 'mode', group: 'look', name: 'Light or dark', tell: 'Whether the app is light or dark.', where: 'This computer' },
      { id: 'layout', group: 'look', name: 'Layout', tell: LAYOUTS.find(([id]) => id === layout)?.[2] ?? '', where: 'All worlds' },
      layout === 'radiance' && world && roomPicture && { id: 'room', group: 'look', name: 'Room picture', tell: `How the picture of ${world.name} is framed down the right edge of the room. A page's own picture uses the framing it has for Behind.`, where: 'This world' },
      !!need && world && { id: 'theme', group: 'look', name: 'Theme', tell: `The colors and fonts of ${world.name}, on both its dark and its light side.`, where: 'This world' },
      layout !== 'classic' && { id: 'backdrop', group: 'look', name: 'Desk picture', tell: "The world's picture behind the desk, seen through frosted glass, so only its colors come through.", where: 'All worlds' },
      { id: 'size', group: 'look', name: 'Size', tell: 'Everything grows or shrinks together. Ctrl or Cmd with plus, minus, and zero do the same anywhere.', where: 'This computer' },
      world && pictures && {
        id: 'shape',
        group: 'look',
        name: 'Picture shape',
        tell:
          pictures.shape === null
            ? 'How every entry shows its picture. By category, people show a portrait and everything else shows a banner.'
            : pictures.shape === 'behind'
              ? 'How every entry shows its picture. Behind sets each page like a card, with its name up the spine over the picture.'
              : `How every entry shows its picture. Every entry shows a ${pictures.shape}.`,
        where: 'This world',
        wide: true,
      },
      { id: 'board-font', group: 'look', name: 'Board lettering', tell: 'The lettering on board cards. A condensed face fits more of an outline on each card.', where: 'All worlds' },
      { id: 'quiet', group: 'work', name: 'Quiet typing', tell: 'While you type, everything steps back in layers around the sentence you are writing. It all returns when the pointer moves.', where: 'This computer' },
      { id: 'spelling', group: 'work', name: 'Spelling', tell: `A misspelled word is set a little greyer, and a right click on it offers what it might have been. Your world's names are never marked. You have added ${account.words.length} ${account.words.length === 1 ? 'word' : 'words'} of your own. ${spell.status === 'failed' ? `The dictionary could not be read (${spell.problem}).` : spell.status === 'starting' ? 'The dictionary is read the first time a page with writing opens.' : 'The dictionary is loaded.'}`, where: 'This computer' },
      world && journal && { id: 'daily', group: 'work', name: 'Daily pages', tell: 'Keeps a page for each day and adds a Today button to the journal. Days you skip simply do not exist, and nothing reminds you.', where: 'This world' },
      { id: 'dice', group: 'work', name: 'Tumbling dice', tell: "Dice rolled in the Table module are thrown across the screen in the world's color. With this off, a roll shows its numbers at once.", where: 'This computer' },
      { id: 'profiles', group: 'work', name: 'Author profiles', tell: 'The name and copyright holder a title page shows. Changing a profile changes every book that uses it.', where: 'All worlds', wide: true },
      { id: 'modules', group: 'modules', name: 'Modules shown', tell: 'The modules along the top. Turn off the ones you do not use.', where: 'All worlds', wide: true },
      { id: 'enter', group: 'modules', name: 'Enter on its own', tell: "A world's picture holds for a breath and then the world opens. With this off, it waits for your click.", where: 'All worlds' },
      { id: 'library', group: 'files', name: 'Library folder', tell: 'The folder that holds your worlds and your author profiles. Every computer that uses the same folder shows the same worlds.', where: 'This computer', wide: true },
      world && { id: 'folder', group: 'files', name: 'World folder', tell: `Where ${world.name} is kept.`, where: 'This world', wide: true },
      !!info?.path && {
        id: 'sync',
        group: 'files',
        name: 'Sync',
        tell: info.isGit
          ? "Pulls when a world opens and every ten minutes, and commits and pushes a few minutes after you stop typing and when you close the world. It only ever commits the world's own folder and your immersion.md."
          : 'This library is not a Git repository, so it syncs however its folder does, such as through Dropbox.',
        where: 'This computer',
        wide: !!world,
      },
      { id: 'trouble', group: 'files', name: 'Trouble record', tell: `A short record of errors, such as a key that changed nothing. It stays on this computer unless you copy it. ${log.length ? `It holds ${log.length} ${log.length === 1 ? 'note' : 'notes'}.` : 'It is empty.'}`, where: 'This computer', wide: log.length > 0 },
    ];
    return list.filter((r): r is Row => !!r);
  });

  const shown = $derived(need ? rows.filter((r) => `${r.name} ${r.tell} ${r.where}`.toLowerCase().includes(need)) : rows.filter((r) => r.group === group));
  const heading = $derived(GROUPS.find(([id]) => id === group)!);
  const info = $derived(account.info);
  let problem = $state('');
  let busy = $state(false);
  let following = $state(false);

  async function run(work: () => Promise<void>) {
    problem = '';
    busy = true;
    try {
      await work();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // Profiles are edited in place, and each one saves when its fields lose focus.
  let editing = $state<Profile[]>([]);
  $effect(() => {
    editing = account.profiles.map((p) => ({ ...p }));
  });
  const saveAll = () => run(() => account.saveProfiles(editing));
  function addProfile(author = '', copyright = '') {
    editing = [...editing, { id: newProfileId(author || 'profile', editing), author, copyright }];
    if (author) void saveAll();
  }
  let removing = $state<Profile | null>(null);

  // A world's author details from before profiles existed can become the first profile, once.
  const offered = $derived(
    world && world.author && !account.profiles.some((p) => p.author === world!.author && p.copyright === world!.copyright) ? world : null,
  );

  async function chooseLibrary() {
    const lib = account.library;
    if (!lib) return;
    const path = await lib.pickFolder('Choose your library: the folder that holds your worlds', info?.path);
    if (!path) return;
    await run(async () => {
      await lib.setLibrary(path);
      await account.refresh();
    });
  }

  let copied = $state(false);
  async function copyLog() {
    try {
      await navigator.clipboard.writeText(troubleText());
      copied = true;
    } catch {
      // Where copying is refused, the text below can be selected and copied by hand.
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !removing && !framing && (e.preventDefault(), (ui.settings = null))} />

{#snippet flip(on: boolean, set: (on: boolean) => void, name: string, disabled = false)}
  <button type="button" class="switch" role="switch" aria-checked={on} aria-label={name} {disabled} onclick={() => set(!on)}></button>
{/snippet}

{#snippet control(id: string)}
  {#if id === 'mode'}
    <Pick label="Light or dark" value={mode.choice} onpick={(v) => mode.set(v)} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'Match computer']] as const} />
  {:else if id === 'layout'}
    <Pick label="Layout" value={account.look.layout} onpick={(layout) => run(() => account.saveLook({ ...account.look, layout }))} options={LAYOUTS} />
  {:else if id === 'theme'}
    <button type="button" onclick={() => ((find = ''), (ui.settings = 'theme'))}>Open</button>
  {:else if id === 'room'}
    <button type="button" onclick={() => ((framingProblem = ''), (framing = true))}>Frame…</button>
  {:else if id === 'backdrop'}
    {@render flip(account.look.backdrop, (backdrop) => run(() => account.saveLook({ ...account.look, backdrop })), 'Desk picture')}
  {:else if id === 'size'}
    <div class="line zoom">
      <button type="button" aria-label="Smaller" onclick={() => zoom.step(-1)}>−</button>
      <span class="zoom-level">{Math.round(zoom.level * 100)}%</span>
      <button type="button" aria-label="Larger" onclick={() => zoom.step(1)}>+</button>
      <button type="button" class="quiet" onclick={() => zoom.set(1)} disabled={zoom.level === 1}>Reset</button>
    </div>
  {:else if id === 'shape' && pictures}
    <Pick label="How pictures show" value={(pictures.shape ?? 'category') as (typeof SHAPES)[number][0]} disabled={busy} onpick={(v) => run(() => pictures!.set(v === 'category' ? null : v))} options={SHAPES} />
    {#if pictures.own > 0}
      <p class="hint">
        {pictures.own} {pictures.own === 1 ? 'entry has' : 'entries have'} a choice of {pictures.own === 1 ? 'its' : 'their'} own, made from the page's view menu, and {pictures.own === 1 ? 'keeps' : 'keep'} it.
      </p>
      {#if following}
        <div class="line">
          <button type="button" disabled={busy} onclick={() => run(async () => { await pictures!.follow(); following = false; })}>Yes, change {pictures.own} {pictures.own === 1 ? 'entry' : 'entries'}</button>
          <button type="button" class="quiet" onclick={() => (following = false)}>Cancel</button>
        </div>
      {:else}
        <button type="button" onclick={() => (following = true)}>Make {pictures.own === 1 ? 'it' : 'them all'} follow the world</button>
      {/if}
    {/if}
  {:else if id === 'board-font'}
    <select class="board-font" aria-label="Board lettering" value={account.look.boardFont} style:font-family={BOARD_FONTS.find(([f]) => f === account.look.boardFont)?.[2] || null} onchange={(e) => run(() => account.saveLook({ ...account.look, boardFont: (e.currentTarget as HTMLSelectElement).value as BoardFont }))}>
      {#each BOARD_FONTS as [f, name, face]}<option value={f} style:font-family={face || null}>{name}</option>{/each}
    </select>
  {:else if id === 'quiet'}
    {@render flip(quiet.on, (on) => quiet.set(on), 'Quiet typing')}
  {:else if id === 'spelling'}
    {@render flip(spellingChoice.on, (on) => spellingChoice.set(on), 'Spelling')}
  {:else if id === 'daily' && journal}
    {@render flip(journal.daily, (on) => run(async () => onDaily?.(on)), 'Daily pages')}
  {:else if id === 'dice'}
    {@render flip(tumbling.on, (on) => tumbling.set(on), 'Tumbling dice')}
  {:else if id === 'profiles'}
    {#if !info?.path}
      <p class="hint">Author profiles live in your library, so every computer has them. Choose your library first.</p>
      <button type="button" class="primary" onclick={() => ((find = ''), (ui.settings = 'files'))}>Choose a library</button>
    {:else}
      {#if offered}
        <div class="offer">
          <p>{offered.name} names <strong>{offered.author}</strong>{offered.copyright ? `, © ${offered.copyright}` : ''} as its author. Make it a profile?</p>
          <button type="button" class="primary" disabled={busy} onclick={() => addProfile(offered.author, offered.copyright)}>Make it a profile</button>
        </div>
      {/if}
      {#each editing as p, i (p.id)}
        <div class="profile">
          <div class="fields">
            <label class="label" for="author-{p.id}">Author</label>
            <input id="author-{p.id}" type="text" bind:value={editing[i].author} onblur={saveAll} autocomplete="off" placeholder="The name on the cover" />
            <label class="label" for="copyright-{p.id}">Copyright holder</label>
            <input id="copyright-{p.id}" type="text" bind:value={editing[i].copyright} onblur={saveAll} autocomplete="off" placeholder="Often your legal name" />
          </div>
          <button type="button" class="quiet" onclick={() => (removing = p)}>Delete</button>
        </div>
      {:else}
        <p class="hint">No profiles yet.</p>
      {/each}
      <button type="button" class="add" onclick={() => addProfile()}>+ New author profile</button>
    {/if}
  {:else if id === 'modules'}
    <div class="modules">
      {#each MODULES as [m, name, about]}
        {@const on = account.look.modules.includes(m)}
        <div class="module">
          <span><strong>{name}</strong> <span class="about">{about}</span></span>
          {@render flip(
            on,
            (want) => {
              const modules = MODULES.map(([x]) => x).filter((x) => (x === m ? want : account.look.modules.includes(x)));
              run(() => account.saveLook({ ...account.look, modules }));
            },
            name,
            on && account.look.modules.length === 1,
          )}
        </div>
      {/each}
    </div>
  {:else if id === 'enter'}
    {@render flip(account.look.autoEnter, (autoEnter) => run(() => account.saveLook({ ...account.look, autoEnter })), 'Enter on its own')}
  {:else if id === 'library'}
    {#if info?.path}
      <p class="path">{info.path}</p>
      <button type="button" onclick={chooseLibrary} disabled={busy}>Choose another folder…</button>
    {:else}
      <button type="button" class="primary" onclick={chooseLibrary} disabled={busy}>Choose a folder…</button>
    {/if}
  {:else if id === 'folder' && world}
    <p class="path">{world.path}</p>
  {:else if id === 'sync' && info}
    {#if info.isGit}
      <div class="line">
        {@render flip(
          info.gitSync,
          (on) =>
            run(async () => {
              await account.library?.setGitSync(on);
              await account.refresh();
              sync.retry();
            }),
          'Sync with Git on its own',
        )}
        {#if world && sync.state !== 'idle' && sync.state !== 'not-git'}
          <span class="state" class:problem={sync.state === 'problem'}>
            {#if sync.state === 'syncing'}Syncing now.
            {:else if sync.state === 'synced'}Synced{sync.at ? ` at ${new Date(sync.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}.
            {:else if sync.state === 'off'}Syncing is off on this computer.
            {:else}{sync.message}{/if}
          </span>
          {#if info.gitSync}<button type="button" onclick={() => sync.now()} disabled={sync.state === 'syncing'}>Sync now</button>{/if}
        {/if}
      </div>
    {/if}
  {:else if id === 'trouble'}
    {#if log.length}
      <div class="line">
        <button type="button" onclick={copyLog}>{copied ? 'Copied' : 'Copy the record'}</button>
        <button type="button" onclick={() => (clearTroubles(), (log = []))}>Clear it</button>
      </div>
      <textarea class="trouble" readonly rows="6" aria-label="The record of errors">{troubleText()}</textarea>
    {/if}
  {/if}
{/snippet}

<div class="backdrop" class:clear={theming} role="presentation" onclick={() => (ui.settings = null)} use:portal></div>
<div class="settings" class:beside={theming} role="dialog" aria-label="Settings" use:portal>
  <nav aria-label="Settings groups">
    <h2>Settings</h2>
    <input class="find" type="search" placeholder="Find a setting" aria-label="Find a setting" bind:value={find} autocomplete="off" />
    {#each GROUPS as [id, name]}
      <button type="button" class:on={!need && group === id} aria-current={!need && group === id ? 'page' : undefined} onclick={() => ((find = ''), (ui.settings = id))}>{name}</button>
    {/each}
  </nav>
  <div class="body">
    <button type="button" class="close" aria-label="Close settings" onclick={() => (ui.settings = null)}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
    <h3>{need ? 'Found' : heading[1]}</h3>
    <p class="lead">{need ? (shown.length ? 'From every group.' : 'No setting has those words.') : heading[2]}</p>
    {#if theming && theme && world}
      {#key themeTurn}
        <ThemeEditor embedded worldMd={theme.worldMd} worldName={world.name} onPreview={theme.preview} onSave={theme.save} onCancel={() => (theme.done(), themeTurn++)} />
      {/key}
    {:else if theming}
      <p class="hint">Open a world to change its theme.</p>
    {/if}
    {#each theming ? [] : shown as r (r.id)}
      <div class="row" class:wide={r.wide}>
        <div class="say">
          <div class="name">{r.name}<span class="tag">{r.where}</span></div>
          <p class="hint">{r.tell}</p>
        </div>
        <div class="control">{@render control(r.id)}</div>
      </div>
    {/each}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  </div>
</div>

{#if framing && roomPicture}
  <FramePicture
    roomOnly
    url={roomPicture.url}
    category=""
    shape="behind"
    portrait={null}
    banner={null}
    behind={roomPicture.frame}
    busy={framingBusy}
    problem={framingProblem}
    onSave={async (result) => {
      framingBusy = true;
      try {
        await roomPicture!.set(result.behind);
        framing = false;
      } catch (e) {
        framingProblem = e instanceof Error ? e.message : String(e);
      } finally {
        framingBusy = false;
      }
    }}
    onCancel={() => (framing = false)} />
{/if}

{#if removing}
  <div class="backdrop top" role="presentation" onclick={() => (removing = null)} use:portal></div>
  <div class="confirm" role="alertdialog" aria-label="Delete profile" use:portal>
    <p>Delete <strong>{profileLabel(removing)}</strong>? Books linked to it will show no author until you choose another profile for them.</p>
    <div class="line">
      <button type="button" onclick={() => (removing = null)}>Keep it</button>
      <button
        type="button"
        class="danger"
        onclick={() => {
          const id = removing!.id;
          removing = null;
          editing = editing.filter((p) => p.id !== id);
          void saveAll();
        }}>Delete</button>
    </div>
  </div>
{/if}

<style>
  .trouble {
    width: 100%;
    box-sizing: border-box;
    font: 12px/1.4 ui-monospace, monospace;
    color: var(--text-soft);
    background: var(--well, var(--bg));
    border: 1px solid var(--rule-strong, var(--edge));
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 20;
  }
  .backdrop.clear {
    background: none;
  }
  .backdrop.top {
    z-index: 22;
  }
  /* One page: the groups down the left, the chosen group's settings on the right. */
  .settings {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(920px, calc(100vw - 32px));
    height: min(760px, calc(100vh - 48px));
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round-box, var(--round));
    overflow: hidden;
    z-index: 21;
  }
  /* Beside the pages, so they show a theme while it is chosen. */
  .settings.beside {
    left: auto;
    right: 16px;
    transform: translateY(-50%);
    width: min(640px, calc(100vw - 32px));
    grid-template-columns: 170px minmax(0, 1fr);
    box-shadow: var(--lift, 0 12px 40px var(--shadow));
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 22px 12px;
    border-right: 1px solid var(--line);
    overflow-y: auto;
  }
  h2 {
    margin: 0 8px 12px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(30px * var(--type));
    letter-spacing: 0.02em;
    color: var(--title);
  }
  .find {
    margin: 0 0 10px;
    font: inherit;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 7px 10px;
    min-width: 0;
  }
  nav button {
    text-align: left;
    min-height: 28px;
    padding: 4px 10px;
    color: var(--text);
    background: none;
    border-color: transparent;
  }
  nav button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .body {
    position: relative;
    overflow-y: auto;
    padding: 24px 30px 40px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(24px * var(--type));
    color: var(--title);
  }
  .close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 0;
  }
  .lead {
    margin: 2px 0 10px;
    color: var(--muted);
  }
  /* A setting: its words on the left and its control on the right, or under them when it needs the room. */
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 24px;
    padding: 16px 0;
    border-top: 1px solid var(--line);
  }
  .say {
    flex: 1 1 260px;
    min-width: 0;
  }
  .name {
    font-weight: 700;
    color: var(--text);
  }
  .tag {
    margin-left: 10px;
    font-family: var(--font-label);
    font-size: calc(10.5px * var(--type));
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .control {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    max-width: 100%;
  }
  .row.wide .say,
  .row.wide .control {
    flex: 1 1 100%;
  }
  .row.wide .control {
    align-items: flex-start;
  }
  .hint {
    margin: 2px 0 0;
    font-size: calc(13px * var(--type));
    line-height: 1.5;
    color: var(--muted);
    max-width: 62ch;
  }
  .path {
    margin: 0;
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--text-soft);
    word-break: break-all;
  }
  button {
    font-size: calc(14px * var(--type));
    padding: 6px 14px;
    min-height: 34px;
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  button:hover {
    border-color: var(--hover-edge);
  }
  /* On or off. The knob slides to the right and the track fills when it is on. */
  .switch {
    position: relative;
    flex: none;
    width: 42px;
    min-height: 0;
    height: 24px;
    padding: 0;
    background: color-mix(in oklab, var(--text) 12%, transparent);
    border: 1px solid var(--edge);
    border-radius: 999px !important;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--muted);
    transition: left 0.12s;
  }
  .switch[aria-checked='true'] {
    background: var(--structure);
    border-color: var(--structure);
  }
  .switch[aria-checked='true']::after {
    left: 20px;
    background: var(--bg);
  }
  .switch:disabled {
    opacity: 0.5;
  }
  .primary {
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  .add {
    color: var(--structure);
    border-style: dashed;
  }
  .quiet {
    font-size: calc(12px * var(--type));
    color: var(--muted);
    border-color: transparent;
  }
  .profile {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 0 12px;
  }
  .fields {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fields .label {
    font-size: calc(11px * var(--type));
  }
  input[type='text'] {
    font-size: calc(15px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 10px;
  }
  .offer {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    border: 1px solid var(--callout-edge);
    border-radius: var(--round-box);
    background: var(--bg);
  }
  .offer p {
    margin: 0 0 10px;
  }
  .state {
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    white-space: pre-wrap;
  }
  .state.problem {
    color: var(--danger);
  }
  .modules {
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  .module {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 0;
  }
  .module .about {
    color: var(--muted);
    font-size: calc(13px * var(--type));
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .problem {
    color: var(--danger);
  }
  .confirm {
    position: fixed;
    top: 30vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(440px, calc(100vw - 32px));
    padding: 22px;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    z-index: 23;
  }
  .confirm p {
    margin: 0 0 14px;
    line-height: 1.5;
  }
  .zoom button {
    min-width: 36px;
  }
  .zoom-level {
    min-width: 48px;
    text-align: center;
    font-family: var(--font-label);
    font-size: calc(13px * var(--type));
  }
  .board-font {
    font: inherit;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 7px 10px;
  }
  @media (max-width: 700px) {
    .settings {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }
    nav {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      padding: 14px 52px 10px 14px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
    h2 {
      margin: 0 8px 0 4px;
      font-size: calc(22px * var(--type));
    }
    .find {
      flex: 1 1 140px;
      margin: 0;
    }
    .body {
      padding: 16px 16px 32px;
    }
    .close {
      position: fixed;
      top: 8px;
      right: 8px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .switch::after {
      transition: none;
    }
  }
</style>
