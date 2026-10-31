<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { WikiIndex } from '../lib/index/wiki';
  import { folderLabel } from '../lib/index/wiki';
  import type { WorldFs } from '../lib/fs/types';
  import type { Navigator } from '../lib/nav.svelte';
  import { buildStoryIndex } from '../lib/story/index';
  import { find, type Findable } from '../lib/finder';
  import { portal } from '../lib/portal';
  import { ui } from '../lib/ui.svelte';
  import { sync } from '../lib/sync.svelte';

  /**
   * The quick finder (Mike, October 31). Typing finds any entry, manuscript, note,
   * chapter, or board in the open world, and a few actions, and Enter opens what is
   * chosen in the module it belongs to. The vault is never searched.
   */
  let {
    index,
    fs,
    nav,
    storiesDir,
    onClose,
    onShowShelf,
    onTheme,
    onDetails,
    onShowLoading,
  }: {
    index: WikiIndex;
    fs: WorldFs;
    nav: Navigator;
    storiesDir: string;
    onClose: () => void;
    onShowShelf: () => void;
    onTheme: () => void;
    onDetails: () => void;
    onShowLoading: () => void;
  } = $props();

  const PLACES = { desk: 'On the desk', drawer: 'In the drawer', shelf: 'On the shelf' };

  let query = $state('');
  let chosen = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();

  const go = (run: () => void) => () => {
    onClose();
    run();
  };

  const actions: Findable[] = [
    { kind: 'Go to', name: 'World', detail: 'The wiki', run: go(() => nav.show('world')) },
    { kind: 'Go to', name: 'Story', detail: 'Desk, drawer, and shelf', run: go(() => nav.show('story')) },
    { kind: 'Go to', name: 'Boards', detail: 'Timeline, series, and manuscripts', run: go(() => nav.show('boards')) },
    { kind: 'Go to', name: 'All worlds', detail: 'The Worlds page', run: go(() => onShowShelf()) },
    { kind: 'Open', name: 'Vault', detail: 'Encrypted stories', run: go(() => nav.openIn('story', '@vault')) },
    { kind: 'Open', name: 'Settings', detail: 'You, this world, this computer', run: go(() => (ui.settings = 'you')) },
    { kind: 'Open', name: 'Theme', detail: "This world's colors and fonts", run: go(() => onTheme()) },
    { kind: 'Open', name: 'World details', detail: 'Name and tagline', also: ['Edit details'], run: go(() => onDetails()) },
    { kind: 'Open', name: 'Loading screen', detail: "This world's picture", run: go(() => onShowLoading()) },
    { kind: 'Do', name: 'Sync now', detail: 'Git', run: go(() => sync.retry()) },
  ];

  const entries: Findable[] = $derived(
    index
      .all()
      .map((e) => ({ kind: 'Entry', name: e.name, detail: e.category ? folderLabel(e.category) : 'Unfiled', also: e.aliases, run: go(() => nav.openIn('world', e.id)) })),
  );

  let story = $state.raw<Findable[]>([]);
  onMount(() => {
    void tick().then(() => input?.focus());
    void buildStoryIndex(fs, storiesDir)
      .then((s) => {
        const out: Findable[] = [];
        for (const m of s.manuscripts) {
          if (m.kind === 'file') {
            out.push({ kind: 'Note', name: m.title, detail: PLACES[m.place], run: go(() => nav.openIn('story', m.path)) });
            continue;
          }
          out.push({ kind: 'Manuscript', name: m.title, detail: m.series ? `${m.series} · ${PLACES[m.place]}` : PLACES[m.place], run: go(() => nav.openIn('story', m.book ?? m.sections[0]?.path ?? m.path)) });
          if (m.sections.length) out.push({ kind: 'Board', name: m.title, detail: 'Manuscript board', run: go(() => nav.openIn('boards', `@board:${m.path}`)) });
          for (const c of m.sections) out.push({ kind: 'Chapter', name: c.title, detail: m.title, run: go(() => nav.openIn('story', c.path)) });
        }
        for (const name of new Set(s.manuscripts.map((m) => m.series).filter((x): x is string => !!x))) {
          out.push({ kind: 'Board', name, detail: 'Series board', run: go(() => nav.openIn('boards', `@series:${name}`)) });
        }
        out.push({ kind: 'Board', name: 'Timeline', detail: 'Every dated entry', run: go(() => nav.openIn('boards', '@timeline')) });
        story = out;
      })
      .catch(() => {});
  });

  const results = $derived(query.trim() ? find([...entries, ...story, ...actions], query) : actions);
  $effect(() => {
    void results;
    chosen = 0;
  });

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      chosen = Math.min(chosen + 1, results.length - 1);
      void tick().then(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      chosen = Math.max(chosen - 1, 0);
      void tick().then(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[chosen]?.run();
    }
  }
</script>

<div class="scrim" role="presentation" onclick={onClose} use:portal></div>
<div class="finder" role="dialog" aria-label="Find" use:portal>
  <div class="field">
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10.4 10.4 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    <input
      bind:this={input}
      bind:value={query}
      onkeydown={key}
      type="text"
      placeholder="Find an entry, a chapter, a board, or an action"
      aria-label="Find"
      aria-controls="finder-results"
      autocomplete="off"
      spellcheck="false" />
  </div>
  {#if results.length}
    <ul id="finder-results" role="listbox" aria-label="Results" bind:this={list}>
      {#each results as item, i (item.kind + item.name + item.detail + i)}
        <li role="option" aria-selected={i === chosen}>
          <button type="button" tabindex="-1" class:on={i === chosen} onmouseenter={() => (chosen = i)} onclick={item.run}>
            <span class="name">{item.name}</span>
            <span class="detail">{item.detail}</span>
            <span class="kind">{item.kind}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="none">Nothing in {query.trim() ? 'this world matches that' : 'here yet'}.</p>
  {/if}
  <p class="hint"><kbd>↑</kbd> <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 30;
  }
  .finder {
    position: fixed;
    top: 14vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(640px, calc(100vw - 32px));
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round-box);
    box-shadow: 0 24px 60px -20px var(--shadow);
    z-index: 31;
    overflow: hidden;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    color: var(--muted);
    border-bottom: 1px solid var(--line);
  }
  input {
    flex: 1;
    font: inherit;
    font-size: calc(17px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
  }
  li button {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: baseline;
    gap: 12px;
    text-align: left;
    padding: 9px 12px;
    color: var(--text);
    background: none;
    border: 0;
    border-radius: var(--round);
  }
  li button.on {
    background: var(--selected-bg);
    box-shadow: inset 2px 0 0 var(--selected-border);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail {
    font-size: calc(13px * var(--type));
    color: var(--muted);
    white-space: nowrap;
  }
  .kind {
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--structure);
    min-width: 72px;
    text-align: right;
  }
  .none {
    margin: 0;
    padding: 18px;
    color: var(--muted);
  }
  .hint {
    margin: 0;
    padding: 8px 18px 10px;
    font-size: calc(11px * var(--type));
    color: var(--muted);
    border-top: 1px solid var(--line);
  }
  kbd {
    font-family: var(--font-label);
    font-size: 0.95em;
  }
</style>
