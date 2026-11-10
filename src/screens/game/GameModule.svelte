<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import type { WikiIndex } from '../../lib/index/wiki';
  import { gameScanner, isGameLink, GAME_LINK } from '../../lib/game/links';
  import { GAME_LINKS, type GameLinks } from './links';
  import { views } from '../../lib/view.svelte';
  import type { WorldFs, ImageSource } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import { splitHeader, withHeader } from '../../lib/world';
  import { newElement, writeElement, type Element } from '../../lib/game/elements';
  import {
    bookTree,
    gameFileWith,
    isExpansion,
    keyOf,
    loadGame,
    pathIn,
    pictureOf,
    refOf,
    sourceOf,
    withBody,
    type DivisionNode,
    type Game,
    type GameFs,
    type BookOrigin,
    type Origin,
    type Placed,
    type SectionNode,
    type Source,
  } from '../../lib/game/game';
  import { readFrame, writeFrame, type Frame } from '../../lib/index/frame';
  import { ui } from '../../lib/ui.svelte';
  import Panes from '../Panes.svelte';
  import GameKind from './GameKind.svelte';
  import GameElement from './GameElement.svelte';
  import BookTree from './BookTree.svelte';
  import FrontPage from './FrontPage.svelte';
  import SectionPage from './SectionPage.svelte';
  import RulePage from './RulePage.svelte';
  import type { PictureChoice } from './GameBanner.svelte';

  /**
   * The Game module (Mike, November 7 and 9): a tabletop game's rules, kept as separate
   * elements and read as a book. The sidebar shows the book as a tree: its front page,
   * its divisions, their rule sections, and the rules. A rule opens for writing, with the
   * core text and, in a world's book, the world's own text below it. Core elements belong
   * to the engine and appear in every game built on it; this world's own elements, and
   * its choices about the core ones, live in its game folder.
   */
  let {
    fs,
    nav,
    index = null,
    worldName,
    engineRel,
    gameDir,
    openEngine,
  }: {
    fs: WorldFs;
    nav: Navigator;
    /** The world's wiki, whose names the world's game text links. */
    index?: WikiIndex | null;
    worldName: string;
    /** The engine's folder, as a path from the library's top, or '' for none. */
    engineRel: string;
    gameDir: string;
    openEngine: (rel: string | null) => Promise<GameFs | null>;
  } = $props();

  const FRONT = '@front:';
  const DIV = '@div:';
  const SEC = '@sec:';
  const RULE = '@rule:';
  const CAT = '@cat:';
  const EL = '@el:';
  const KIND = '@kind:';
  const EXP = '@exp:';

  let game = $state.raw<Game | null>(null);
  let engineName = $state('Engine');
  let problem = $state('');
  let notice = $state('');
  let filter = $state('');
  let allOpen = $state(false);
  let naming = $state(false);
  let newName = $state('');

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
  const expansionOf = (origin: Origin) => game?.expansions.find((x) => x.origin === origin) ?? null;
  /** The engine's, the world's, or an expansion's name. */
  const originName = (origin: Origin) => (origin === 'engine' ? engineName : origin === 'world' ? worldName : (expansionOf(origin)?.name ?? origin));
  // Where a world's own element can live: the world itself or one of its expansions (Mike, November 9).
  const homes = $derived([{ origin: 'world', name: worldName }, ...(game?.expansions ?? []).map((x) => ({ origin: x.origin, name: x.name }))]);
  const MOVABLE = (kind: string) => !['module', 'chapter', 'division', 'add-on'].includes(kind);

  // The book open in the sidebar: the world's own, unless the writer switches to the base game.
  let chosen = $state<BookOrigin | null>(null);
  const bookOrigin = $derived<BookOrigin | null>(chosen && game?.books[chosen] ? chosen : game?.books.world ? 'world' : game?.books.engine ? 'engine' : null);
  const inWorld = $derived(bookOrigin === 'world');
  const tree = $derived(game && bookOrigin ? bookTree(game, bookOrigin) : null);
  const bookSource = $derived<Source | null>(game ? (bookOrigin === 'engine' ? game.engine : game.world) : null);

  // Where each section and rule sits, for a page's place line.
  const places = $derived.by(() => {
    const sectionIn = new Map<string, DivisionNode>();
    const ruleIn = new Map<string, SectionNode>();
    const sections = new Map<string, SectionNode>();
    for (const d of tree?.divisions ?? []) for (const s of d.sections) sectionIn.set(s.placed.key, d);
    for (const s of [...(tree?.front ?? []), ...(tree?.divisions ?? []).flatMap((d) => d.sections), ...(tree?.loose ?? []), ...(tree?.back ?? [])]) {
      sections.set(s.placed.key, s);
      for (const i of s.items) if (i.type === 'rule') ruleIn.set(i.placed.key, s);
    }
    return { sectionIn, ruleIn, sections };
  });
  const catalogOf = (kind: string) => (tree?.divisions ?? []).flatMap((d) => d.catalog).find((c) => c.kind.id === kind) ?? null;

  const kindsIn = (origin: Origin) =>
    [...(game?.kinds.values() ?? [])]
      .map((k) => ({ kind: k, count: (game?.elements ?? []).filter((p) => p.origin === origin && p.element.kind === k.id).length }))
      .filter((x) => origin === 'world' || x.count > 0)
      .sort((a, b) => a.kind.plural.localeCompare(b.kind.plural));
  const engineKinds = $derived(game?.engine ? kindsIn('engine') : []);
  const worldKinds = $derived(game ? kindsIn('world') : []);
  const vendors = $derived((game?.elements ?? []).filter((p) => p.origin !== 'engine' && p.element.kind === 'vendor').map((p) => ({ id: p.element.id, name: p.element.name })));
  const results = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !game) return [];
    return game.elements.filter((p) => p.element.name.toLowerCase().includes(q) || p.element.tags.some((t) => t.toLowerCase() === q)).slice(0, 60);
  });

  const keyIn = (id: string) => id.slice(id.indexOf(':', 1) + 1);
  const row = $derived(
    nav.panes.filter((id) => {
      if (!game) return false;
      if (id.startsWith(FRONT)) return id === `${FRONT}${bookOrigin}` && !!tree;
      if (id.startsWith(CAT)) return !!catalogOf(keyIn(id));
      if (id.startsWith(KIND)) return game.kinds.has(id.split(':')[2]);
      if (id.startsWith(EXP)) return !!expansionOf(keyIn(id));
      if (id.startsWith(SEC)) return places.sections.has(keyIn(id));
      return [DIV, RULE, EL].some((pre) => id.startsWith(pre)) && byKey.has(keyIn(id));
    }),
  );

  function label(id: string): string {
    if (id.startsWith(FRONT)) return tree?.book.name ?? 'Book';
    if (id.startsWith(CAT)) return catalogOf(keyIn(id))?.kind.plural ?? 'Aspects';
    if (id.startsWith(KIND)) {
      const [, origin, kind] = id.split(':');
      return `${game?.kinds.get(kind)?.plural ?? kind} (${originName(origin)})`;
    }
    if (id.startsWith(EXP)) return expansionOf(keyIn(id))?.name ?? 'Expansion';
    return byKey.get(keyIn(id))?.element.name ?? 'Element';
  }

  const openElement = (key: string, from?: number) => nav.open(`${EL}${key}`, from);

  // Game text links the game's terms and, in a world's book, the world's names (Mike,
  // November 10). A term opens its rule, section, or aspect here, and a name opens its
  // wiki entry in the World module.
  const linkScanner = $derived(
    gameScanner(
      (game?.elements ?? []).map((p) => ({ key: p.key, name: p.element.name, kind: p.element.kind, origin: p.origin })),
      [...(index?.entries.values() ?? [])].map((e) => ({ id: e.id, name: e.name, aliases: e.aliases })),
      bookOrigin === 'engine' ? 'engine' : 'world',
    ),
  );
  function openLink(id: string) {
    if (!isGameLink(id)) return nav.openIn('world', id);
    const key = id.slice(GAME_LINK.length);
    if (!byKey.has(key)) return;
    const pre = places.sections.has(key) ? SEC : places.ruleIn.has(key) ? RULE : tree?.divisions.some((d) => d.placed.key === key) ? DIV : EL;
    nav.open(`${pre}${key}`);
  }
  setContext<GameLinks>(GAME_LINKS, {
    get scanner() {
      return linkScanner;
    },
    open: openLink,
  });

  // A page's view can put its picture away (lib/view.svelte.ts).
  const pictured = (id: string) => [FRONT, DIV, SEC, RULE].some((pre) => id.startsWith(pre));
  function shown<T>(id: string, picture: T | null): T | null {
    return views.of(id).picture ? picture : null;
  }

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

  const list = (p: Placed, field: string): string[] => {
    const v = p.element.fields[field];
    return Array.isArray(v) ? [...v] : [];
  };
  const withList = (p: Placed, field: string, items: string[]): Element => ({ ...p.element, fields: { ...p.element.fields, [field]: items } });

  /** Writes this world's piece of a core element, creating its add-on file the first time. */
  async function worldPieceOf(p: Placed): Promise<Placed> {
    if (!game) throw new Error('The game is not open');
    const existing = game.addOns.get(refOf(p.element));
    if (existing) return existing;
    await writeAddOn(game.world, p, refOf(p.element));
    return game!.addOns.get(refOf(p.element))!;
  }

  /** An expansion's piece of a core or world element, created the first time. */
  async function expansionPieceOf(p: Placed, origin: Origin): Promise<Placed> {
    if (!game) throw new Error('The game is not open');
    const find = () => game!.pieces.get(p.key)?.find((x) => x.origin === origin);
    const existing = find();
    if (existing) return existing;
    const src = expansionOf(origin);
    if (!src) throw new Error(`There is no expansion called ${origin}.`);
    await writeAddOn(src, p, p.origin === 'engine' ? refOf(p.element) : p.key);
    return find()!;
  }

  async function writeAddOn(src: Source, p: Placed, extendsRef: string) {
    const kind = game?.kinds.get('add-on') ?? null;
    // A module's add-on is named for the module; any other kind's carries its kind first.
    const id = (p.element.kind === 'module' ? p.element.id : `${p.element.kind}-${p.element.id}`) + (p.origin === 'world' && src.origin !== 'world' ? '-world' : '');
    const e: Element = { path: `elements/add-on/${id}.md`, id, name: p.element.name, kind: 'add-on', tags: ['add-on'], vendor: '', reskins: '', fields: { extends: extendsRef }, flavor: '' };
    await src.fs.writeText(pathIn(src, e.path), writeElement(e, kind));
    await load();
  }

  async function savePiece(p: Placed, origin: Origin, text: string) {
    const piece = await expansionPieceOf(p, origin);
    await save(piece, { ...piece.element, flavor: text });
  }

  /** Moves a world's own element into an expansion, or back (Mike, November 9). */
  async function moveTo(p: Placed, origin: Origin, from: number) {
    if (!game || origin === p.origin) return;
    const src = sourceOf(game, p);
    const target: Source | null = origin === 'world' ? game.world : expansionOf(origin);
    if (!target) return;
    const taken = new Set(game.elements.filter((x) => x.origin === origin).map((x) => refOf(x.element)));
    let id = p.element.id;
    for (let n = 2; taken.has(`${p.element.kind}/${id}`); n++) id = `${p.element.id}-${n}`;
    const path = `elements/${p.element.kind}/${id}.md`;
    await src.fs.move(pathIn(src, p.element.path), pathIn(target, path));
    if (p.image) await src.fs.move(pathIn(src, p.image), pathIn(target, `elements/${p.element.kind}/${id}${p.image.slice(p.image.lastIndexOf('.'))}`));
    await load();
    nav.replace(`${EL}${p.key}`, `${EL}${origin}:${p.element.kind}/${id}`);
    void from;
  }

  async function saveExpansion(x: Source, changes: { name: string; body: string }) {
    const file = `${x.dir}/expansion.md`;
    const text = withBody(withHeader(await fs.readText(file), { name: changes.name }), changes.body);
    await fs.writeText(file, text);
    if (!game) return;
    game = { ...game, expansions: game.expansions.map((e) => (e.origin === x.origin ? { ...e, name: changes.name, about: changes.body } : e)) };
  }

  async function addExpansion(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !game) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'expansion';
    if (['engine', 'world', 'heading'].includes(id) || expansionOf(id)) {
      notice = `${worldName} already has an expansion called ${name}, or the name is taken.`;
      return;
    }
    await fs.writeText(`${gameDir}/expansions/${id}/expansion.md`, `---\nname: ${JSON.stringify(name)}\n---\n`);
    naming = false;
    newName = '';
    await load();
    nav.open(`${EXP}${id}`);
  }

  async function saveWorldPiece(p: Placed, text: string) {
    const piece = await worldPieceOf(p);
    await save(piece, { ...piece.element, flavor: text });
  }

  // Pictures: a file beside the element with the same name. A world's own picture for a
  // core element sits beside the world's piece of it.
  const stemOf = (path: string) => path.replace(/\.md$/i, '');

  async function setPicture(owner: Placed, image: ImageSource) {
    if (!game) return;
    const src = sourceOf(game, owner);
    await src.fs.setImage(pathIn(src, stemOf(owner.element.path)), image);
    await load();
  }

  async function archive(src: Source, path: string) {
    const name = path.split('/').pop()!;
    const dot = name.lastIndexOf('.');
    let target = pathIn(src, `archive/${name}`);
    for (let n = 2; await src.fs.exists(target); n++) target = pathIn(src, `archive/${name.slice(0, dot)}-${n}${name.slice(dot)}`);
    await src.fs.move(pathIn(src, path), target);
  }

  async function removePicture(owner: Placed) {
    if (!game || !owner.image) return;
    await archive(sourceOf(game, owner), owner.image);
    await load();
  }

  function pictureFor(p: Placed) {
    if (!game) return null;
    const pic = pictureOf(game, p, inWorld);
    return pic ? { url: pic.src.fs.imageUrl(pathIn(pic.src, pic.path)), frame: readFrame(pic.owner.element.fields.banner_frame) } : null;
  }

  function choicesFor(p: Placed): PictureChoice[] {
    if (!game) return [];
    const piece = game.addOns.get(refOf(p.element)) ?? null;
    const core: PictureChoice = { label: inWorld && p.origin === 'engine' ? `${engineName} picture` : 'picture', set: (image) => setPicture(p, image), remove: p.image ? () => removePicture(p) : null };
    if (!(inWorld && p.origin === 'engine')) return [core];
    return [
      core,
      {
        label: `${worldName} picture`,
        set: async (image) => setPicture(await worldPieceOf(p), image),
        remove: piece?.image ? () => removePicture(piece) : null,
      },
    ];
  }

  async function saveFrame(p: Placed, frame: Frame) {
    if (!game) return;
    const owner = pictureOf(game, p, inWorld)?.owner ?? p;
    const fields = { ...owner.element.fields };
    const value = writeFrame(frame);
    if (value) fields.banner_frame = value;
    else delete fields.banner_frame;
    await save(owner, { ...owner.element, fields });
  }

  // The book's own front page lives in `book.md`, beside its divisions.
  async function saveBook(changes: { name?: string; body?: string; frame?: Frame }) {
    if (!game || !bookSource || !bookOrigin) return;
    const file = pathIn(bookSource, 'book.md');
    let text = await bookSource.fs.readText(file);
    if (changes.name !== undefined) text = withHeader(text, { name: changes.name });
    if (changes.frame !== undefined) text = withHeader(text, { banner_frame: writeFrame(changes.frame) });
    if (changes.body !== undefined) text = withBody(text, changes.body);
    await bookSource.fs.writeText(file, text);
    const book = game.books[bookOrigin]!;
    const next = { ...book, name: changes.name ?? book.name, body: changes.body ?? book.body, frame: changes.frame ? (writeFrame(changes.frame) ?? '') : book.frame };
    game = { ...game, books: { ...game.books, [bookOrigin]: next } };
  }

  const bookPicture = $derived(tree?.book.image && bookSource ? { url: bookSource.fs.imageUrl(pathIn(bookSource, tree.book.image)), frame: readFrame(tree.book.frame) } : null);
  const bookChoices = $derived<PictureChoice[]>(
    bookSource && tree
      ? [
          {
            label: 'picture',
            set: async (image) => {
              await bookSource!.fs.setImage(pathIn(bookSource!, 'book'), image);
              await load();
            },
            remove: tree.book.image
              ? async () => {
                  await archive(bookSource!, tree!.book.image!);
                  await load();
                }
              : null,
          },
        ]
      : [],
  );

  // Moving and adding in the tree. A rule of the world's own stays in the world's
  // sections, and a section of the world's own in the world's divisions, so a core
  // section or division never names something only one world has.
  async function moveRule(ruleKey: string, fromKey: string, toKey: string, before: string | null) {
    const rule = byKey.get(ruleKey);
    const from = byKey.get(fromKey);
    const to = byKey.get(toKey);
    if (!rule || !from || !to || ruleKey === before) return;
    if (to.origin === 'engine' && rule.origin === 'world') {
      notice = `${rule.element.name} is ${worldName}'s own rule, so it can go into ${worldName}'s sections but not a core one.`;
      return;
    }
    notice = '';
    const without = (p: Placed) => list(p, 'items').filter((r) => keyOf(r, p.origin) !== ruleKey);
    const target = without(to);
    const at = before ? target.findIndex((r) => keyOf(r, to.origin) === before) : -1;
    if (at < 0) target.push(ruleKey);
    else target.splice(at, 0, ruleKey);
    if (from !== to) await save(from, withList(from, 'items', without(from)));
    await save(to, withList(to, 'items', target));
  }

  async function moveSection(secKey: string, fromKey: string | null, toKey: string, before: string | null) {
    if (!game || !bookSource) return;
    const sec = byKey.get(secKey);
    const to = byKey.get(toKey);
    if (!sec || !to || secKey === before) return;
    if (to.origin === 'engine' && sec.origin === 'world') {
      notice = `${sec.element.name} is ${worldName}'s own section, so it belongs in ${worldName}'s book.`;
      return;
    }
    notice = '';
    const target = list(to, 'sections').filter((r) => keyOf(r, to.origin) !== secKey);
    const at = before ? target.findIndex((r) => keyOf(r, to.origin) === before) : -1;
    if (at < 0) target.push(secKey);
    else target.splice(at, 0, secKey);
    const from = fromKey ? byKey.get(fromKey) : null;
    if (from && from !== to) await save(from, withList(from, 'sections', list(from, 'sections').filter((r) => keyOf(r, from.origin) !== secKey)));
    if (!fromKey) {
      // A section from before divisions leaves the book's loose list.
      const file = pathIn(bookSource, 'book.md');
      const book = game.books[bookOrigin!]!;
      const rest = book.chapters.filter((r) => keyOf(r, bookOrigin!) !== secKey);
      await bookSource.fs.writeText(file, withHeader(await bookSource.fs.readText(file), { chapters: rest.length ? rest : undefined }));
    }
    await save(to, withList(to, 'sections', target));
    if (!fromKey) await load();
  }

  async function addElement(origin: Origin, kindId: string, name: string): Promise<string> {
    if (!game) throw new Error('The game is not open');
    const kind = game.kinds.get(kindId);
    if (!kind) throw new Error(`This game has no ${kindId} kind yet.`);
    const taken = new Set(game.elements.filter((p) => p.origin === origin).map((p) => refOf(p.element)));
    const e = newElement(name, kind, taken);
    e.tags = origin === 'engine' ? ['core', kind.id] : isExpansion(origin) ? [origin, kind.id] : [kind.id];
    const src: Source = origin === 'engine' && game.engine ? game.engine : (expansionOf(origin) ?? game.world);
    await src.fs.writeText(pathIn(src, e.path), writeElement(e, kind));
    return `${origin}:${refOf(e)}`;
  }

  async function addRule(secKey: string, name: string) {
    const sec = byKey.get(secKey);
    if (!sec) return;
    const key = await addElement(sec.origin, 'module', name);
    await save(sec, withList(sec, 'items', [...list(sec, 'items'), key]));
    await load();
    nav.open(`${RULE}${key}`);
  }

  async function addSection(divKey: string, name: string) {
    const div = byKey.get(divKey);
    if (!div) return;
    const key = await addElement(div.origin, 'chapter', name);
    await save(div, withList(div, 'sections', [...list(div, 'sections'), key]));
    await load();
    nav.open(`${SEC}${key}`);
  }

  async function add(origin: Origin, kindId: string, name: string, from: number) {
    const key = await addElement(origin, kindId, name);
    await load();
    openElement(key, from);
  }

  async function setAside(p: Placed, on: boolean) {
    if (!game) return;
    const file = `${gameDir}/game.md`;
    const source = (await fs.exists(file)) ? await fs.readText(file) : null;
    const set = new Set(game.setAside);
    if (on) set.add(refOf(p.element));
    else set.delete(refOf(p.element));
    await fs.writeText(file, gameFileWith(source, [...set].sort()));
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
  const bookLabel = (origin: Origin) => (origin === 'world' ? worldName : engineName);
</script>

<div class="game">
  {#if !ui.full}
    <nav class="sidebar" aria-label="Game">
      <input class="find" type="search" placeholder="Find an element" bind:value={filter} aria-label="Find an element" />
      {#if notice}
        <p class="notice" role="status">{notice} <button type="button" onclick={() => (notice = '')}>OK</button></p>
      {/if}
      {#if filter.trim()}
        <h2 class="label">Found</h2>
        {#each results as p (p.key)}
          <button type="button" class="item" onclick={() => (p.element.kind === 'module' ? nav.open(`${RULE}${p.key}`) : openElement(p.key))}>
            <span>{p.element.name}</span><span class="n">{game?.kinds.get(p.element.kind)?.name ?? p.element.kind}</span>
          </button>
        {:else}
          <p class="hint">Nothing by that name or tag.</p>
        {/each}
      {:else}
        {#if game?.books.world && game.books.engine}
          <div class="books" role="group" aria-label="Which book">
            {#each ['world', 'engine'] as const as o (o)}
              <button type="button" class:on={bookOrigin === o} aria-pressed={bookOrigin === o} onclick={() => (chosen = o)}>{bookLabel(o)}</button>
            {/each}
          </div>
        {/if}
        {#if tree}
          <BookTree
            {tree}
            {worldName}
            open={nav.panes}
            onOpen={(id) => nav.open(id)}
            onMoveRule={(r, f, t, b) => void moveRule(r, f, t, b).catch((e) => (notice = String(e)))}
            onMoveSection={(sec, f, t, b) => void moveSection(sec, f, t, b).catch((e) => (notice = String(e)))}
            names={originName}
            onAddRule={addRule}
            onAddSection={addSection} />
        {/if}
        {#if game && (game.expansions.length || bookOrigin === 'world')}
          <h2 class="label">Expansions</h2>
          {#each game.expansions as x (x.origin)}
            <button type="button" class="item" class:on={nav.panes.includes(`${EXP}${x.origin}`)} onclick={() => nav.open(`${EXP}${x.origin}`)}>
              <span>{x.name}</span><span class="n">{game.elements.filter((p) => p.origin === x.origin && p.element.kind !== 'add-on').length}</span>
            </button>
          {/each}
          {#if naming}
            <form class="new-exp" onsubmit={addExpansion}>
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={newName} placeholder="Name the expansion" aria-label="New expansion name" autofocus onkeydown={(e) => e.key === 'Escape' && (naming = false)} />
            </form>
          {:else}
            <button type="button" class="item add" onclick={() => (naming = true)}><span>+ New expansion</span></button>
          {/if}
        {/if}
        <button type="button" class="all label" aria-expanded={allOpen || !tree} onclick={() => (allOpen = !allOpen)}>{allOpen || !tree ? '▾' : '▸'} Every element by kind</button>
        {#if allOpen || !tree}
          {#if game?.engine}
            <h2 class="label">{engineName}</h2>
            {#each engineKinds as { kind, count } (kind.id)}
              <button type="button" class="item" class:on={nav.panes.includes(`${KIND}engine:${kind.id}`)} onclick={() => nav.open(`${KIND}engine:${kind.id}`)}>
                <span>{kind.plural}</span><span class="n">{count}</span>
              </button>
            {/each}
          {/if}
          <h2 class="label">{worldName}</h2>
          {#each worldKinds as { kind, count } (kind.id)}
            <button type="button" class="item" class:empty={count === 0} class:on={nav.panes.includes(`${KIND}world:${kind.id}`)} onclick={() => nav.open(`${KIND}world:${kind.id}`)}>
              <span>{kind.plural}</span><span class="n">{count}</span>
            </button>
          {:else}
            <p class="hint">No elements of this world's own yet. A world can bring kinds of its own in its game folder.</p>
          {/each}
        {/if}
      {/if}
    </nav>
  {/if}
  {#if row.length && game}
    <Panes {nav} ids={row} {label} canWindow={() => false} hasPicture={pictured}>
      {#snippet pane(id, i)}
        {#key `${id}|${bookOrigin}`}
          {#if id.startsWith(FRONT) && tree}
            <FrontPage
              place="{bookOrigin === 'engine' ? 'Base game' : `${worldName}'s game`} · Front page"
              name={tree.book.name}
              body={tree.book.body}
              picture={shown(id, bookPicture)}
              choices={bookChoices}
              onFrame={(frame) => saveBook({ frame })}
              onSave={(c) => saveBook(c)}
              contents={[
                ...tree.front.map((x) => ({ label: x.placed.element.name, note: `${x.items.length} pages`, open: () => nav.open(`${SEC}${x.placed.key}`, i) })),
                ...tree.divisions.map((d) => ({ label: d.placed.element.name, note: d.catalog.length ? `${d.catalog.length} kinds` : `${d.sections.length} sections`, open: () => nav.open(`${DIV}${d.placed.key}`, i) })),
                ...tree.back.map((x) => ({ label: x.placed.element.name, note: `${x.items.length} pages`, open: () => nav.open(`${SEC}${x.placed.key}`, i) })),
              ]} />
          {:else if id.startsWith(DIV)}
            {@const p = byKey.get(keyIn(id))!}
            {@const d = tree?.divisions.find((x) => x.placed.key === p.key)}
            <FrontPage
              place="{tree?.book.name ?? ''} · Division"
              name={p.element.name}
              body={p.element.flavor}
              picture={shown(id, pictureFor(p))}
              choices={choicesFor(p)}
              onFrame={(frame) => saveFrame(p, frame)}
              onSave={(c) => save(p, { ...p.element, name: c.name, flavor: c.body })}
              contents={d
                ? d.catalog.length
                  ? d.catalog.map((c) => ({ label: c.kind.plural, note: `${c.elements.length}`, open: () => nav.open(`${CAT}${c.kind.id}`, i) }))
                  : d.sections.map((x) => ({ label: x.placed.element.name, note: `${x.items.filter((r) => r.type === 'rule').length} rules`, open: () => nav.open(`${SEC}${x.placed.key}`, i) }))
                : []} />
          {:else if id.startsWith(SEC)}
            {@const s = places.sections.get(keyIn(id))!}
            <SectionPage
              section={s}
              {inWorld}
              place="{places.sectionIn.get(s.placed.key)?.placed.element.name ?? tree?.book.name ?? ''} · Section"
              {worldName}
              names={originName}
              picture={shown(id, pictureFor(s.placed))}
              choices={choicesFor(s.placed)}
              onFrame={(frame) => saveFrame(s.placed, frame)}
              onSave={(c) => save(s.placed, { ...s.placed.element, name: c.name, flavor: c.intro })}
              onOpen={(key, type) => nav.open(`${type === 'rule' ? RULE : EL}${key}`, i)} />
          {:else if id.startsWith(RULE)}
            {@const r = byKey.get(keyIn(id))!}
            {@const sec = places.ruleIn.get(r.key)}
            <RulePage
              rule={r}
              worldPiece={game!.addOns.get(refOf(r.element)) ?? null}
              {inWorld}
              place={[sec && places.sectionIn.get(sec.placed.key)?.placed.element.name, sec?.placed.element.name ?? 'Rule'].filter(Boolean).join(' · ')}
              {engineName}
              {worldName}
              picture={shown(id, pictureFor(r))}
              choices={choicesFor(r)}
              onFrame={(frame) => saveFrame(r, frame)}
              onSave={(c) => save(r, { ...r.element, name: c.name, tags: c.tags, flavor: c.text })}
              onSaveWorld={(text) => saveWorldPiece(r, text)}
              expansions={inWorld ? (game?.expansions ?? []).map((x) => ({ origin: x.origin, name: x.name })) : []}
              pieces={inWorld ? (game!.pieces.get(r.key) ?? []) : []}
              onSavePiece={(origin, text) => savePiece(r, origin, text)} />
          {:else if id.startsWith(EXP)}
            {@const x = expansionOf(keyIn(id))!}
            <FrontPage
              place="{worldName} · Expansion"
              name={x.name}
              body={x.about}
              picture={null}
              choices={[]}
              onFrame={async () => {}}
              onSave={(c) => saveExpansion(x, c)}
              contents={[...game!.kinds.values()]
                .filter((k) => k.id !== 'add-on')
                .map((k) => ({ k, n: game!.elements.filter((p) => p.origin === x.origin && p.element.kind === k.id).length }))
                .filter(({ k, n }) => n > 0 || ['gear', 'chrome', 'vendor', 'module'].includes(k.id))
                .map(({ k, n }) => ({ label: k.plural, note: `${n}`, open: () => nav.open(`${KIND}${x.origin}:${k.id}`, i) }))} />
          {:else if id.startsWith(CAT)}
            {@const c = catalogOf(keyIn(id))!}
            <GameKind
              kind={c.kind}
              where={tree?.book.name ?? worldName}
              {worldName}
              elements={c.elements}
              onOpen={(key) => openElement(key, i)}
              onNew={(name) => add(bookOrigin ?? 'world', c.kind.id, name, i)} />
          {:else if id.startsWith(KIND)}
            {@const [, origin, kindId] = id.split(':')}
            {@const kind = game!.kinds.get(kindId)!}
            <GameKind
              {kind}
              where={originName(origin)}
              {worldName}
              elements={game!.elements.filter((p) => p.origin === origin && p.element.kind === kindId)}
              onOpen={(key) => openElement(key, i)}
              onNew={(name) => add(origin as Origin, kindId, name, i)} />
          {:else}
            {@const p = byKey.get(keyIn(id))!}
            <GameElement
              placed={p}
              kind={game!.kinds.get(p.element.kind) ?? null}
              {engineName}
              {worldName}
              {vendors}
              onSave={(next) => save(p, next)}
              onSetAside={(on) => setAside(p, on)}
              onReskin={() => reskin(p, i)}
              onOpen={(key) => openElement(key, i)}
              where={originName(p.origin)}
              homes={p.origin !== 'engine' && MOVABLE(p.element.kind) && !p.base ? homes : []}
              onMove={(origin) => moveTo(p, origin, i)} />
          {/if}
        {/key}
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
  .books {
    display: flex;
    margin: 6px 18px 8px;
    border: 1px solid var(--edge);
    border-radius: var(--round);
    overflow: hidden;
  }
  .books button {
    flex: 1;
    font-size: calc(12px * var(--type));
    color: var(--muted);
    background: none;
    border: 0;
    padding: 5px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .books button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .notice {
    margin: 4px 18px 8px;
    padding: 8px 10px;
    font-size: calc(13px * var(--type));
    line-height: 1.45;
    color: var(--text);
    background: var(--surface);
    border-left: 2px solid var(--accent, var(--structure));
  }
  .notice button {
    margin-left: 6px;
    font-size: calc(12px * var(--type));
    color: var(--structure);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 1px 8px;
  }
  .item.add span {
    color: var(--structure);
    font-size: calc(13px * var(--type));
  }
  .new-exp {
    padding: 2px 18px 6px;
  }
  .new-exp input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: calc(13px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 4px 8px;
  }
  .all {
    display: block;
    width: calc(100% - 20px);
    margin: 14px 10px 2px;
    text-align: left;
    font-size: calc(11px * var(--type));
    background: none;
    border: 0;
    padding: 6px 8px;
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
