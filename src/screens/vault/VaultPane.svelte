<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { account } from '../../lib/account.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { vault, type Story } from '../../lib/vault/vault.svelte';
  import { pictureData } from '../../lib/vault/picture';
  import EntryEditor from '../world/EntryEditor.svelte';

  /**
   * A world's vault (Mike, October 26): stories kept under a passphrase, each with an
   * optional picture. Nothing in it reaches the disk unencrypted, and it never opens in
   * a reading window. Names in an open story link to the wiki like anywhere else.
   */
  let {
    world,
    worldName,
    index,
    onOpen,
    worlds = [],
    daily = false,
  }: {
    /** The folder of the world whose vault this is. */
    world: string;
    worldName: string;
    index: WikiIndex;
    onOpen: (id: string) => void;
    /** Other worlds whose vaults can be looked into from here, for the journal. */
    worlds?: { path: string; name: string }[];
    /** Whether the journal keeps a page for each day, with a Today button. */
    daily?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  let showing = $state(world);
  const showingName = $derived(worlds.find((w) => w.path === showing)?.name ?? worldName);

  let pass = $state('');
  let again = $state('');
  let remember = $state(false);
  let problem = $state('');
  let busy = $state(false);

  let stories = $state<Story[]>([]);
  let current = $state<Story | null>(null);
  let archiving = $state(false);

  async function load() {
    if (!vault.open) return;
    try {
      stories = await vault.stories(showing);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(async () => {
    if (!vault.open && vault.ready) await vault.unlockRemembered().catch(() => false);
  });

  $effect(() => {
    void showing;
    if (vault.open) load();
    else {
      stories = [];
      current = null;
    }
  });

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

  const create = () =>
    run(async () => {
      if (pass.length < 8) throw new Error('A passphrase needs at least eight characters. A few words together are easier to remember than a jumble.');
      if (pass !== again) throw new Error('The two passphrases are not the same.');
      await vault.create(pass, remember);
      pass = again = '';
    });

  const unlock = () =>
    run(async () => {
      if (!(await vault.unlock(pass, remember))) throw new Error('That is not the passphrase.');
      pass = '';
    });

  // Today's page, found or begun. Only the days that were written have pages.
  const today = () =>
    run(async () => {
      const title = new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const found = (await vault.stories(showing)).find((s) => s.entry.title === title);
      current = found ?? (await vault.newStory(showing, title));
      await load();
    });

  const newStory = () =>
    run(async () => {
      current = await vault.newStory(showing, 'Untitled');
      await load();
    });

  // The editor reads and writes the open story through this, so it works as it does for any page.
  const storyFs = $derived.by(() => {
    const story = current;
    if (!story) return null;
    return {
      readText: async () => (await vault.read(showing, story.name)).text,
      writeText: async (_id: string, text: string) => {
        const entry = { ...story.entry, text, modified: Date.now() };
        story.entry = entry;
        await vault.save(showing, story.name, entry);
      },
      onChange: () => () => {},
    } as unknown as WorldFs;
  });

  const setPicture = () =>
    run(async () => {
      const story = current;
      const lib = account.library;
      if (!story || !lib) return;
      const image = await lib.pickImage();
      if (!image) return;
      const picture = await pictureData(await lib.readPicture(image));
      story.entry = { ...story.entry, picture, modified: Date.now() };
      current = { ...story };
      await vault.save(showing, story.name, story.entry);
    });

  // The title is its own field, kept inside the encrypted story with everything else.
  const setTitle = (value: string) =>
    run(async () => {
      const story = current;
      const title = value.trim() || 'Untitled';
      if (!story || title === story.entry.title) return;
      story.entry = { ...story.entry, title, modified: Date.now() };
      current = { ...story };
      await vault.save(showing, story.name, story.entry);
    });

  const removePicture = () =>
    run(async () => {
      const story = current;
      if (!story) return;
      story.entry = { ...story.entry, picture: null, modified: Date.now() };
      current = { ...story };
      await vault.save(showing, story.name, story.entry);
    });

  const archive = () =>
    run(async () => {
      if (!current) return;
      await vault.archive(showing, current.name);
      archiving = false;
      current = null;
      await load();
    });

  const day = (ms: number) => new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
</script>

<article class="vault" onpointerdown={() => vault.touch()}>
  <header>
    <div class="label">Vault · {showingName}</div>
    {#if vault.open}
      <div class="row">
        {#if current}
          <button type="button" class="quiet" onclick={async () => ((current = null), await load())}>← All stories</button>
        {/if}
        {#if worlds.length}
          <label class="sr" for="vault-world">Whose vault</label>
          <select id="vault-world" bind:value={showing} onchange={() => (current = null)}>
            <option value={world}>{worldName}</option>
            {#each worlds.filter((w) => w.path !== world) as w (w.path)}<option value={w.path}>{w.name}</option>{/each}
          </select>
        {/if}
        <button type="button" class="lock" onclick={() => vault.lock()} title="Lock the vault (Ctrl or Cmd, Shift, L)">Lock</button>
      </div>
    {/if}
  </header>

  {#if !account.info?.path}
    <p class="lead">Your vault lives in your library, so every computer you write on has it.</p>
    <button type="button" class="primary" onclick={() => (ui.settings = 'computer')}>Choose a library</button>
  {:else if !vault.ready}
    <form
      class="gate"
      onsubmit={(e) => {
        e.preventDefault();
        create();
      }}>
      <h2>Choose a passphrase</h2>
      <p>One passphrase opens the vault of every world. Stories are encrypted with it before they touch the disk, so Git, Obsidian, and anyone browsing your files see only scrambled text.</p>
      <p class="warn">Nobody can recover a forgotten passphrase, including Immersion. If it is lost, the stories are lost with it.</p>
      <label class="label" for="vault-pass">Passphrase</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="vault-pass" type="password" bind:value={pass} autocomplete="new-password" autofocus />
      <label class="label" for="vault-again">The same again</label>
      <input id="vault-again" type="password" bind:value={again} autocomplete="new-password" />
      <label class="check"><input type="checkbox" bind:checked={remember} /> Remember on this computer</label>
      <button type="submit" class="primary" disabled={busy || !pass}>{busy ? 'Working…' : 'Make the vault'}</button>
    </form>
  {:else if !vault.open}
    <form
      class="gate"
      onsubmit={(e) => {
        e.preventDefault();
        unlock();
      }}>
      <h2>Locked</h2>
      <label class="label" for="vault-pass">Passphrase</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="vault-pass" type="password" bind:value={pass} autocomplete="current-password" autofocus />
      <label class="check"><input type="checkbox" bind:checked={remember} /> Remember on this computer</label>
      <button type="submit" class="primary" disabled={busy || !pass}>{busy ? 'Opening…' : 'Open'}</button>
    </form>
  {:else if current && storyFs}
    <div class="story">
      <input
        class="title-field"
        type="text"
        aria-label="Title"
        value={current.entry.title}
        autocomplete="off"
        onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        onblur={(e) => setTitle((e.currentTarget as HTMLInputElement).value)} />
      <div class="picture">
        {#if current.entry.picture}<img src={current.entry.picture} alt="" />{/if}
        <div class="tools">
          <button type="button" class="quiet" onclick={setPicture} disabled={busy}>{current.entry.picture ? 'Change picture' : 'Add a picture'}</button>
          {#if current.entry.picture}<button type="button" class="quiet" onclick={removePicture}>Remove picture</button>{/if}
          <button type="button" class="quiet" onclick={() => (archiving = true)}>Archive</button>
        </div>
      </div>
      {#if archiving}
        <div class="confirm">
          <p>Move “{current.entry.title}” into the vault's archive? It stays encrypted, out of this list.</p>
          <button type="button" onclick={() => (archiving = false)}>Keep it here</button>
          <button type="button" class="primary" onclick={archive}>Archive</button>
        </div>
      {/if}
      {#key current.name}
        <EntryEditor fs={storyFs} {index} id={`vault:${current.name}`} title="" {onOpen} next={null} />
      {/key}
    </div>
  {:else}
    <div class="list">
      <div class="row">
        {#if daily && showing === world}<button type="button" class="primary" onclick={today} disabled={busy}>Today</button>{/if}
        <button type="button" class="add" onclick={newStory} disabled={busy}>+ Story</button>
      </div>
      {#each stories as s (s.name)}
        <button type="button" class="item" onclick={() => (current = s)}>
          {#if s.entry.picture}<img src={s.entry.picture} alt="" />{:else}<span class="blank" aria-hidden="true"></span>{/if}
          <span class="words"><span class="title">{s.entry.title}</span><span class="date">{day(s.entry.created)}</span></span>
        </button>
      {:else}
        <p class="lead">Nothing here yet.</p>
      {/each}
    </div>
  {/if}
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
</article>

<style>
  .vault {
    max-width: 760px;
  }
  header {
    margin-bottom: 18px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  select,
  input[type='password'] {
    font: inherit;
    font-size: 15px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--rule-strong);
    padding: 8px 10px;
  }
  button {
    font-size: 14px;
    padding: 8px 14px;
    min-height: 38px;
    color: var(--text);
    background: none;
    border: 1px solid var(--rule-strong);
  }
  .primary {
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
  }
  .quiet {
    font-size: 13px;
    color: var(--structure);
    border-color: transparent;
    padding: 6px 8px;
  }
  .lock {
    margin-left: auto;
  }
  .gate {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 440px;
  }
  .gate h2 {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 40px;
    color: var(--title);
  }
  .gate p {
    margin: 0;
    line-height: 1.55;
    color: var(--text-soft);
  }
  .gate .warn {
    color: var(--text);
  }
  .gate .label {
    margin-top: 6px;
    font-size: 11px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0 4px;
    color: var(--text-soft);
  }
  .gate .primary {
    align-self: flex-start;
  }
  .lead {
    color: var(--text-soft);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .add {
    align-self: flex-start;
    color: var(--structure);
    border-style: dashed;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 14px;
    text-align: left;
    padding: 8px;
    border: 1px solid var(--rule);
  }
  .item:hover {
    border-color: var(--structure);
  }
  .item img,
  .blank {
    width: 64px;
    height: 64px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--surface);
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    font-size: 17px;
  }
  .date {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--muted);
  }
  .title-field {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 14px;
    font-family: var(--font-display);
    font-size: 48px;
    letter-spacing: 0.02em;
    line-height: 1.1;
    color: var(--title);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 0;
  }
  .title-field:focus {
    outline: none;
    border-bottom-color: var(--rule-strong);
  }
  .picture img {
    display: block;
    max-width: 100%;
    max-height: 420px;
    object-fit: contain;
    margin-bottom: 6px;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 10px;
  }
  .confirm {
    padding: 12px;
    margin-bottom: 12px;
    border: 1px solid var(--rule-strong);
    background: var(--surface);
  }
  .confirm p {
    margin: 0 0 10px;
  }
  .problem {
    color: var(--danger);
  }
</style>
