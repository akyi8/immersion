<script lang="ts">
  import { onMount } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import { readTitlePage, seriesLine, withTitlePage, type TitlePage } from '../../lib/story/book';
  import { renamePiece } from '../../lib/story/manage';
  import { withHeader } from '../../lib/world';
  import { account } from '../../lib/account.svelte';
  import { newProfileId, profileLabel } from '../../lib/you';
  import { ui } from '../../lib/ui.svelte';

  /**
   * A manuscript's title page (Mike, October 25), drawn from the fields in its `book.md`.
   * Choosing Edit title page opens a small form, and the series line and the copyright
   * line are written from what is filled in. The author comes from an author profile
   * (Mike, October 26), which the book links to, so a profile changed in Settings
   * changes every book that uses it.
   */
  let {
    fs,
    book,
    folder,
    defaults,
    onMoved,
    onDefaults,
    onSeries,
  }: {
    fs: WorldFs;
    /** The manuscript's `book.md`. */
    book: string;
    /** The manuscript's folder, which follows a new title. */
    folder: string;
    /** The world's author profile, or author and copyright holder, for new manuscripts. */
    defaults: { profile: string; author: string; copyright: string };
    onMoved: (from: string, to: string) => void;
    /** Called after the world's defaults change. */
    onDefaults: () => void;
    /** Opens the board of the series this book belongs to. */
    onSeries?: (series: string) => void;
  } = $props();

  let page = $state<TitlePage | null>(null);
  let editing = $state<TitlePage | null>(null);
  let useAsDefault = $state(false);
  /** Who the book is by, in the form: a profile's id, 'new' for a profile made here, or 'hand' for names typed out. */
  let who = $state('');
  let newAuthor = $state('');
  let newCopyright = $state('');

  const hasLibrary = $derived(!!account.info?.path);
  /** The names the title page shows: its profile's, or those written out by hand. */
  const linked = $derived(page?.profile ? account.profile(page.profile) : null);
  const names = $derived(page ? (page.profile ? { author: linked?.author ?? '', copyright: linked?.copyright ?? '' } : { author: page.author, copyright: page.copyright }) : null);
  /** Written-out names are offered for a book that already has them, or when there is no library to keep profiles. */
  const offerHand = $derived(!hasLibrary || !!(page && !page.profile && (page.author || page.copyright)));
  let problem = $state('');
  let busy = $state(false);

  async function load() {
    try {
      page = readTitlePage(await fs.readText(book), folder.split('/').pop() ?? '');
    } catch (e) {
      problem = String(e);
    }
  }

  onMount(() => {
    load();
    return fs.onChange((paths) => {
      if (!editing && paths.includes(book)) load();
    });
  });

  function edit() {
    if (!page) return;
    editing = { ...page };
    useAsDefault = false;
    problem = '';
    newAuthor = '';
    newCopyright = '';
    if (page.profile && account.profile(page.profile)) who = page.profile;
    else if (offerHand && (page.author || page.copyright || !hasLibrary)) who = 'hand';
    else if (account.profiles.length) who = account.profiles[0].id;
    else who = 'new';
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!editing || !page || !editing.title.trim()) return;
    busy = true;
    problem = '';
    try {
      let profile = '';
      if (who === 'new') {
        if (!newAuthor.trim()) throw new Error('A new author profile needs an author.');
        const made = { id: newProfileId(newAuthor, account.profiles), author: newAuthor.trim(), copyright: newCopyright.trim() };
        await account.saveProfiles([...account.profiles, made]);
        profile = made.id;
      } else if (who !== 'hand') profile = who;
      const next = { ...editing, title: page.title, profile };
      await fs.writeText(book, withTitlePage(await fs.readText(book), next));
      if (useAsDefault) {
        const changes = profile ? { profile, author: undefined, copyright: undefined } : { profile: undefined, author: next.author.trim() || undefined, copyright: next.copyright.trim() || undefined };
        await fs.writeText('world.md', withHeader(await fs.readText('world.md'), changes));
        onDefaults();
      }
      if (editing.title.trim() !== page.title) {
        const to = await renamePiece(fs, folder, editing.title);
        onMoved(folder, to);
      }
      editing = null;
      await load();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const differs = $derived(
    !!editing && (who === 'new' || (who === 'hand' ? editing.author.trim() !== defaults.author || editing.copyright.trim() !== defaults.copyright || !!defaults.profile : who !== defaults.profile)),
  );
</script>

{#if page && !editing}
  <section class="page" aria-label="Title page">
    <h2 class="title">{page.title}</h2>
    {#if page.subtitle}<p class="subtitle">{page.subtitle}</p>{/if}
    {#if seriesLine(page)}<p class="series">{seriesLine(page)}</p>{/if}
    {#if names?.author}<p class="author">by {names.author}</p>{/if}
    {#if page.profile && !linked && account.info}
      <p class="gone">{hasLibrary ? 'This book’s author profile is gone. Edit the title page to choose another.' : 'This book uses an author profile, which lives in your library. Choose a library in Settings to see it.'}</p>
    {/if}
    {#if names?.copyright || page.year}
      <p class="copyright">Copyright © {[page.year, names?.copyright].filter(Boolean).join(' ')}<br />All rights reserved.</p>
    {/if}
    <div class="buttons">
      <button type="button" class="edit" onclick={edit}>Edit title page</button>
      {#if page.series.trim() && onSeries}
        <button type="button" class="edit" onclick={() => onSeries(page!.series.trim())}>The {page.series.trim().replace(/^the\s+/i, '')} board</button>
      {/if}
    </div>
  </section>
{:else if editing}
  <form class="form" aria-label="Title page" onsubmit={save}>
    <label for="tp-title" class="label">Title</label>
    <input id="tp-title" type="text" bind:value={editing.title} autocomplete="off" />
    <label for="tp-subtitle" class="label">Subtitle</label>
    <input id="tp-subtitle" type="text" bind:value={editing.subtitle} autocomplete="off" />
    <div class="pair">
      <div class="grow">
        <label for="tp-series" class="label">Series <span class="optional">(leave empty for a book that stands alone)</span></label>
        <input id="tp-series" type="text" bind:value={editing.series} autocomplete="off" />
      </div>
      <div>
        <label for="tp-number" class="label">Number</label>
        <input
          id="tp-number"
          type="number"
          min="1"
          value={editing.number ?? ''}
          oninput={(e) => (editing!.number = Number((e.currentTarget as HTMLInputElement).value) || null)} />
      </div>
      <div>
        <label for="tp-word" class="label">Called a</label>
        <select id="tp-word" bind:value={editing.seriesWord}>
          {#each ['Story', 'Book', 'Novel', 'Tale'] as w}<option value={w}>{w}</option>{/each}
        </select>
      </div>
    </div>
    {#if seriesLine(editing)}<p class="preview">{seriesLine(editing)}</p>{/if}
    <div>
      <label for="tp-parts" class="label">Its parts are called</label>
      <input id="tp-parts" type="text" list="tp-part-words" bind:value={editing.partWord} autocomplete="off" placeholder="Chapter" />
      <datalist id="tp-part-words">{#each ['Chapter', 'Part', 'Section', 'Episode', 'Movement', 'Act'] as w}<option value={w}></option>{/each}</datalist>
    </div>
    <div class="pair">
      <div class="grow">
        <label for="tp-who" class="label">Author profile</label>
        {#if hasLibrary || offerHand}
          <select id="tp-who" bind:value={who}>
            {#each account.profiles as p (p.id)}<option value={p.id}>{profileLabel(p)}</option>{/each}
            {#if offerHand}<option value="hand">Written out by hand</option>{/if}
            {#if hasLibrary}<option value="new">Create an author profile…</option>{/if}
          </select>
        {/if}
      </div>
      <div>
        <label for="tp-year" class="label">Year</label>
        <input
          id="tp-year"
          type="number"
          value={editing.year ?? ''}
          oninput={(e) => (editing!.year = Number((e.currentTarget as HTMLInputElement).value) || null)} />
      </div>
    </div>
    {#if who === 'new'}
      <div class="sub">
        <label for="tp-new-author" class="label">Author</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="tp-new-author" type="text" bind:value={newAuthor} autocomplete="off" placeholder="The name on the cover" autofocus />
        <label for="tp-new-copyright" class="label">Copyright holder</label>
        <input id="tp-new-copyright" type="text" bind:value={newCopyright} autocomplete="off" placeholder="Often your legal name" />
        <p class="hint">The profile is kept in your library, and you can change it later in Settings.</p>
      </div>
    {:else if who === 'hand'}
      <div class="sub">
        <label for="tp-author" class="label">Author</label>
        <input id="tp-author" type="text" bind:value={editing.author} autocomplete="off" />
        <label for="tp-copyright" class="label">Copyright holder</label>
        <input id="tp-copyright" type="text" bind:value={editing.copyright} autocomplete="off" />
        {#if !hasLibrary}
          <p class="hint">
            Author profiles live in your library, so every computer has them.
            <button type="button" class="link" onclick={() => (ui.settings = 'computer')}>Choose a library</button>
          </p>
        {/if}
      </div>
    {/if}
    {#if differs}
      <label class="check"><input type="checkbox" bind:checked={useAsDefault} /> Use this author for new manuscripts in this world</label>
    {/if}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <div class="actions">
      <button type="button" class="cancel" onclick={() => (editing = null)}>Cancel</button>
      <button type="submit" class="save" disabled={busy || !editing.title.trim()}>Save</button>
    </div>
  </form>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 48px 24px 36px;
    border: 1px solid var(--line);
    border-radius: var(--round-box);
    background: var(--surface);
  }
  .title {
    color: var(--title);
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(64px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .subtitle,
  .series {
    margin: 14px 0 0;
    font-style: italic;
    font-size: calc(18px * var(--type));
    color: var(--text-soft);
  }
  .author {
    margin: 28px 0 0;
    font-weight: 700;
    font-size: calc(17px * var(--type));
  }
  .copyright {
    margin: 56px 0 0;
    font-size: calc(13px * var(--type));
    line-height: 1.6;
    color: var(--muted);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 28px;
  }
  .edit {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 12px;
    min-height: 32px;
  }
  .edit:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 24px;
    border: 1px solid var(--edge);
    border-radius: var(--round);
    background: var(--surface);
  }
  .label {
    font-size: calc(11px * var(--type));
    margin-top: 8px;
  }
  .optional {
    color: var(--muted);
    text-transform: none;
    letter-spacing: 0;
  }
  input[type='text'],
  input[type='number'],
  select {
    font: inherit;
    font-size: calc(16px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 9px 11px;
    width: 100%;
    box-sizing: border-box;
  }
  input[type='number'] {
    width: 96px;
  }
  .pair {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .pair > div {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .preview {
    margin: 4px 0 0;
    font-style: italic;
    color: var(--text-soft);
    font-size: calc(14px * var(--type));
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
    font-size: calc(14px * var(--type));
    color: var(--text-soft);
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 14px;
    border-left: 2px solid var(--edge);
  }
  .hint {
    margin: 4px 0 0;
    font-size: calc(13px * var(--type));
    color: var(--muted);
  }
  .link {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: none;
    border: 0;
    padding: 0;
    text-decoration: underline;
  }
  .gone {
    margin: 12px 0 0;
    font-size: calc(13px * var(--type));
    color: var(--muted);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
  .actions button {
    font-size: calc(14px * var(--type));
    padding: 10px 16px;
    min-height: 44px;
    border: 0;
  }
  .cancel {
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--edge) !important;
    border-radius: var(--round);
  }
  .save {
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
  }
  .save:disabled {
    opacity: 0.5;
  }
</style>
