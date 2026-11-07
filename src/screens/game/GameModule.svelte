<script lang="ts">
  import { onMount } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import { splitHeader } from '../../lib/world';
  import { newElement, writeElement, type Element } from '../../lib/game/elements';
  import { gameFileWith, loadGame, pathIn, refOf, sourceOf, type Game, type GameFs, type Origin, type Placed, type Source } from '../../lib/game/game';
  import { ui } from '../../lib/ui.svelte';
  import Panes from '../Panes.svelte';
  import GameKind from './GameKind.svelte';
  import GameElement from './GameElement.svelte';

  /**
   * The Game module (Mike, November 7): a tabletop game's rules, kept as separate
   * elements. The sidebar lists the kinds of element in the engine and in this world, a
   * kind opens as a list, and an element opens as a form. Core elements belong to the
   * engine and appear in every game built on it. This world's own elements, and its
   * choices about the core ones, live in its game folder.
   */
  let {
    fs,
    nav,
    worldName,
    engineRel,
    gameDir,
    openEngine,
  }: {
    fs: WorldFs;
    nav: Navigator;
    worldName: string;
    /** The engine's folder, as a path from the library's top, or '' for none. */
    engineRel: string;
    gameDir: string;
    openEngine: (rel: string | null) => Promise<GameFs | null>;
  } = $props();

  const KIND = '@kind:';
  const EL = '@el:';

  let game = $state.raw<Game | null>(null);
  let engineName = $state('Engine');
  let problem = $state('');
  let filter = $state('');

  async function load() {
    try {
      let engine: Source | null = null;
      problem = '';
      if (engineRel) {
        try {
          const efs = await openEngine(engineRel);
          if (efs) {
            const md = (await efs.exists('engine.md')) ? await efs.readText('engine.md') : '';
            const { header, body } = splitHeader(md);
            engineName = (typeof header.name === 'string' && header.name.trim()) || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || 'Engine';
            engine = { origin: 'engine', name: engineName, fs: efs, dir: '' };
          }
        } catch (e) {
          problem = `This world's engine, ${engineRel}, could not be opened: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else {
        await openEngine(null).catch(() => {});
      }
      game = await loadGame(engine, { origin: 'world', name: worldName, fs, dir: gameDir });
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    return fs.onChange((paths) => {
      if (!paths.some((p) => p.startsWith(gameDir + '/'))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 400);
    });
  });

  const byKey = $derived(new Map((game?.elements ?? []).map((p) => [p.key, p])));
  const kindsIn = (origin: Origin) =>
    [...(game?.kinds.values() ?? [])]
      .map((k) => ({ kind: k, count: (game?.elements ?? []).filter((p) => p.origin === origin && p.element.kind === k.id).length }))
      // The engine lists the kinds it has elements of, such as no vendors, which each world
      // writes for itself (Mike, November 7). The world lists every kind, so it can add to any.
      .filter((x) => origin === 'world' || x.count > 0)
      .sort((a, b) => a.kind.plural.localeCompare(b.kind.plural));
  const engineKinds = $derived(game?.engine ? kindsIn('engine') : []);
  const worldKinds = $derived(game ? kindsIn('world') : []);
  const vendors = $derived((game?.elements ?? []).filter((p) => p.origin === 'world' && p.element.kind === 'vendor').map((p) => ({ id: p.element.id, name: p.element.name })));
  const results = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !game) return [];
    return game.elements.filter((p) => p.element.name.toLowerCase().includes(q) || p.element.tags.some((t) => t.toLowerCase() === q)).slice(0, 60);
  });

  const row = $derived(nav.panes.filter((id) => (id.startsWith(EL) && byKey.has(id.slice(EL.length))) || (id.startsWith(KIND) && game?.kinds.has(id.split(':')[2]))));

  function label(id: string): string {
    if (id.startsWith(EL)) return byKey.get(id.slice(EL.length))?.element.name ?? 'Element';
    const [, origin, kind] = id.split(':');
    return `${game?.kinds.get(kind)?.plural ?? kind} (${origin === 'engine' ? engineName : worldName})`;
  }

  const openKind = (origin: Origin, kind: string, from?: number) => nav.open(`${KIND}${origin}:${kind}`, from);
  const openElement = (key: string, from?: number) => nav.open(`${EL}${key}`, from);

  /** Replaces one element in the game after it is written, so every pane sees the change. */
  function swap(p: Placed, next: Element) {
    if (!game) return;
    p.element = next;
    game = { ...game, elements: [...game.elements] };
  }

  async function save(p: Placed, next: Element) {
    if (!game) return;
    const src = sourceOf(game, p);
    await src.fs.writeText(pathIn(src, next.path), writeElement(next, game.kinds.get(next.kind) ?? null));
    swap(p, next);
  }

  async function add(origin: Origin, kindId: string, name: string, from: number) {
    if (!game) return;
    const kind = game.kinds.get(kindId)!;
    const taken = new Set(game.elements.filter((p) => p.origin === origin).map((p) => refOf(p.element)));
    const e = newElement(name, kind, taken);
    if (origin === 'engine') e.tags = ['core', kind.id];
    const src: Source = origin === 'engine' && game.engine ? game.engine : game.world;
    await src.fs.writeText(pathIn(src, e.path), writeElement(e, kind));
    await load();
    openElement(`${origin}:${refOf(e)}`, from);
  }

  async function setAside(p: Placed, on: boolean) {
    if (!game) return;
    const file = `${gameDir}/game.md`;
    const source = (await fs.exists(file)) ? await fs.readText(file) : null;
    const list = new Set(game.setAside);
    if (on) list.add(refOf(p.element));
    else list.delete(refOf(p.element));
    await fs.writeText(file, gameFileWith(source, [...list].sort()));
    await load();
  }

  async function reskin(p: Placed, from: number) {
    if (!game) return;
    const kind = game.kinds.get(p.element.kind)!;
    const taken = new Set(game.elements.filter((x) => x.origin === 'world').map((x) => refOf(x.element)));
    const e = newElement(p.element.name, kind, taken);
    e.tags = p.element.tags.filter((t) => t.toLowerCase() !== 'core');
    e.reskins = refOf(p.element);
    e.flavor = p.element.flavor;
    await fs.writeText(`${gameDir}/${e.path}`, writeElement(e, kind));
    await load();
    openElement(`world:${refOf(e)}`, from);
  }

  const count = (origin: Origin) => (game?.elements ?? []).filter((p) => p.origin === origin).length;
</script>

<div class="game">
  {#if !ui.full}
    <nav class="sidebar" aria-label="Game">
      <input class="find" type="search" placeholder="Find an element" bind:value={filter} aria-label="Find an element" />
      {#if filter.trim()}
        <h2 class="label">Found</h2>
        {#each results as p (p.key)}
          <button type="button" class="item" onclick={() => openElement(p.key)}>
            <span>{p.element.name}</span><span class="n">{game?.kinds.get(p.element.kind)?.name ?? p.element.kind}</span>
          </button>
        {:else}
          <p class="hint">Nothing by that name or tag.</p>
        {/each}
      {:else}
        {#if game?.engine}
          <h2 class="label">{engineName}</h2>
          {#each engineKinds as { kind, count } (kind.id)}
            <button type="button" class="item" class:on={nav.panes.includes(`${KIND}engine:${kind.id}`)} onclick={() => openKind('engine', kind.id)}>
              <span>{kind.plural}</span><span class="n">{count}</span>
            </button>
          {/each}
        {/if}
        <h2 class="label">{worldName}</h2>
        {#each worldKinds as { kind, count } (kind.id)}
          <button type="button" class="item" class:empty={count === 0} class:on={nav.panes.includes(`${KIND}world:${kind.id}`)} onclick={() => openKind('world', kind.id)}>
            <span>{kind.plural}</span><span class="n">{count}</span>
          </button>
        {:else}
          <p class="hint">No elements of this world's own yet. Open a kind above and add one, or a world can bring kinds of its own in its game folder.</p>
        {/each}
      {/if}
    </nav>
  {/if}
  {#if row.length && game}
    <Panes {nav} ids={row} {label} canWindow={() => false}>
      {#snippet pane(id, i)}
        {#if id.startsWith(KIND)}
          {@const [, origin, kindId] = id.split(':')}
          {@const kind = game!.kinds.get(kindId)!}
          <GameKind
            {kind}
            where={origin === 'engine' ? engineName : worldName}
            {worldName}
            elements={game!.elements.filter((p) => p.origin === origin && p.element.kind === kindId)}
            onOpen={(key) => openElement(key, i)}
            onNew={(name) => add(origin as Origin, kindId, name, i)} />
        {:else}
          {@const p = byKey.get(id.slice(EL.length))!}
          {#key p.key}
            <GameElement
              placed={p}
              kind={game!.kinds.get(p.element.kind) ?? null}
              {engineName}
              {worldName}
              {vendors}
              onSave={(next) => save(p, next)}
              onSetAside={(on) => setAside(p, on)}
              onReskin={() => reskin(p, i)}
              onOpen={(key) => openElement(key, i)} />
          {/key}
        {/if}
      {/snippet}
    </Panes>
  {:else}
    <main class="home">
      <h1>Game</h1>
      {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
      <p>
        A game's rules, kept as separate elements: each aspect and each rule is one file with its own fields. Core elements belong to
        {game?.engine ? engineName : 'an engine'} and appear in every game built on it, and {worldName} adds its own.
      </p>
      {#if game}
        <div class="cards">
          {#if game.engine}
            <div class="card">
              <span class="kind">Engine</span><span class="name">{engineName}</span>
              <span class="n">{count('engine')} core elements · {engineKinds.length} kinds</span>
            </div>
          {/if}
          <div class="card">
            <span class="kind">World</span><span class="name">{worldName}</span>
            <span class="n">{count('world')} elements of its own{game.setAside.size ? ` · ${game.setAside.size} core set aside` : ''}</span>
          </div>
        </div>
        {#if !game.engine && !problem}
          <p class="hint">
            This world names no engine. A world's game is built on an engine when its <code>world.md</code> says where the engine's folder is, as a path
            from the top of the library, such as <code>engine: games/example-engine</code>. The engine folder holds an <code>engine.md</code>.
          </p>
        {/if}
      {/if}
    </main>
  {/if}
</div>

<style>
  .game {
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
  .find {
    display: block;
    width: calc(100% - 36px);
    margin: 4px 18px 8px;
    box-sizing: border-box;
    font: inherit;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
  }
  .sidebar .label {
    margin: 16px 18px 6px;
    font-size: calc(11px * var(--type));
  }
  .item {
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
    padding: 7px 18px;
    min-height: 34px;
  }
  .item:hover {
    background: var(--surface);
  }
  .item.empty {
    color: var(--muted);
  }
  .item.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
    box-shadow: inset 2px 0 0 var(--selected-border);
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
  .home .hint {
    margin: 18px 0 0;
  }
  .problem {
    color: var(--danger) !important;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
    margin-top: 24px;
    max-width: 760px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 18px 16px;
    min-height: 110px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--round-box);
  }
  .kind {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--structure);
  }
  .card .name {
    font-family: var(--font-display);
    font-size: calc(30px * var(--type));
    line-height: 1.05;
    color: var(--title);
  }
</style>
