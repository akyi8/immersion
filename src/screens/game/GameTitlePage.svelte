<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Frame } from '../../lib/index/frame';
  import type { Book } from '../../lib/game/game';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import { account } from '../../lib/account.svelte';
  import { ui } from '../../lib/ui.svelte';
  import GameBanner, { type PictureChoice } from './GameBanner.svelte';
  import GameText from './GameText.svelte';

  /**
   * A game book's title page (Mike, November 10), drawn the way a manuscript's is: the
   * title, a line under it, who the game is by, and the copyright line, none of it typed
   * into the page's text. The author comes from an author profile, so a pen name changed
   * in Settings changes here too. A book prints its title page, then its front matter,
   * then its divisions, so an introduction is a page of the front matter.
   */
  export interface TitleChanges {
    name: string;
    subtitle: string;
    profile: string;
    author: string;
    copyright: string;
    year: number | null;
    body: string;
  }

  let {
    place,
    book,
    builtOn,
    picture,
    choices,
    onFrame,
    onSave,
    onMoveText,
    contents,
  }: {
    place: string;
    book: Book;
    /** The engine a world's game is built on, named under the title. */
    builtOn: string | null;
    picture: { url: string; frame: Frame | null } | null;
    choices: PictureChoice[];
    onFrame: (frame: Frame) => Promise<void>;
    onSave: (changes: TitleChanges) => Promise<void>;
    /** Moves the old front page's text into the front matter as an introduction. */
    onMoveText: (text: string) => Promise<void>;
    contents: { label: string; note?: string; open: () => void }[];
  } = $props();

  // Seeded once from the file; the page then holds the writer's own copy.
  let heading = $state((() => book.name)());
  let subtitle = $state((() => book.subtitle)());
  let author = $state((() => book.author)());
  let copyright = $state((() => book.copyright)());
  let year = $state((() => (book.year === null ? '' : String(book.year)))());
  let text = $state((() => book.body)());
  /** Who the game is by: a profile's id, 'hand' for names written out, or '' for nobody yet. */
  let who = $state((() => (book.profile ? book.profile : book.author || book.copyright ? 'hand' : ''))());

  const linked = $derived(who && who !== 'hand' ? account.profile(who) : null);
  const missing = $derived(!!who && who !== 'hand' && !linked);
  const holder = $derived(who === 'hand' ? copyright.trim() : (linked?.copyright ?? ''));

  // svelte-ignore state_referenced_locally
  const saver = new Saver(() =>
    onSave({
      name: heading.trim() || book.name,
      subtitle: subtitle.trim(),
      profile: who && who !== 'hand' ? who : '',
      author: who === 'hand' ? author.trim() : '',
      copyright: who === 'hand' ? copyright.trim() : '',
      year: /^\d{1,4}$/.test(year.trim()) ? Number(year.trim()) : null,
      body: text,
    }),
  );
  onDestroy(() => void saver.flush());

  let moving = $state(false);
  let problem = $state('');
  async function moveText() {
    moving = true;
    problem = '';
    try {
      await saver.flush();
      await onMoveText(text);
      text = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      moving = false;
    }
  }
</script>

