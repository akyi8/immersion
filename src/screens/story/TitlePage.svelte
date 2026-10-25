<script lang="ts">
  import { onMount } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import { readTitlePage, seriesLine, withTitlePage, type TitlePage } from '../../lib/story/book';
  import { renamePiece } from '../../lib/story/manage';
  import { withHeader } from '../../lib/world';

  /**
   * A manuscript's title page (Mike, October 25), drawn from the fields in its `book.md`.
   * Choosing Edit title page opens a small form, and the series line and the copyright
   * line are written from what is filled in.
   */
  let {
    fs,
    book,
    folder,
    defaults,
    onMoved,
    onDefaults,
  }: {
    fs: WorldFs;
    /** The manuscript's `book.md`. */
    book: string;
    /** The manuscript's folder, which follows a new title. */
    folder: string;
    /** The world's author and copyright holder for new manuscripts. */
    defaults: { author: string; copyright: string };
    onMoved: (from: string, to: string) => void;
    /** Called after the world's defaults change. */
    onDefaults: () => void;
  } = $props();

  let page = $state<TitlePage | null>(null);
  let editing = $state<TitlePage | null>(null);
  let useAsDefault = $state(false);
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
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!editing || !page || !editing.title.trim()) return;
    busy = true;
    problem = '';
    try {
      const next = { ...editing, title: page.title };
      await fs.writeText(book, withTitlePage(await fs.readText(book), next));
      if (useAsDefault) {
        await fs.writeText('world.md', withHeader(await fs.readText('world.md'), { author: next.author.trim() || undefined, copyright: next.copyright.trim() || undefined }));
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

  const differs = $derived(!!editing && (editing.author.trim() !== defaults.author || editing.copyright.trim() !== defaults.copyright));
</script>

{#if page && !editing}
  <section class="page" aria-label="Title page">
    <h2 class="title">{page.title}</h2>
    {#if page.subtitle}<p class="subtitle">{page.subtitle}</p>{/if}
    {#if seriesLine(page)}<p class="series">{seriesLine(page)}</p>{/if}
    {#if page.author}<p class="author">by {page.author}</p>{/if}
    {#if page.copyright || page.year}
      <p class="copyright">Copyright © {[page.year, page.copyright].filter(Boolean).join(' ')}<br />All rights reserved.</p>
    {/if}
    <button type="button" class="edit" onclick={edit}>Edit title page</button>
  </section>
{:else if editing}
  <form class="form" aria-label="Title page" onsubmit={save}>
    <label for="tp-title" class="label">Title</label>
    <input id="tp-title" type="text" bind:value={editing.title} autocomplete="off" />
    <label for="tp-subtitle" class="label">Subtitle</label>
    <input id="tp-subtitle" type="text" bind:value={editing.subtitle} autocomplete="off" />
    <div class="pair">
      <div class="grow">
        <label for="tp-series" class="label">Series</label>
        <input id="tp-series" type="text" bind:value={editing.series} autocomplete="off" placeholder="Cerys Cross Chronicles" />
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
    <label for="tp-author" class="label">Author</label>
    <input id="tp-author" type="text" bind:value={editing.author} autocomplete="off" />
    <div class="pair">
      <div class="grow">
        <label for="tp-copyright" class="label">Copyright holder</label>
        <input id="tp-copyright" type="text" bind:value={editing.copyright} autocomplete="off" />
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
    {#if differs}
      <label class="check"><input type="checkbox" bind:checked={useAsDefault} /> Use this author and copyright holder for new manuscripts in this world</label>
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
    border: 1px solid var(--rule);
    background: var(--surface);
  }
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 64px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .subtitle,
  .series {
    margin: 14px 0 0;
    font-style: italic;
    font-size: 18px;
    color: var(--text-soft);
  }
  .author {
    margin: 28px 0 0;
    font-weight: 700;
    font-size: 17px;
  }
  .copyright {
    margin: 56px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted);
  }
  .edit {
    margin-top: 28px;
    font-size: 13px;
    color: var(--structure);
    background: none;
    border: 1px solid var(--rule-strong);
    padding: 6px 12px;
    min-height: 32px;
  }
  .edit:hover {
    color: var(--text);
    border-color: var(--structure);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 24px;
    border: 1px solid var(--rule-strong);
    background: var(--surface);
  }
  .label {
    font-size: 11px;
    margin-top: 8px;
  }
  input[type='text'],
  input[type='number'],
  select {
    font: inherit;
    font-size: 16px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--rule-strong);
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
    font-size: 14px;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
    font-size: 14px;
    color: var(--text-soft);
  }
  .problem {
    color: var(--danger);
    font-size: 14px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
  .actions button {
    font-size: 14px;
    padding: 10px 16px;
    min-height: 44px;
    border: 0;
  }
  .cancel {
    color: var(--text);
    background: none;
    border: 1px solid var(--rule-strong) !important;
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
