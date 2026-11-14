<script lang="ts">
  import { onMount } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import type { View } from '../../lib/render';
  import { ui } from '../../lib/ui.svelte';
  import { views } from '../../lib/view.svelte';
  import { defaultShape } from '../../lib/index/frame';
  import { createEntry, likelyCategory } from '../../lib/index/create';
  import { TABLE_DIR, createAdventure, createCampaign, createSession, readTable, sessionOf, type Adventure, type Campaign, type Role, type Session } from '../../lib/table/index';
  import Panes from '../Panes.svelte';
  import Dialog from '../shelf/Dialog.svelte';
  import EntryView from '../world/EntryView.svelte';
  import CreateDialog from '../world/CreateDialog.svelte';
  import SessionPane from './SessionPane.svelte';
  import RumorsPage from './RumorsPage.svelte';
  import CampaignPage from './CampaignPage.svelte';

  /**
   * The Table module (Mike, November 14): where a tabletop campaign is planned and
   * recorded, by the game master who runs it or by a player in it. A campaign holds
   * adventures, an adventure holds sessions, and a session is a plan beside a log. The
   * files are described in `lib/table/index.ts`.
   */
  let {
    fs,
    nav,
    index,
    rebuild,
    view,
    worldName,
  }: {
    fs: WorldFs;
    nav: Navigator;
    index: WikiIndex;
    rebuild: () => Promise<void>;
    /** Narrator view shows a campaign's plans. Protagonist view puts them away. */
    view: View;
    worldName: string;
  } = $props();

  let campaigns = $state<Campaign[]>([]);
  let loaded = $state(false);
  let problem = $state('');

  async function refresh() {
    try {
      campaigns = await readTable(fs);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    loaded = true;
  }

  onMount(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = fs.onChange((paths) => {
      // Typing in a session saves its file, which is not a change to the tree. Cards, and files that come or go, are.
      if (!paths.some((p) => p.startsWith(TABLE_DIR + '/'))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  });

  const RUMORS = '@rumors:';
  const plans = $derived(view === 'narrator');
  const campaignAt = (path: string) => campaigns.find((c) => c.path === path || c.card === path) ?? null;
  const found = (id: string) => sessionOf(campaigns, id);
  const showsPlan = (c: Campaign) => c.role === 'gm' && plans;

  const row = $derived(
    nav.panes.filter((id) => {
      if (index.get(id)) return true;
      if (id.startsWith(RUMORS)) return !!campaignAt(id.slice(RUMORS.length));
      if (campaigns.some((c) => c.card === id)) return true;
      const at = found(id);
      if (!at) return false;
      return at.session.log === id || (at.session.plan === id && showsPlan(at.campaign));
    }),
  );

  function label(id: string): string {
    const entry = index.get(id);
    if (entry) return entry.name;
    if (id.startsWith(RUMORS)) return 'Rumors';
    const c = campaigns.find((x) => x.card === id);
    if (c) return c.name;
    const at = found(id);
    return at ? (at.session.plan === id ? `${at.session.name} · plan` : at.session.name) : id;
  }

  /** Opens a session: its plan and its log side by side for the game master, and the log alone for a player. */
  function openSession(c: Campaign, s: Session) {
    const sides = [showsPlan(c) ? s.plan : null, s.log].filter((p): p is string => !!p);
    const missing = sides.filter((p) => !nav.panes.includes(p));
    if (missing.length) nav.setRow([...nav.panes, ...missing]);
    else if (sides.length) nav.open(sides.at(-1)!);
  }

  /** The session played before this one in its campaign. */
  function before(c: Campaign, s: Session): Session | null {
    const all = c.adventures.flatMap((a) => a.sessions).filter((x) => x.log);
    const i = all.findIndex((x) => x.stem === s.stem);
    return i > 0 ? all[i - 1] : null;
  }

  // The sidebar remembers which adventures are folded shut.
  const FOLDS = 'immersion.table.folds';
  let shut = $state<string[]>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(FOLDS) ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
  );
  function fold(path: string) {
    shut = shut.includes(path) ? shut.filter((p) => p !== path) : [...shut, path];
    try {
      localStorage.setItem(FOLDS, JSON.stringify(shut));
    } catch {
      // Not remembering a fold is harmless.
    }
  }

  // One small form makes a campaign, an adventure, or a session.
  type Making = { kind: 'campaign' } | { kind: 'adventure'; campaign: Campaign } | { kind: 'session'; campaign: Campaign; adventure: Adventure };
  let making = $state<Making | null>(null);
  let name = $state('');
  let role = $state<Role>('player');
  let game = $state<'own' | 'other'>('other');
  let system = $state('');
  let busy = $state(false);
  let fresh = $state<string | null>(null);

  function start(m: Making) {
    making = m;
    problem = '';
    name = m.kind === 'session' ? `Session ${m.campaign.adventures.reduce((n, a) => n + a.sessions.length, 0) + 1}` : '';
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  async function make() {
    if (!making || !name.trim()) return;
    busy = true;
    problem = '';
    try {
      if (making.kind === 'campaign') {
        const path = await createCampaign(fs, { name, role, game, system: game === 'other' ? system : '' });
        await refresh();
        nav.open(`${path}/campaign.md`);
      } else if (making.kind === 'adventure') {
        await createAdventure(fs, making.campaign, name);
        await refresh();
      } else {
        const stem = await createSession(fs, making.campaign, making.adventure, name, today());
        await refresh();
        const at = found(stem);
        if (at) {
          fresh = at.session.log;
          openSession(at.campaign, at.session);
        }
      }
      making = null;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    busy = false;
  }

  // A wiki entry started from a name selected in a session, as in a chapter.
  let makingEntry = $state<{ name: string; after: number } | null>(null);
  let freshEntry = $state<string | null>(null);
  async function makeEntry(entryName: string, folder: string): Promise<string | null> {
    try {
      const path = await createEntry(fs, entryName, folder);
      await rebuild();
      freshEntry = path;
      nav.open(path, makingEntry?.after);
      makingEntry = null;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  const isOpen = (id: string | null) => !!id && nav.panes.includes(id);
  const short = (played: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(played);
    return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${+m[3]}` : played;
  };
</script>

<div class="table">
  {#if !ui.full}
    <nav class="sidebar" aria-label="Table">
      {#each campaigns as c (c.path)}
        <div class="head">
          <button type="button" class="item campaign" class:on={isOpen(c.card)} onclick={() => nav.open(c.card)}>
            <span>{c.name}</span><span class="n">{c.role === 'gm' ? 'Running' : 'Playing'}{c.system ? ` · ${c.system}` : ''}</span>
          </button>
        </div>
        {#each c.adventures as a (a.path)}
          <div class="head d1">
            <button type="button" class="item fold" aria-expanded={!shut.includes(a.path)} onclick={() => fold(a.path)}>
              <span><span class="arrow" aria-hidden="true">{shut.includes(a.path) ? '▸' : '▾'}</span> {a.name}</span>
            </button>
            <button type="button" class="plus" aria-label="New session in {a.name}" title="New session" onclick={() => start({ kind: 'session', campaign: c, adventure: a })}>+</button>
          </div>
          {#if !shut.includes(a.path)}
            {#each a.sessions as s (s.stem)}
              <button type="button" class="item d2" class:on={isOpen(s.log) || isOpen(s.plan)} onclick={() => openSession(c, s)}>
                <span>{s.name}</span><span class="n">{short(s.played)}</span>
              </button>
            {:else}
              <p class="hint d2">No sessions yet.</p>
            {/each}
          {/if}
        {/each}
        <button type="button" class="item d1 quiet" onclick={() => start({ kind: 'adventure', campaign: c })}>+ New adventure</button>
        <button type="button" class="item d1" class:on={isOpen(RUMORS + c.path)} onclick={() => nav.open(RUMORS + c.path)}><span>Rumors</span></button>
        <div class="gap"></div>
      {:else}
        {#if loaded}<p class="hint">No campaigns yet.</p>{/if}
      {/each}
      <button type="button" class="item quiet" onclick={() => start({ kind: 'campaign' })}>+ New campaign</button>
    </nav>
  {/if}

  {#if row.length}
    <Panes
      {nav}
      ids={row}
      {label}
      canWindow={() => false}
      isCard={(id) => {
        const e = index.get(id);
        return !!e?.imagePath && (e.picture ?? defaultShape(e.category, index.pictures ?? null)) === 'behind' && views.of(id).picture !== 'hide';
      }}>
      {#snippet pane(id, i, next)}
        {@const at = found(id)}
        {@const card = campaigns.find((c) => c.card === id)}
        {#if index.get(id)}
          <EntryView
            {index}
            {fs}
            {id}
            {view}
            {next}
            fresh={freshEntry === id}
            onOpen={(target) => nav.open(target, i)}
            onMakeEntry={(n) => (makingEntry = { name: n, after: i })}
            onMoved={async (from, to) => {
              await rebuild();
              nav.replace(from, to);
            }} />
        {:else if id.startsWith(RUMORS) && campaignAt(id.slice(RUMORS.length))}
          <RumorsPage {fs} {index} campaign={campaignAt(id.slice(RUMORS.length))!} {view} onOpen={(target) => nav.open(target, i)} />
        {:else if card}
          <CampaignPage {fs} campaign={card} onChanged={refresh} />
        {:else if at}
          {#key at.session.stem}
            <SessionPane
              {fs}
              {index}
              campaign={at.campaign}
              session={at.session}
              before={before(at.campaign, at.session)}
              side={at.session.plan === id ? 'plan' : 'log'}
              {next}
              fresh={fresh === id}
              onOpen={(target) => nav.open(target, i)}
              onMakeEntry={(n) => (makingEntry = { name: n, after: i })}
              onChanged={refresh} />
          {/key}
        {/if}
      {/snippet}
    </Panes>
  {:else}
    <main class="home sheet">
      <h1>Table</h1>
      <p>The campaigns played in {worldName}. A campaign holds adventures, and an adventure holds sessions. Each session keeps a log of what happened, and a plan beside it when you run the game.</p>
      {#if problem && !making}<p class="problem" role="alert">{problem}</p>{/if}
      <div class="cards">
        {#each campaigns as c (c.path)}
          {@const all = c.adventures.flatMap((a) => a.sessions)}
          <button type="button" class="card" onclick={() => (all.length ? openSession(c, all.at(-1)!) : nav.open(c.card))}>
            <span class="kind">{c.role === 'gm' ? 'Running' : 'Playing'}{c.system ? ` · ${c.system}` : ''}</span>
            <span class="name">{c.name}</span>
            <span class="n">{all.length ? `${all.length} ${all.length === 1 ? 'session' : 'sessions'} · last: ${all.at(-1)!.name}` : 'No sessions yet'}</span>
          </button>
        {/each}
        <button type="button" class="card new" onclick={() => start({ kind: 'campaign' })}>
          <span class="kind">New</span><span class="name">Start a campaign</span>
        </button>
      </div>
    </main>
  {/if}
</div>

{#if making}
  <Dialog
    title={making.kind === 'campaign' ? 'New campaign' : making.kind === 'adventure' ? 'New adventure' : 'New session'}
    action={making.kind === 'session' ? 'Start the session' : 'Create'}
    ready={!!name.trim()}
    {busy}
    {problem}
    onSubmit={make}
    onCancel={() => (making = null)}>
    <label for="tb-name" class="label">Name</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="tb-name" type="text" bind:value={name} autofocus autocomplete="off" placeholder={making.kind === 'campaign' ? 'The Salt Ledger' : making.kind === 'adventure' ? 'The first winter' : 'Session 1'} />
    {#if making.kind === 'campaign'}
      <label for="tb-role" class="label">I am</label>
      <select id="tb-role" bind:value={role}>
        <option value="player">A player in it</option>
        <option value="gm">Running it</option>
      </select>
      <label for="tb-game" class="label">The game</label>
      <select id="tb-game" bind:value={game}>
        <option value="other">Another game</option>
        <option value="own">This world's own game</option>
      </select>
      {#if game === 'other'}
        <input type="text" bind:value={system} aria-label="The game's name" autocomplete="off" placeholder="The game's name, such as Pendragon" />
      {/if}
    {:else if making.kind === 'adventure'}
      <p class="hint">An adventure is one stretch of {making.campaign.name}: a story, a year, or whatever the table calls it. Its sessions go inside it.</p>
    {:else}
      <p class="hint">In {making.adventure.name}. {making.campaign.role === 'gm' ? 'It starts with a plan and a log.' : 'It starts with a log.'} Today is set as the day it was played, and you can change that on the page.</p>
    {/if}
  </Dialog>
{/if}

{#if makingEntry}
  <CreateDialog {index} kind="entry" startFolder={likelyCategory(index)} startName={makingEntry.name} onCreate={makeEntry} onCancel={() => (makingEntry = null)} />
{/if}

<style>
  .table {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .sidebar {
    width: 290px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--line);
    padding: 12px 0 24px;
  }
  .head {
    display: flex;
    align-items: stretch;
  }
  .item {
    flex: 1;
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    text-align: left;
    font-size: calc(15px * var(--type));
    color: var(--text);
    background: none;
    border: 0;
    padding: 6px 18px;
    min-height: 32px;
    min-width: 0;
  }
  .item > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .campaign {
    font-family: var(--font-display);
    font-size: calc(20px * var(--type));
    color: var(--title);
  }
  .d1,
  .d1 .item {
    padding-left: 30px;
  }
  .head.d1 {
    padding-left: 0;
  }
  .d2 {
    padding-left: 48px;
  }
  .item:hover,
  .plus:hover {
    background: var(--surface);
  }
  .item.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    box-shadow: inset 2px 0 0 var(--selected-border);
  }
  .quiet {
    color: var(--muted);
    font-size: calc(13px * var(--type));
  }
  .arrow {
    color: var(--muted);
    font-size: 0.8em;
  }
  .plus {
    width: 34px;
    color: var(--muted);
    background: none;
    border: 0;
    font-size: calc(16px * var(--type));
  }
  .n {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
    flex-shrink: 0;
  }
  .hint {
    margin: 2px 18px 6px;
    font-size: calc(13px * var(--type));
    line-height: 1.5;
    color: var(--muted);
  }
  .hint.d2 {
    margin-left: 48px;
  }
  .gap {
    height: 14px;
  }
  .home {
    flex: 1;
    overflow-y: auto;
    padding: 36px 48px 60px;
  }
  .home h1 {
    color: var(--title);
    margin: 0 0 12px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(60px * var(--type));
    letter-spacing: 0.02em;
  }
  .home p {
    max-width: 640px;
    color: var(--text-soft);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
    margin-top: 24px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    padding: 18px 18px 16px;
    min-height: 120px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--round-box);
  }
  .card.new {
    background: none;
    border-style: dashed;
  }
  .card:hover {
    border-color: var(--hover-edge);
  }
  .kind {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--structure);
  }
  .name {
    font-family: var(--font-display);
    font-size: calc(30px * var(--type));
    line-height: 1.05;
    color: var(--title);
  }
  .problem {
    color: var(--danger, var(--accent));
  }
</style>