<article class="front">
  <GameBanner url={picture?.url ?? null} frame={picture?.frame ?? null} {place} {choices} {onFrame}>
    {#snippet title()}
      <input class="title" type="text" bind:value={heading} oninput={() => saver.push(null)} aria-label="Title" autocomplete="off" />
    {/snippet}
  </GameBanner>
  <div class="status-row"><span class="status">{said(saver.status)}</span></div>
  {#if saver.problem || problem}<p class="problem" role="alert">{saver.problem || problem}</p>{/if}

  <section class="plate" aria-label="Title page">
    <input class="subtitle" type="text" bind:value={subtitle} oninput={() => saver.push(null)} aria-label="The line under the title" placeholder="A line under the title" autocomplete="off" />
    {#if builtOn}<p class="built">A game built on {builtOn}</p>{/if}

    <div class="by">
      <span class="label">By</span>
      {#if who === 'hand'}
        <input class="name" type="text" bind:value={author} oninput={() => saver.push(null)} aria-label="Author" placeholder="Author" autocomplete="off" />
      {:else if linked}
        <span class="name">{linked.author}</span>
      {:else if missing}
        <span class="name gone">An author profile that is not on this computer</span>
      {:else}
        <span class="name none">Nobody yet</span>
      {/if}
      <select aria-label="Who the game is by" bind:value={who} onchange={() => saver.push(null)}>
        <option value="">Nobody yet</option>
        {#each account.profiles as p (p.id)}<option value={p.id}>{p.author}</option>{/each}
        {#if missing}<option value={who}>The profile it was linked to</option>{/if}
        <option value="hand">Written out by hand</option>
      </select>
    </div>
    {#if !account.profiles.length && who !== 'hand'}
      <p class="hint">
        An author profile holds a pen name and a copyright holder, for every book and game you write.
        <button type="button" class="link" onclick={() => (ui.settings = 'you')}>Make one in Settings</button>
      </p>
    {/if}

    <p class="copyright">
      Copyright ©
      <input class="year" type="text" inputmode="numeric" bind:value={year} oninput={() => saver.push(null)} aria-label="Copyright year" placeholder="year" autocomplete="off" />
      {#if who === 'hand'}
        <input class="holder" type="text" bind:value={copyright} oninput={() => saver.push(null)} aria-label="Copyright holder" placeholder="Copyright holder" autocomplete="off" />
      {:else}
        {holder}
      {/if}
      <br />All rights reserved.
    </p>
  </section>

  {#if text.trim() || book.body.trim()}
    <section class="old" aria-label="Text from the old front page">
      <div class="label">Text from the old front page</div>
      <p class="hint">
        A book prints its title page, then its front matter, then its divisions. This text printed before the front matter, ahead of the credits and
        the copyright page. An introduction reads best as the last page of the front matter.
      </p>
      <GameText
        text={book.body}
        label="Text from the old front page"
        onChange={(t) => {
          text = t;
          saver.push(null);
        }} />
      <button type="button" class="move" disabled={moving || !text.trim()} onclick={moveText}>Move it into the front matter as an Introduction</button>
    </section>
  {/if}

  {#if contents.length}
    <ol class="contents">
      {#each contents as c, i (i)}
        <li><button type="button" onclick={c.open}><span>{c.label}</span>{#if c.note}<span class="note">{c.note}</span>{/if}</button></li>
      {/each}
    </ol>
  {/if}
</article>

<style>
  /* The banner runs the pane's full width, and everything under it keeps a reading width. */
  article > :global(:not(.poster)) {
    max-width: var(--measure, 760px);
  }
  .title {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 4px 0 2px -5px;
    color: var(--title);
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(56px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.05;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--round);
    padding: 2px 4px;
  }
  input:hover,
  input:focus {
    border-color: var(--edge);
    outline: none;
  }
  .status-row {
    display: flex;
    justify-content: flex-end;
  }
  .status {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  /* The plate: a title page's lines, centered, with room around them. */
  .plate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 5vh 0 7vh;
    text-align: center;
  }
  .plate input {
    font: inherit;
    color: inherit;
    text-align: center;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--round);
    padding: 2px 6px;
  }
  .subtitle {
    width: 100%;
    font-family: var(--font-body) !important;
    font-size: calc(22px * var(--type)) !important;
    font-style: italic;
    color: var(--text-soft) !important;
  }
  .built {
    margin: 0;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .by {
    margin-top: 5vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .by .name {
    font-family: var(--font-display) !important;
    font-size: calc(30px * var(--type)) !important;
    letter-spacing: 0.03em;
    color: var(--text) !important;
  }
  .by .none,
  .by .gone {
    color: var(--muted) !important;
  }
  /* The choice of author is a quiet control under the name, not part of the page's lines. */
  .by select {
    margin-top: 2px;
    font-size: calc(12px * var(--type));
    color: var(--muted);
    background: none;
    border: 0;
    opacity: 0;
    transition: opacity 150ms;
  }
  .plate:hover select,
  .by select:focus {
    opacity: 1;
  }
  .copyright {
    margin: 5vh 0 0;
    font-size: calc(14px * var(--type));
    line-height: 1.7;
    color: var(--text-soft);
  }
  .year {
    width: 3.4em;
    padding: 2px 0 !important;
  }
  .holder {
    width: 12em;
    field-sizing: content;
    min-width: 6em;
    text-align: left !important;
  }
  .hint {
    margin: 0;
    max-width: 34em;
    font-size: calc(13px * var(--type));
    line-height: 1.5;
    color: var(--muted);
  }
  .link {
    padding: 0;
    font: inherit;
    color: var(--structure);
    background: none;
    border: 0;
    text-decoration: underline;
  }
  .old {
    border-top: 2px solid var(--structure-deep, var(--line));
    padding-top: 12px;
    margin-bottom: 24px;
    display: grid;
    gap: 10px;
  }
  .move {
    justify-self: start;
  }
  .contents {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  .contents button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 10px 4px;
    text-align: left;
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--line);
  }
  .contents button:hover {
    color: var(--structure-soft);
  }
  .note {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
</style>
