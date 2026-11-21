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
  import { TABLE_DIR, createAdventure, createCampaign, archivePath, archiveSession, createSession, readTable, renameBook, sessionOf, setFacts, type Adventure, type Campaign, type Role, type Session } from '../../lib/table/index';
  import Panes from '../Panes.svelte';
  import Dialog from '../shelf/Dialog.svelte';
  import EntryView from '../world/EntryView.svelte';
  import CreateDialog from '../world/CreateDialog.svelte';
  import SessionPane from './SessionPane.svelte';
  import RumorsPage from './RumorsPage.svelte';
  import CampaignPage from './CampaignPage.svelte';
  import Tray from './Tray.svelte';
  import RulebookPane from './RulebookPane.svelte';
  import HandoutPane from './HandoutPane.svelte';
  import TextHandout from './TextHandout.svelte';
  import { chooseAndAdd, createTextHandout } from '../../lib/table/add';
  import { inDesktopApp } from '../../lib/runtime';
  import { contextMenu } from '../../lib/contextMenu.svelte';
  import { saveAllUnder, saveNow } from '../../lib/saves';
  import { pageActions } from '../../lib/pane.svelte';
  import type { MenuEntry } from '../../lib/contextMenu.svelte';
  import { titleFocus } from '../../lib/table/tray.svelte';
  import { openInWindow } from '../../lib/windows';
  import { movePage } from '../../lib/table/pdf';
  import { tray } from '../../lib/table/tray.svelte';

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
  const bookAt = (id: string) => campaigns.flatMap((c) => c.rules).find((r) => r.path === id) ?? null;
  const handoutAt = (id: string) => campaigns.flatMap((c) => c.handouts).find((h) => h.path === id) ?? null;

  /** Renames a rulebook or a handout, and keeps its pane open on the new file. */
  async function renameFile(id: string, name: string): Promise<string | null> {
    try {
      const to = await renameBook(fs, id, name);
      movePage(id, to);
      await refresh();
      nav.replace(id, to);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** A rulebook or a handout moves to a window of its own, to sit on another screen or be shared on a call. */
  function toWindow(id: string) {
    void openInWindow(id, label(id));
  }
  const showsPlan = (c: Campaign) => c.role === 'gm' && plans;

  const row = $derived(
    nav.panes.filter((id) => {
      if (index.get(id)) return true;
      if (id.startsWith(RUMORS)) return !!campaignAt(id.slice(RUMORS.length));
      if (campaigns.some((c) => c.card === id || c.rules.some((r) => r.path === id) || c.handouts.some((h) => h.path === id))) return true;
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
    const book = bookAt(id) ?? handoutAt(id);
    if (book) return book.name;
    const at = found(id);
    if (!at) return id;
    // With a plan beside it, the log says it is the log, so two spines can be told apart.
    return at.session.plan === id ? `${at.session.name} · plan` : at.session.plan && showsPlan(at.campaign) ? `${at.session.name} · log` : at.session.name;
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
  type Making = { kind: 'campaign' } | { kind: 'adventure'; campaign: Campaign } | { kind: 'session'; campaign: Campaign; adventure: Adventure } | { kind: 'handout'; campaign: Campaign }
    | { kind: 'rename'; what: string; was: string; files: string[] }
    | { kind: 'archive'; what: string; was: string; run: () => Promise<void> };
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
    name = m.kind === 'session' ? `Session ${m.campaign.adventures.reduce((n, a) => n + a.sessions.length, 0) + 1}` : m.kind === 'rename' ? m.was : '';
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  async function make() {
    if (!making || (making.kind !== 'archive' && !name.trim())) return;
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
      } else if (making.kind === 'archive') {
        await making.run();
        await refresh();
      } else if (making.kind === 'rename') {
        // The name is kept in the card or the header, so the files stay where they are.
        for (const file of making.files) {
          await saveNow(file);
          await setFacts(fs, file, { name: name.trim() });
        }
        await refresh();
      } else if (making.kind === 'handout') {
        const path = await createTextHandout(fs, making.campaign, name);
        await refresh();
        fresh = path;
        nav.open(path);
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

  // The tray serves the campaign of the log it writes to, or of the last session open, or the only campaign.
  const trayCampaign = $derived(
    (tray.target && found(tray.target.path)?.campaign) ||
      row.map((id) => found(id)?.campaign ?? campaigns.find((c) => c.card === id || id === RUMORS + c.path)).filter((c) => !!c).at(-1) ||
      campaigns[0] ||
      null,
  );

  /** Copies rulebooks or handouts chosen on this computer into a campaign, and opens the first. */
  async function addFiles(c: Campaign, folder: 'rules' | 'handouts') {
    problem = '';
    try {
      const added = await chooseAndAdd(fs, c, folder);
      await refresh();
      if (added.length) nav.open(added[0]);
    } catch (e) {
      await refresh();
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * What can be done to a thing in the Table module, as one menu (Mike, November 15). The
   * same menu opens from a right click on its row, from the row's hover button, and from
   * its page's corner. Renaming is typing over the page's title, so Rename opens the page
   * with the cursor there. An adventure has no page, so it is renamed in a small form.
   * Archiving moves the files into an `archive` folder and deletes nothing.
   */
  type Thing =
    | { kind: 'campaign'; c: Campaign }
    | { kind: 'adventure'; c: Campaign; a: Adventure }
    | { kind: 'session'; c: Campaign; s: Session }
    | { kind: 'rulebook' | 'handout'; path: string; name: string };

  function thingAt(id: string): Thing | null {
    const c = campaigns.find((x) => x.card === id);
    if (c) return { kind: 'campaign', c };
    const at = found(id);
    if (at) return { kind: 'session', c: at.campaign, s: at.session };
    const book = bookAt(id);
    if (book) return { kind: 'rulebook', ...book };
    const h = handoutAt(id);
    return h ? { kind: 'handout', path: h.path, name: h.name } : null;
  }

  function retitle(id: string) {
    nav.open(id);
    titleFocus.request(id);
  }

  function menuFor(t: Thing): MenuEntry[] {
    const name = t.kind === 'campaign' ? t.c.name : t.kind === 'adventure' ? t.a.name : t.kind === 'session' ? t.s.name : t.name;
    const rename =
      t.kind === 'adventure'
        ? () => start({ kind: 'rename', what: 'adventure', was: t.a.name, files: [`${t.a.path}/adventure.md`] })
        : () => retitle(t.kind === 'campaign' ? t.c.card : t.kind === 'session' ? (t.s.log ?? t.s.plan!) : t.path);
    // A folder is archived only after every page open inside it is saved, and those pages
    // are then closed (code review, November 21). A save still waiting would otherwise land
    // at the old path after the move and make the archived folder again.
    const archiveFolder = async (folder: string) => {
      if (!(await saveAllUnder(folder))) throw new Error('A page in it could not be saved, so nothing was moved. The page says why.');
      await archivePath(fs, folder);
      for (const id of nav.panes.filter((p) => p.startsWith(folder + '/'))) nav.close(id);
    };
    const archive = async () => {
      if (t.kind === 'campaign') await archiveFolder(t.c.path);
      else if (t.kind === 'adventure') await archiveFolder(t.a.path);
      else if (t.kind === 'session') {
        for (const file of [t.s.log, t.s.plan]) if (file) await saveNow(file);
        await archiveSession(fs, t.s);
      } else await archivePath(fs, t.path);
    };
    return [
      { label: 'Rename', run: rename },
      ...(t.kind === 'rulebook' || t.kind === 'handout' ? [{ label: 'Open in a new window', run: () => toWindow(t.path) }] : []),
      'separator',
      { label: 'Archive', run: () => start({ kind: 'archive', what: t.kind, was: name, run: archive }) },
    ];
  }

  function rowMenu(e: MouseEvent, t: Thing, below = false) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    contextMenu.show(e, menuFor(t), below ? { x: r.left, y: r.bottom + 4 } : undefined);
  }

  // Each open page offers the same menu from its corner.
  $effect(() => {
    const ids = row.filter((id) => thingAt(id));
    for (const id of ids) pageActions.set(id, menuFor(thingAt(id)!));
    return () => {
      for (const id of ids) pageActions.clear(id);
    };
  });

  const isOpen = (id: string | null) => !!id && nav.panes.includes(id);
  const short = (played: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(played);
    return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${+m[3]}` : played;
  };
</script>

<div class="table">
  <div class="side" class:floating={!!ui.full}>
    {#if !ui.full}
    <nav class="sidebar" aria-label="Table">
      {#snippet more(t: Thing, name: string)}
        <button type="button" class="plus more" aria-label="What can be done with {name}" title="Rename or archive" aria-haspopup="menu" onclick={(e) => rowMenu(e, t, true)}>⋯</button>
      {/snippet}
      {#each campaigns as c (c.path)}
        <div class="head">
          <button type="button" class="item campaign" class:on={isOpen(c.card)} onclick={() => nav.open(c.card)} oncontextmenu={(e) => rowMenu(e, { kind: 'campaign', c })}>
            <span>{c.name}</span><span class="n">{c.role === 'gm' ? 'Narrator' : 'Player'}{c.system ? ` · ${c.system}` : ''}</span>
          </button>
          {@render more({ kind: 'campaign', c }, c.name)}
        </div>
        {#each c.adventures as a (a.path)}
          <div class="head d1">
            <button type="button" class="item fold" aria-expanded={!shut.includes(a.path)} onclick={() => fold(a.path)} oncontextmenu={(e) => rowMenu(e, { kind: 'adventure', c, a })}>
              <span><span class="arrow" aria-hidden="true">{shut.includes(a.path) ? '▸' : '▾'}</span> {a.name}</span>
            </button>
            {@render more({ kind: 'adventure', c, a }, a.name)}
          </div>
          {#if !shut.includes(a.path)}
            {#each a.sessions as s (s.stem)}
              <div class="head">
                <button type="button" class="item d2" class:on={isOpen(s.log) || isOpen(s.plan)} onclick={() => openSession(c, s)} oncontextmenu={(e) => rowMenu(e, { kind: 'session', c, s })}>
                  <span>{s.name}</span><span class="n">{short(s.played)}</span>
                </button>
                {@render more({ kind: 'session', c, s }, s.name)}
              </div>
            {/each}
            <button type="button" class="item d2 quiet" onclick={() => start({ kind: 'session', campaign: c, adventure: a })}>+ New session</button>
          {/if}
        {/each}
        <button type="button" class="item d1 quiet" onclick={() => start({ kind: 'adventure', campaign: c })}>+ New adventure</button>
        <button type="button" class="item d1 kept" class:on={isOpen(RUMORS + c.path)} onclick={() => nav.open(RUMORS + c.path)}><span>Rumors</span><span class="n">heard so far</span></button>
        <h3 class="label">Rulebooks</h3>
        {#each c.rules as r (r.path)}
          <div class="head">
            <button type="button" class="item d1 book" class:on={isOpen(r.path)} onclick={() => nav.open(r.path)} oncontextmenu={(e) => rowMenu(e, { kind: 'rulebook', ...r })} title={r.name}><span>{r.name}</span></button>
            {@render more({ kind: 'rulebook', ...r }, r.name)}
          </div>
        {/each}
        {#if inDesktopApp}<button type="button" class="item d1 quiet" onclick={() => addFiles(c, 'rules')}>+ Add a rulebook</button>{/if}
        <h3 class="label">Handouts</h3>
        {#each c.handouts as h (h.path)}
          <div class="head">
            <button type="button" class="item d1 book" class:on={isOpen(h.path)} onclick={() => nav.open(h.path)} oncontextmenu={(e) => rowMenu(e, { kind: 'handout', path: h.path, name: h.name })} title={h.name}><span>{h.name}</span><span class="n">{h.kind === 'pdf' ? 'PDF' : h.kind === 'picture' ? 'Picture' : 'Text'}</span></button>
            {@render more({ kind: 'handout', path: h.path, name: h.name }, h.name)}
          </div>
        {/each}
        <button type="button" class="item d1 quiet" onclick={() => start({ kind: 'handout', campaign: c })}>+ New text handout</button>
        {#if inDesktopApp}<button type="button" class="item d1 quiet" onclick={() => addFiles(c, 'handouts')}>+ Add PDFs or pictures</button>{/if}
        <div class="gap"></div>
      {:else}
        {#if loaded}<p class="hint">No campaigns yet.</p>{/if}
      {/each}
      <button type="button" class="item quiet" onclick={() => start({ kind: 'campaign' })}>+ New campaign</button>
    </nav>
    {/if}
    <Tray {fs} campaign={trayCampaign} />
  </div>

  {#if row.length}
    {#if view === 'protagonist'}<p class="showing" role="status">Protagonist view: showing what players may see. Plans and narrator-only text are put away, and pages are for reading.</p>{/if}
    {#if problem && !making}<p class="problem floating" role="alert">{problem} <button type="button" onclick={() => (problem = '')}>Dismiss</button></p>{/if}
    <Panes
      {nav}
      ids={row}
      {label}
      canWindow={(id) => !!(bookAt(id) ?? handoutAt(id))}
      onWindow={toWindow}
      isCard={(id) => {
        const e = index.get(id);
        return !!e?.imagePath && (e.picture ?? defaultShape(e.category, index.pictures ?? null)) === 'behind' && views.of(id).picture !== 'hide';
      }}>
      {#snippet pane(id, i, next, full)}
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
        {:else if bookAt(id)}
          {#key id}
            <RulebookPane {fs} path={id} name={bookAt(id)!.name} {full} onRename={(name) => renameFile(id, name)} />
          {/key}
        {:else if handoutAt(id)}
          {#key id}
            {#if handoutAt(id)!.kind === 'text'}
              <TextHandout {fs} {index} path={id} name={handoutAt(id)!.name} {next} fresh={fresh === id} reading={view === 'protagonist'} onOpen={(target) => nav.open(target, i)} onMakeEntry={(n) => (makingEntry = { name: n, after: i })} onChanged={refresh} />
            {:else if handoutAt(id)!.kind === 'pdf'}
              <RulebookPane {fs} path={id} name={handoutAt(id)!.name} {full} kind="Handout" onRename={(name) => renameFile(id, name)} />
            {:else}
              <HandoutPane {fs} path={id} name={handoutAt(id)!.name} onRename={(name) => renameFile(id, name)} />
            {/if}
          {/key}
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
              reading={view === 'protagonist'}
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
            <span class="kind">{c.role === 'gm' ? 'Narrator' : 'Player'}{c.system ? ` · ${c.system}` : ''}</span>
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
    title={making.kind === 'archive' ? `Archive this ${making.what}` : making.kind === 'rename' ? `Rename this ${making.what}` : making.kind === 'campaign' ? 'New campaign' : making.kind === 'adventure' ? 'New adventure' : making.kind === 'handout' ? 'New text handout' : 'New session'}
    action={making.kind === 'session' ? 'Start the session' : making.kind === 'rename' ? 'Rename' : making.kind === 'archive' ? 'Archive' : 'Create'}
    ready={making.kind === 'archive' || !!name.trim()}
    {busy}
    {problem}
    onSubmit={make}
    onCancel={() => (making = null)}>
    {#if making.kind === 'archive'}
      <p class="hint">“{making.was}” moves to an archive folder and leaves the app. The files are kept, so nothing is lost, and moving them back out of the archive folder restores it.</p>
    {:else}
    <label for="tb-name" class="label">Name</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="tb-name" type="text" bind:value={name} autofocus autocomplete="off" placeholder={making.kind === 'campaign' ? 'The Salt Ledger' : making.kind === 'adventure' ? 'The first winter' : making.kind === 'handout' ? 'A letter from the Earl' : 'Session 1'} />
    {/if}
    {#if making.kind === 'campaign'}
      <label for="tb-role" class="label">I am</label>
      <select id="tb-role" bind:value={role}>
        <option value="player">A player</option>
        <option value="gm">The narrator</option>
      </select>
      <label for="tb-game" class="label">The game</label>
      <select id="tb-game" bind:value={game}>
        <option value="other">Another game</option>
        <option value="own">This world's own game</option>
      </select>
      {#if game === 'other'}
        <input type="text" bind:value={system} aria-label="The game's name" autocomplete="off" placeholder="The game's name, such as Lantern and Ledger" />
      {/if}
    {:else if making.kind === 'rename'}
      <p class="hint">The new name shows everywhere in the app. The files on disk keep the names they have.</p>
    {:else if making.kind === 'handout'}
      <p class="hint">A page for words, such as a message from the narrator pasted in from a chat. It is kept with {making.campaign.name}'s handouts.</p>
    {:else if making.kind === 'adventure'}
      <p class="hint">An adventure is one stretch of {making.campaign.name}: a story, a year, or whatever the table calls it. Its sessions go inside it.</p>
    {:else if making.kind === 'session'}
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
  /* In full screen the tree is put away and the tray stays, in a corner, so a roll is
     always one click off (Mike's design pass, November 15). */
  .side.floating {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 30;
    width: 280px;
    border: 0;
    border-radius: var(--round-box);
    background: var(--surface);
    box-shadow: var(--lift, 0 10px 30px var(--shadow));
  }
  .side {
    box-sizing: border-box;
    width: 290px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--line);
  }
  .sidebar {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
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
    padding: 4px 18px;
    min-height: 28px;
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
  .sidebar .label {
    margin: 14px 0 2px;
    padding-left: 30px;
    font-size: calc(10px * var(--type));
    color: var(--muted);
  }
  .kept {
    margin-top: 6px;
  }
  .book {
    font-size: calc(14px * var(--type));
    color: var(--text-soft);
  }
  .quiet {
    color: var(--muted);
    font-size: calc(13px * var(--type));
  }
  .arrow {
    color: var(--muted);
    font-size: 0.8em;
  }
  .more {
    width: 30px;
    flex-shrink: 0;
    font-size: calc(14px * var(--type));
    opacity: 0;
  }
  .head:hover .more,
  .more:focus-visible {
    opacity: 1;
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
    font-size: calc(var(--title-size) * var(--type));
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
    background: var(--well);
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
  .showing {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 12px;
    z-index: 5;
    margin: 0;
    padding: 6px 14px;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    background: var(--surface);
    border-radius: 999px;
    box-shadow: 0 4px 14px var(--shadow);
  }
  .floating {
    position: fixed;
    left: 310px;
    bottom: 14px;
    z-index: 5;
    margin: 0;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .floating button {
    margin-left: 10px;
    font: inherit;
    color: var(--text-soft);
    background: none;
    border: 0;
    text-decoration: underline;
  }
</style>
