<script lang="ts">
  import { onMount } from 'svelte';
  import type { WorldFs } from '../lib/fs/types';
  import { loadWorld, type World } from '../lib/world';
  import { buildWikiIndex, type WikiIndex } from '../lib/index/wiki';
  import { buildStoryIndex, filesOf, titleFromName, type StoryIndex } from '../lib/story/index';
  import { Navigator } from '../lib/nav.svelte';
  import type { View } from '../lib/render';
  import { applyTheme } from '../lib/theme';
  import { mode } from '../lib/mode.svelte';
  import Panes from './Panes.svelte';
  import EntryView from './world/EntryView.svelte';
  import ManuscriptPane from './story/ManuscriptPane.svelte';
  import TimelineView from './world/TimelineView.svelte';

  /**
   * A reading window (Jen and Mike, October 25): one page and nothing else, so it can sit
   * on a second monitor or be shared on a call. Names in it open beside it in this window.
   * It starts in Protagonist view, so narrator-only text stays hidden until the quiet
   * switch in the corner shows it.
   */
  let { fs, id }: { fs: WorldFs; id: string } = $props();

  let world = $state.raw<World | null>(null);
  let index = $state.raw<WikiIndex | null>(null);
  let story = $state.raw<StoryIndex | null>(null);
  let problem = $state('');
  let view = $state<View>('protagonist');
  const nav = new Navigator();

  async function load() {
    try {
      world = await loadWorld(fs);
      index = await buildWikiIndex(fs, world);
      story = await buildStoryIndex(fs, world.storiesDir);
    } catch (e) {
      problem = String(e);
    }
  }

  onMount(() => {
    // svelte-ignore state_referenced_locally
    nav.setRow([id]);
    load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    return fs.onChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    });
  });

  $effect(() => {
    applyTheme(world?.theme ?? null, mode.current);
  });

  const pieces = $derived(new Set((story?.manuscripts ?? []).flatMap(filesOf)));
  const row = $derived(nav.panes.filter((p) => p === '@timeline' || index?.get(p) || pieces.has(p)));

  function label(p: string): string {
    if (p === '@timeline') return 'Timeline';
    const entry = index?.get(p);
    if (entry) return entry.name;
    for (const m of story?.manuscripts ?? []) {
      if (m.path === p || m.book === p) return m.title;
      const s = [...m.front, ...m.sections, ...m.back].find((x) => x.path === p);
      if (s) return s.title;
    }
    return titleFromName(p.split('/').pop() ?? p);
  }

  // Closing the last page closes the window.
  $effect(() => {
    if (index && nav.panes.length === 0) closeWindow();
  });
  async function closeWindow() {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      await getCurrentWebviewWindow().close();
    } catch {
      window.close();
    }
  }

  // The window's title follows the page it was opened on.
  $effect(() => {
    if (row.length) document.title = label(row[0]);
  });
</script>

<div class="reader">
  {#if index && row.length}
    <Panes {nav} ids={row} {label}>
      {#snippet pane(p, i, next)}
        {#if p === '@timeline'}
          <TimelineView index={index!} {fs} rebuild={load} onOpen={(target) => nav.open(target, i)} />
        {:else if index!.get(p)}
          <EntryView index={index!} {fs} id={p} {view} {next} fresh={false} onOpen={(target) => nav.open(target, i)} />
        {:else}
          <div class="page">
            <ManuscriptPane
              {fs}
              index={index!}
              {story}
              id={p}
              {next}
              drafting
              onOpen={(target) => nav.open(target, i)}
              onCursor={() => {}}
              onDraft={() => {}}
              onMoveTo={() => {}}
              onOpenPiece={(path) => nav.open(path, i)} />
          </div>
        {/if}
      {/snippet}
    </Panes>
  {:else if problem}
    <p class="problem" role="alert">{problem}</p>
  {:else if index}
    <p class="gone">This page is no longer in the world. It may have been renamed or archived.</p>
  {/if}

  {#if index && row.some((p) => index!.get(p))}
    <div class="view" role="group" aria-label="Wiki view">
      <button type="button" class:on={view === 'protagonist'} aria-pressed={view === 'protagonist'} onclick={() => (view = 'protagonist')}>Protagonist</button>
      <button type="button" class:on={view === 'narrator'} aria-pressed={view === 'narrator'} onclick={() => (view = 'narrator')}>Narrator</button>
    </div>
  {/if}
</div>

<style>
  .reader {
    height: 100%;
    display: flex;
  }
  .page {
    padding: 12px 8px 30vh;
  }
  .problem,
  .gone {
    margin: 48px;
    color: var(--muted);
  }
  .problem {
    color: var(--danger);
  }
  /* The view switch stays nearly invisible, so a shared screen shows only the page. */
  .view {
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 3;
    display: flex;
    border: 1px solid var(--rule);
    opacity: 0.22;
    transition: opacity 200ms;
  }
  .view:hover,
  .view:focus-within {
    opacity: 1;
  }
  .view button {
    font-size: 12px;
    color: var(--muted);
    background: var(--bg);
    border: 0;
    padding: 6px 10px;
  }
  .view button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
</style>
