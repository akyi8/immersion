<script lang="ts">
  import { portal } from '../lib/portal';
  import { ui } from '../lib/ui.svelte';
  import { account } from '../lib/account.svelte';
  import { newProfileId, profileLabel, type Profile } from '../lib/you';
  import ModeToggle from './ModeToggle.svelte';
  import { sync } from '../lib/sync.svelte';

  /**
   * Settings (Mike, October 26), at three levels. You holds what follows the writer to
   * every computer, kept in the library's `immersion.md`. This world holds what the
   * open world's `world.md` says. This computer holds what only this machine needs to
   * know: where the library is, whether it syncs, and light or dark.
   */
  let {
    world = null,
    onTheme,
  }: {
    /** The open world, with the author details its `world.md` names, if any. */
    world?: { name: string; path: string; author: string; copyright: string } | null;
    /** Opens the open world's theme panel. */
    onTheme?: () => void;
  } = $props();

  const TABS: ['you' | 'world' | 'computer', string][] = [
    ['you', 'You'],
    ['world', 'This world'],
    ['computer', 'This computer'],
  ];
  const tab = $derived(ui.settings ?? 'you');
  const info = $derived(account.info);
  let problem = $state('');
  let busy = $state(false);

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
    const path = await lib.pickFolder('Choose your library: the folder that holds your worlds');
    if (!path) return;
    await run(async () => {
      await lib.setLibrary(path);
      await account.refresh();
    });
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !removing && (ui.settings = null)} />

<div class="backdrop" role="presentation" onclick={() => (ui.settings = null)} use:portal></div>
<section class="settings" aria-label="Settings" use:portal>
  <header>
    <h2>Settings</h2>
    <button type="button" class="close" aria-label="Close settings" onclick={() => (ui.settings = null)}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
  </header>
  <div class="tabs" role="tablist" aria-label="Settings">
    {#each TABS as [id, label]}
      <button type="button" role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (ui.settings = id)}>{label}</button>
    {/each}
  </div>

  <div class="body" role="tabpanel">
    {#if tab === 'you'}
      <p class="lead">What follows you to every computer, kept in <code>immersion.md</code> in your library.</p>
      {#if !info?.path}
        <p>Author profiles live in your library, so every computer has them. Choose your library first.</p>
        <button type="button" class="primary" onclick={() => (ui.settings = 'computer')}>Choose a library</button>
      {:else}
        <h3 class="label">Author profiles</h3>
        <p class="hint">A title page links to a profile, so changing a profile here changes every book that uses it.</p>
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
        <button type="button" class="add" onclick={() => addProfile()}>+ Author profile</button>
      {/if}
    {:else if tab === 'world'}
      {#if world}
        <p class="lead">What <strong>{world.name}</strong> says about itself, kept in its <code>world.md</code>.</p>
        <h3 class="label">Theme</h3>
        <p class="hint">Its colors and fonts, on both the dark and the light side.</p>
        <button type="button" onclick={() => ((ui.settings = null), onTheme?.())}>Change the theme…</button>
        <h3 class="label">Folder</h3>
        <p class="path">{world.path}</p>
      {:else}
        <p class="lead">Open a world to change its settings.</p>
      {/if}
    {:else}
      <p class="lead">What only this computer needs to know.</p>
      <h3 class="label">Library</h3>
      {#if info?.path}
        <p class="path">{info.path}</p>
        <div class="row">
          <button type="button" onclick={chooseLibrary} disabled={busy}>Choose another folder…</button>
        </div>
      {:else}
        <p class="hint">The folder that holds your worlds and your author profiles. Every computer that uses the same folder shows the same worlds.</p>
        <button type="button" class="primary" onclick={chooseLibrary} disabled={busy}>Choose a folder…</button>
      {/if}
      {#if info?.path}
        <h3 class="label">Sync</h3>
        {#if info.isGit}
          <label class="check">
            <input
              type="checkbox"
              checked={info.gitSync}
              onchange={(e) =>
                run(async () => {
                  await account.library?.setGitSync((e.currentTarget as HTMLInputElement).checked);
                  await account.refresh();
                  sync.retry();
                })} />
            Sync with Git on its own
          </label>
          <p class="hint">Pulls when a world opens and every ten minutes, and commits and pushes a few minutes after you stop typing and when you close the world. It only ever commits the world's own folder.</p>
          {#if world && sync.state !== 'idle' && sync.state !== 'not-git'}
            <div class="status {sync.state}">
              <p>
                {#if sync.state === 'syncing'}Syncing now.
                {:else if sync.state === 'synced'}Synced{sync.at ? ` at ${new Date(sync.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}.
                {:else if sync.state === 'off'}Syncing is off on this computer.
                {:else}{sync.message}{/if}
              </p>
              {#if info.gitSync}<button type="button" onclick={() => sync.now()} disabled={sync.state === 'syncing'}>Sync now</button>{/if}
            </div>
          {/if}
        {:else}
          <p class="hint">This library is not a Git repository, so it syncs however its folder does, such as through Dropbox.</p>
        {/if}
      {/if}
      <h3 class="label">Light or dark</h3>
      <ModeToggle />
    {/if}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  </div>
</section>

{#if removing}
  <div class="backdrop top" role="presentation" onclick={() => (removing = null)} use:portal></div>
  <div class="confirm" role="alertdialog" aria-label="Delete profile" use:portal>
    <p>Delete <strong>{profileLabel(removing)}</strong>? Books linked to it will show no author until you choose another profile for them.</p>
    <div class="row">
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
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 20;
  }
  .backdrop.top {
    z-index: 22;
  }
  .settings {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(520px, 100vw);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-left: 1px solid var(--rule-strong);
    z-index: 21;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 22px 26px 8px;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 38px;
    letter-spacing: 0.02em;
    color: var(--title);
  }
  .close {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 0;
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 8px 26px 0;
    border-bottom: 1px solid var(--rule);
  }
  .tabs button {
    font-size: 14px;
    color: var(--muted);
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 10px 12px;
  }
  .tabs button.on {
    color: var(--selected-fg);
    border-bottom-color: var(--selected-border);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 18px 26px 40px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .body > * {
    max-width: 100%;
  }
  .lead {
    margin: 0 0 8px;
    color: var(--text-soft);
  }
  h3.label {
    margin: 18px 0 0;
    font-size: 11px;
  }
  .hint {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
  }
  .path {
    margin: 0;
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--text-soft);
    word-break: break-all;
  }
  button {
    font-size: 14px;
    padding: 8px 14px;
    min-height: 38px;
    color: var(--text);
    background: none;
    border: 1px solid var(--rule-strong);
  }
  button:hover {
    border-color: var(--structure);
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
    font-size: 12px;
    color: var(--muted);
    border-color: transparent;
  }
  .profile {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 0 14px;
    border-bottom: 1px solid var(--rule);
  }
  .fields {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fields .label {
    font-size: 11px;
  }
  input[type='text'] {
    font-size: 15px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--rule-strong);
    padding: 8px 10px;
  }
  .offer {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    border: 1px solid var(--structure);
    background: var(--bg);
  }
  .offer p {
    margin: 0 0 10px;
  }
  .status {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid var(--rule-strong);
    background: var(--bg);
  }
  .status p {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-soft);
    white-space: pre-wrap;
  }
  .status.problem {
    border-color: var(--danger);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row {
    display: flex;
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
    border: 1px solid var(--rule-strong);
    z-index: 23;
  }
  .confirm p {
    margin: 0 0 14px;
    line-height: 1.5;
  }
  code {
    font-family: var(--font-label);
    font-size: 0.9em;
  }
</style>
