<script lang="ts">
  import { hover, firstSentence } from '../../lib/hover.svelte';
  // ICONS TRIAL
  import IconPicker from '../IconPicker.svelte';
  import { labelIcon } from '../../lib/icons.svelte';
  import { freePath } from '../../lib/archive';
  import { errorText } from '../../lib/errors';
  import Dialog from '../shelf/Dialog.svelte';
  import { pageActions } from '../../lib/pane.svelte';
  import { contextMenu, type MenuEntry } from '../../lib/contextMenu.svelte';
  import { titleFocus } from '../../lib/retitle';
  import { saveAll } from '../../lib/saves';
  import type { View } from '../../lib/render';
  import { onMount, setContext, tick } from 'svelte';
  import { spell } from '../../lib/spell';
  import type { WikiIndex } from '../../lib/index/wiki';
  import { gameScanner, isGameLink, GAME_LINK } from '../../lib/game/links';
  import { GAME_LINKS, type GameLinks } from './links';
  import { views } from '../../lib/view.svelte';
  import type { WorldFs, ImageSource } from '../../lib/fs/types';
  import type { Navigator } from '../../lib/nav.svelte';
  import { splitHeader, withHeader } from '../../lib/world';
  import { newElement, readElement, withChanges, writeElement, type Element } from '../../lib/game/elements';
  import { merge3 } from '../../lib/editor/merge';
  import { sync } from '../../lib/sync.svelte';
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
    bookOver,
    effective,
  } from '../../lib/game/game';
  import { readFrame, writeFrame, type Frame } from '../../lib/index/frame';
  import { ui } from '../../lib/ui.svelte';
  import Panes from '../Panes.svelte';
  import GameKind from './GameKind.svelte';
  import GameElement from './GameElement.svelte';
  import BookTree from './BookTree.svelte';
  import FrontPage from './FrontPage.svelte';
  import EntryView from '../world/EntryView.svelte';
  import { defaultShape } from '../../lib/index/frame';
  import GameTitlePage, { type TitleChanges } from './GameTitlePage.svelte';
  import SectionPage from './SectionPage.svelte';
  import RulePage from './RulePage.svelte';
  import type { PictureChoice } from './GameBanner.svelte';

  /**
   * The Game module (Cerys, November 7 and 9, reshaped November 21): a tabletop game's
   * rules, kept as separate elements and written as a book. The files are stored by
   * owner, the engine's and the world's, and the pages do not show that layout. In a
   * world, the book on screen is the world's. The sidebar shows it as a tree: its title
   * page, its front matter, its divisions, and their sections. A section opens as one
   * page with every rule written in place. A core rule carries one mark, and a world adds
   * its examples and clarifications after it. A kind's elements show as a list or as a
   * sheet. Core elements belong to the engine and appear in every game built on it, and
   * this world's own elements live in its game folder.
   */
  let {
    view = 'narrator',
    fs,
    nav,
    index = null,
    rebuild = async () => {},
    worldName,
    engineRel,
    gameDir,
    openEngine,
    engineChoices = async () => [],
  }: {
    /** Narrator or Protagonist, which a wiki entry opened here follows. */
    view?: View;
    fs: WorldFs;
    nav: Navigator;
    /** The world's wiki, whose names the world's game text links. */
    index?: WikiIndex | null;
    /** Reads the wiki again, after an entry opened here is renamed or moved. */
    rebuild?: () => Promise<void>;
    worldName: string;
    /** The engine's folder, as a path from the library's top, or '' for none. */
    engineRel: string;
    gameDir: string;
    openEngine: (rel: string | null) => Promise<GameFs | null>;
    /** The engines the library's other worlds build on, each as its path from the library's top. */
    engineChoices?: () => Promise<string[]>;
  } = $props();

  /**
   * A world with no game yet starts one here (Cerys, November 21). The engines on offer
   * are the ones the library's other worlds already build on. Choosing one names it in
   * the world's `world.md` and lays the world's book out over the engine's, so the game
   * opens with the base game's shape and its core rules in place.
   */
  let choices = $state<{ rel: string; name: string }[]>([]);
  let starting = $state(false);
  $effect(() => {
    if (!game || game.engine || engineRel) return;
    let live = true;
    void (async () => {
      const found: { rel: string; name: string }[] = [];
      for (const rel of await engineChoices().catch(() => [])) {
        try {
          const efs = await openEngine(rel);
          if (!efs) continue;
          const md = (await efs.exists('engine.md')) ? await efs.readText('engine.md') : '';
          const { header, body } = splitHeader(md);
          found.push({ rel, name: (typeof header.name === 'string' && header.name.trim()) || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || rel });
        } catch {
          // An engine that cannot be opened is not offered.
        }
      }
      await openEngine(null).catch(() => {});
      if (live) choices = found;
    })();
    return () => (live = false);
  });

  async function layOut() {
    if (!game?.engine || game.books.world) return;
    for (const f of bookOver(game, worldName)) await game.world.fs.writeText(pathIn(game.world, f.path), f.text);
    await load();
  }

  async function startOn(rel: string) {
    starting = true;
    problem = '';
    try {
      await fs.writeText('world.md', withHeader(await fs.readText('world.md'), { engine: rel }));
      await rebuild();
      await tick();
      await load();
      await layOut();
    } catch (e) {
      problem = errorText(e);
    } finally {
      starting = false;
    }
  }

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
          problem = `This world's engine, ${engineRel}, could not be opened: ${errorText(e)}`;
        }
      } else {
        await openEngine(null).catch(() => {});
      }
      game = await loadGame(engine, { origin: 'world', name: worldName, fs, dir: gameDir });
    } catch (e) {
      problem = errorText(e);
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

  // A sync can change the engine's files, which nothing watches (code review, November 21),
  // so the game is read again once each sync has finished.
  let synced = sync.at;
  $effect(() => {
    if (sync.at === synced) return;
    synced = sync.at;
    void load();
  });

  const byKey = $derived(new Map((game?.elements ?? []).map((p) => [p.key, p])));
  const expansionOf = (origin: Origin) => game?.expansions.find((x) => x.origin === origin) ?? null;
  /** The engine's, the world's, or an expansion's name. */
  const originName = (origin: Origin) => (origin === 'engine' ? engineName : origin === 'world' ? worldName : (expansionOf(origin)?.name ?? origin));
  // Where a world's own element can live: the world itself or one of its expansions (Cerys, November 9).
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
      if (index?.get(id)) return true;
      if (id.startsWith(FRONT)) return id === `${FRONT}${bookOrigin}` && !!tree;
      if (id.startsWith(CAT)) return !!catalogOf(keyIn(id));
      if (id.startsWith(KIND)) return game.kinds.has(id.split(':')[2]);
      if (id.startsWith(EXP)) return !!expansionOf(keyIn(id));
      if (id.startsWith(SEC)) return places.sections.has(keyIn(id));
      return [DIV, RULE, EL].some((pre) => id.startsWith(pre)) && byKey.has(keyIn(id));
    }),
  );

  function label(id: string): string {
    const entry = index?.get(id);
    if (entry) return entry.name;
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

  // Game text links the game's terms and, in a world's book, the world's names (Cerys,
  // November 10). A term opens its rule, section, or aspect here, and a name opens its
  // wiki entry in the World module.
  // A game's own names are never misspelled: its aspects, keywords, rules, and sections.
  $effect(() => spell.allow('game', (game?.elements ?? []).map((p) => p.element.name)));
  const linkScanner = $derived(
    gameScanner(
      (game?.elements ?? []).map((p) => ({ key: p.key, name: p.element.name, kind: p.element.kind, origin: p.origin, tags: p.element.tags })),
      [...(index?.entries.values() ?? [])].map((e) => ({ id: e.id, name: e.name, aliases: e.aliases })),
      bookOrigin === 'engine' ? 'engine' : 'world',
      game?.labels,
    ),
  );
  // The front and back matter are notices and credits, so their pages link nothing.
  const plain = $derived.by(() => {
    const out = new Set<string>();
    for (const s of [...(tree?.front ?? []), ...(tree?.back ?? [])]) {
      // A section added at the top of the book, such as an introduction, is ordinary writing and says so.
      if (s.placed.element.fields.links === 'yes') continue;
      out.add(`${SEC}${s.placed.key}`);
      for (const i of s.items) if (i.type === 'rule') out.add(`${RULE}${i.placed.key}`);
    }
    return out;
  });

  function openLink(id: string) {
    // A world's name opens its entry beside the page, as it does beside a chapter (Cerys, November 11).
    if (!isGameLink(id)) return nav.open(id);
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
    linked: (pane) => !plain.has(pane),
  });

  // A game term's hover card (Cerys, November 24): what the term is, in a line. The line is
  // `summary:` in the element's file when it has one, else its `reminder:`, which every
  // keyword carries, else its first sentence, else its first rule.
  $effect(() => {
    hover.game = (key) => {
      const p = byKey.get(key);
      if (!p || !game) return null;
      const el = effective(p);
      const text = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');
      const plainly = (t: string) => t.replace(/^#+\s.*$/gm, '').replace(/[*_`>]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      // A reminder is written to sit inside a sentence, so it opens in lowercase. On a card it stands alone.
      const alone = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.') : '');
      const brief = text(el.fields.summary) || alone(plainly(text(el.fields.reminder)).trim()) || firstSentence(plainly(text(el.fields.flavor))) || firstSentence(plainly(el.flavor)) || firstSentence(plainly(text(el.fields.rules)));
      const kind = game.kinds.get(el.kind);
      const tags = el.tags.filter((t) => t.toLowerCase() !== el.kind && t.toLowerCase() !== 'core');
      const pic = pictureFor(p);
      const facts: [string, string][] = [];
      if (text(el.fields.availability)) facts.push(['Availability', text(el.fields.availability)]);
      if (text(el.fields.full_rule)) facts.push(['Full rule', text(el.fields.full_rule)]);
      if (tags.length) facts.push(['Tags', tags.slice(0, 5).join(', ')]);
      return { id: `game:${key}`, kind: kind?.name ?? el.kind, icon: iconOf(el.kind), main: el.name, lead: '', brief, also: [], facts, picture: pic ? { url: pic.url, style: '' } : null, game: true };
    };
    return () => {
      hover.game = null;
    };
  });

  // A page's view can put its picture away (lib/view.svelte.ts).
  function shown<T>(id: string, picture: T | null): T | null {
    return views.of(id).picture === 'hide' ? null : picture;
  }

  /** Replaces one element in the game after it is written, so every pane sees the change. */
  function swap(p: Placed, next: Element) {
    if (!game) return;
    p.element = next;
    game = { ...game, elements: [...game.elements] };
  }

  /**
   * Saves an element. The file is read as it stands on disk, and only what differs
   * between `base` and `next` is written onto it (code review, November 21), so a page
   * can neither undo a change that reached the file from elsewhere nor drop a key it does
   * not know. `base` is the element as the page that asks had it. A page that holds its
   * own copy while the writer types passes that copy's starting point.
   */
  async function save(p: Placed, next: Element, base: Element = p.element) {
    if (!game) return;
    const src = sourceOf(game, p);
    const file = pathIn(src, next.path);
    const onDisk = (await src.fs.exists(file)) ? await src.fs.readText(file) : null;
    const text = onDisk === null ? writeElement(next, game.kinds.get(next.kind) ?? null) : withChanges(onDisk, base, next, merge3);
    if (text !== onDisk) await src.fs.writeText(file, text);
    // The page is shown what the file now holds, which may be more than it wrote.
    swap(p, { ...readElement(next.path, text), path: next.path });
  }
  /** A page's title and text, with what each was when the page last read or saved them. */
  type Typed = { name: string; text: string; was: { name: string; text: string } };
  const saveTyped = (p: Placed, c: Typed) => save(p, { ...p.element, name: c.name, flavor: c.text }, { ...p.element, name: c.was.name, flavor: c.was.text });

  const list = (p: Placed, field: string): string[] => {
    const v = p.element.fields[field];
    return Array.isArray(v) ? [...v] : [];
  };
  const withList = (p: Placed, field: string, items: string[]): Element => ({ ...p.element, fields: { ...p.element.fields, [field]: items } });

  /** The file that holds what this world adds after a core rule, its add-on, made the first time it is written in. */
  async function worldPieceOf(p: Placed): Promise<Placed> {
    if (!game) throw new Error('The game is not open');
    const existing = game.addOns.get(refOf(p.element));
    if (existing) return existing;
    await writeAddOn(game.world, p, refOf(p.element));
    return game!.addOns.get(refOf(p.element))!;
  }

  async function writeAddOn(src: Source, p: Placed, extendsRef: string) {
    const kind = game?.kinds.get('add-on') ?? null;
    // A module's add-on is named for the module; any other kind's carries its kind first.
    const id = (p.element.kind === 'module' ? p.element.id : `${p.element.kind}-${p.element.id}`) + (p.origin === 'world' && src.origin !== 'world' ? '-world' : '');
    const e: Element = { path: `elements/add-on/${id}.md`, id, name: p.element.name, kind: 'add-on', tags: ['add-on'], vendor: '', reskins: '', fields: { extends: extendsRef }, flavor: '' };
    await src.fs.writeText(pathIn(src, e.path), writeElement(e, kind));
    await load();
  }

  /** Moves a world's own element into an expansion, or back (Cerys, November 9). */
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
  // core rule sits beside the world's add-on for it.
  const stemOf = (path: string) => path.replace(/\.md$/i, '');

  async function setPicture(owner: Placed, image: ImageSource) {
    if (!game) return;
    const src = sourceOf(game, owner);
    await src.fs.setImage(pathIn(src, stemOf(owner.element.path)), image);
    await load();
  }

  async function archive(src: Source, path: string) {
    const name = path.split('/').pop()!;
    await src.fs.move(pathIn(src, path), await freePath((p) => src.fs.exists(p), pathIn(src, `archive/${name}`)));
  }

  /**
   * Archives a rule, a section, or any other element (Cerys, November 15). It leaves every
   * list that named it, in sections, divisions, and the books, and its file moves into the
   * game's `archive` folder with a note of where it stood, so it can be put back by hand.
   * Nothing is deleted. A section's rules stay in the game, under every element by kind.
   */
  const canArchive = (p: Placed) => !!game && (bookOrigin === 'engine' ? p.origin === 'engine' : p.origin !== 'engine');
  // A rule's tags are kept in its menu, out of the writing (Cerys, November 21).
  let tagging = $state<Placed | null>(null);
  let tagText = $state('');
  let tagBusy = $state(false);
  let tagProblem = $state('');
  async function saveTags() {
    const p = tagging;
    if (!p) return;
    tagBusy = true;
    try {
      await saveAll();
      await save(p, { ...p.element, tags: tagText.split(',').map((t) => t.trim()).filter(Boolean) });
      tagging = null;
    } catch (e) {
      tagProblem = errorText(e);
    } finally {
      tagBusy = false;
    }
  }

  let archiving = $state<Placed | null>(null);
  let archiveBusy = $state(false);
  let archiveProblem = $state('');
  async function archiveElement(p: Placed) {
    if (!game) return;
    archiveBusy = true;
    archiveProblem = '';
    try {
      await saveAll();
      const stood: { in: string; list: string; before: string | null }[] = [];
      for (const other of game.elements) {
        if (other === p) continue;
        for (const field of ['items', 'sections']) {
          const refs = list(other, field);
          const at = refs.findIndex((r) => keyOf(r, other.origin) === p.key);
          if (at < 0) continue;
          stood.push({ in: other.key, list: field, before: refs[at + 1] ? keyOf(refs[at + 1], other.origin) : null });
          await save(other, withList(other, field, refs.filter((_, i) => i !== at)));
        }
      }
      // The books name sections and matter too.
      for (const src of [game.engine, game.world]) {
        if (!src) continue;
        const file = pathIn(src, 'book.md');
        if (!(await src.fs.exists(file))) continue;
        const text = await src.fs.readText(file);
        const { header } = splitHeader(text);
        const changes: Record<string, unknown> = {};
        for (const field of ['front_matter', 'back_matter', 'divisions', 'chapters']) {
          const refs = Array.isArray(header[field]) ? (header[field] as unknown[]).map(String) : [];
          const at = refs.findIndex((r) => keyOf(r, src.origin) === p.key);
          if (at < 0) continue;
          stood.push({ in: `${src.origin}:book`, list: field, before: refs[at + 1] ? keyOf(refs[at + 1], src.origin) : null });
          const rest = refs.filter((_, i) => i !== at);
          changes[field] = rest.length ? rest : undefined;
        }
        if (Object.keys(changes).length) await src.fs.writeText(file, withHeader(text, changes));
      }
      const src = sourceOf(game, p);
      const file = pathIn(src, p.element.path);
      await src.fs.writeText(file, withHeader(await src.fs.readText(file), { archived_from: stood.length ? stood : undefined }));
      const free = (path: string) => freePath((p) => src.fs.exists(p), pathIn(src, `archive/${path}`));
      await src.fs.move(file, await free(p.element.path));
      if (p.image) await src.fs.move(pathIn(src, p.image), await free(p.image));
      for (const id of [`${RULE}${p.key}`, `${SEC}${p.key}`, `${EL}${p.key}`]) if (nav.panes.includes(id)) nav.close(id);
      archiving = null;
      await load();
    } catch (e) {
      archiveProblem = errorText(e);
    } finally {
      archiveBusy = false;
    }
  }

  // A rule, a section, or an element offers its menu from the corner of its page and from a
  // right click on its row: Rename, which puts the cursor in its title, and Archive.
  function menuFor(id: string): MenuEntry[] {
    const p = byKey.get(keyIn(id));
    if (!p) return [];
    const titled = id.startsWith(RULE) || id.startsWith(SEC) || id.startsWith(EL);
    return [
      ...(titled ? [{ label: 'Rename', run: () => (nav.open(id), titleFocus.request(id)) }] : []),
      ...(id.startsWith(RULE) ? [{ label: 'Tags…', run: () => ((tagProblem = ''), (tagText = p.element.tags.join(', ')), (tagging = p)) }] : []),
      ...(titled ? ['separator' as const] : []),
      // A core element belongs to the base game, so a world's book cannot archive it. The
      // menu says where it can be archived and goes there, in place of a greyed-out word.
      canArchive(p) || p.origin !== 'engine'
        ? { label: 'Archive', run: () => ((archiveProblem = ''), (archiving = p)), disabled: !canArchive(p) }
        : { label: `Archive from ${engineName}…`, run: () => ((chosen = 'engine'), (archiveProblem = ''), (archiving = p)) },
    ];
  }
  $effect(() => {
    const ids = row.filter((id) => (id.startsWith(RULE) || id.startsWith(SEC) || id.startsWith(EL)) && byKey.get(keyIn(id)));
    for (const id of ids) pageActions.set(id, menuFor(id));
    return () => {
      for (const id of ids) pageActions.clear(id);
    };
  });

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
    const core: PictureChoice = { label: inWorld && p.origin === 'engine' && p.element.kind === 'module' ? `${engineName} picture` : 'picture', set: (image) => setPicture(p, image), remove: p.image ? () => removePicture(p) : null };
    // Only a core rule can carry a world's own picture. Sections and divisions show the engine's.
    if (!(inWorld && p.origin === 'engine' && p.element.kind === 'module')) return [core];
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
  async function saveBook(changes: { name?: string; body?: string; frame?: Frame; page?: Omit<TitleChanges, 'name' | 'body'> }) {
    if (!game || !bookSource || !bookOrigin) return;
    const file = pathIn(bookSource, 'book.md');
    let text = await bookSource.fs.readText(file);
    if (changes.name !== undefined) text = withHeader(text, { name: changes.name });
    // The title page's lines are header fields, as a manuscript's are. An empty one is left out of the file.
    if (changes.page) {
      const p = changes.page;
      text = withHeader(text, { subtitle: p.subtitle || undefined, profile: p.profile || undefined, author: p.author || undefined, copyright: p.copyright || undefined, year: p.year ?? undefined });
    }
    if (changes.frame !== undefined) text = withHeader(text, { banner_frame: writeFrame(changes.frame) });
    if (changes.body !== undefined) text = withBody(text, changes.body);
    await bookSource.fs.writeText(file, text);
    const book = game.books[bookOrigin]!;
    const next = { ...book, ...(changes.page ?? {}), name: changes.name ?? book.name, body: changes.body ?? book.body, frame: changes.frame ? (writeFrame(changes.frame) ?? '') : book.frame };
    game = { ...game, books: { ...game.books, [bookOrigin]: next } };
  }

  /**
   * Moves the old front page's text into the front matter as a page named Introduction
   * (Cerys, November 10), and then clears it from `book.md`. The text is written into its
   * new page before it is taken from the old one, so a failure part way loses nothing.
   */
  async function textToFrontMatter(text: string) {
    if (!game || !bookSource || !bookOrigin || !tree) return;
    let sec: Placed | null = tree.front[0]?.placed ?? null;
    if (!sec) {
      const secKey = await addElement(bookOrigin, 'chapter', 'Front Matter');
      await load();
      sec = byKey.get(secKey) ?? null;
      if (!sec) throw new Error('The front matter could not be made.');
      const file = pathIn(bookSource, 'book.md');
      await bookSource.fs.writeText(file, withHeader(await bookSource.fs.readText(file), { front_matter: [refOf(sec.element)] }));
    }
    const key = await addElement(sec.origin, 'module', 'Introduction');
    await load();
    const page = byKey.get(key);
    const section = byKey.get(sec.key);
    if (!page || !section) throw new Error('The introduction could not be made.');
    await save(page, { ...page.element, flavor: text });
    await save(section, withList(section, 'items', [...list(section, 'items'), key]));
    await saveBook({ body: '' });
    await load();
    nav.open(`${RULE}${key}`);
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

  /**
   * A world's book follows the base game's (Cerys, November 23), so the world's file for a
   * division holds only what the world adds to it. A division that came from the base
   * game since the world was laid out has no such file yet, and it gets one the first time
   * the world adds a section to it.
   */
  async function worldTwin(p: Placed): Promise<Placed> {
    if (!game || !inWorld || p.origin !== 'engine') return p;
    const key = `world:${refOf(p.element)}`;
    const kind = game.kinds.get(p.element.kind);
    if (byKey.get(key) || !kind) return byKey.get(key) ?? p;
    const e: Element = { ...newElement(p.element.name, kind, new Set()), id: p.element.id, path: p.element.path, tags: [kind.id] };
    await game.world.fs.writeText(pathIn(game.world, e.path), writeElement(e, kind));
    await load();
    return byKey.get(key) ?? p;
  }
  /**
   * Saves a division's front page. In a world's book a division of the base game keeps the
   * base game's name, so a new name typed there is not taken, and the page says why.
   */
  async function saveDivision(p: Placed, shownName: string, c: { name: string; text: string; was: { name: string; text: string } }) {
    const core = inWorld && (p.origin === 'engine' || !!byKey.get(`engine:${refOf(p.element)}`));
    if (!core) return saveTyped(p, c);
    if (c.name !== c.was.name && c.name !== shownName) notice = `${shownName} is a division of ${engineName}, so its name is set in ${engineName}'s book.`;
    // The world's own file is made only when the world has something to say on this page.
    if (c.text === c.was.text) return;
    const mine = await worldTwin(p);
    await saveTyped(mine, { ...c, name: mine.element.name, was: { ...c.was, name: mine.element.name } });
  }
  // ICONS TRIAL: the icon a label wears, from the game's labels file or the label's default,
  // and choosing one, which is written to the labels file of the book on screen.
  const iconOf = (...labels: string[]) => {
    for (const l of labels) {
      const found = labelIcon(l, game?.labels.get(l.toLowerCase())?.icon);
      if (found || game?.labels.get(l.toLowerCase())?.icon) return found;
    }
    return null;
  };
  let pickingIcon = $state<{ label: string; name: string } | null>(null);
  async function pickIcon(name: string | null) {
    const p = pickingIcon;
    if (!p || !bookSource) return;
    const file = pathIn(bookSource, 'labels.md');
    const text = (await bookSource.fs.exists(file)) ? await bookSource.fs.readText(file) : '';
    const was = splitHeader(text).header[p.label];
    const entry = { ...(was && typeof was === 'object' && !Array.isArray(was) ? (was as Record<string, unknown>) : {}) };
    if (name) entry.icon = name;
    else delete entry.icon;
    await bookSource.fs.writeText(file, withHeader(text, { [p.label]: Object.keys(entry).length ? entry : undefined }));
    pickingIcon = null;
    await load();
  }

  /** A division's sections as the book shows them now, which is the list a change starts from. */
  const sectionsShown = (divKey: string) => tree?.divisions.find((d) => d.placed.key === divKey)?.sections.map((s) => s.placed.key) ?? null;

  async function moveSection(secKey: string, fromKey: string | null, toKey: string, before: string | null) {
    if (!game || !bookSource) return;
    const sec = byKey.get(secKey);
    let to = byKey.get(toKey);
    if (!sec || !to || secKey === before) return;
    if (inWorld && sec.origin === 'engine') {
      notice = `${sec.element.name} is a core section, so its place is set in ${engineName}'s book, and ${worldName} follows it.`;
      return;
    }
    if (!inWorld && to.origin === 'engine' && sec.origin === 'world') {
      notice = `${sec.element.name} is ${worldName}'s own section, so it belongs in ${worldName}'s book.`;
      return;
    }
    notice = '';
    const shownNow = sectionsShown(toKey);
    to = await worldTwin(to);
    const target = (shownNow ?? list(to, 'sections')).filter((r) => keyOf(r, to!.origin) !== secKey);
    const at = before ? target.findIndex((r) => keyOf(r, to!.origin) === before) : -1;
    if (at < 0) target.push(secKey);
    else target.splice(at, 0, secKey);
    const from = fromKey ? byKey.get(fromKey) : null;
    if (from && from.key !== to.key && from.origin === sec.origin) await save(from, withList(from, 'sections', list(from, 'sections').filter((r) => keyOf(r, from.origin) !== secKey)));
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

  async function addRule(secKey: string, name: string, stay = false) {
    const sec = byKey.get(secKey);
    if (!sec) return;
    const key = await addElement(sec.origin, 'module', name);
    await save(sec, withList(sec, 'items', [...list(sec, 'items'), key]));
    await load();
    // A rule added from its section's page is written there, so the page stays.
    if (!stay) nav.open(`${RULE}${key}`);
  }

  /**
   * Adds a section at the book's top level, after its front matter and before its
   * divisions (Cerys, November 21), such as an introduction. It is listed with the front
   * matter in `book.md`, and its `links: yes` says it is written like any other section,
   * where the notices of the front matter link nothing.
   */
  async function addTopSection(name: string) {
    if (!game || !bookSource || !bookOrigin) return;
    const key = await addElement(bookOrigin, 'chapter', name);
    await load();
    const sec = byKey.get(key);
    if (!sec) throw new Error('The section could not be made.');
    await save(sec, { ...sec.element, fields: { ...sec.element.fields, links: 'yes' } });
    const file = pathIn(bookSource, 'book.md');
    const text = await bookSource.fs.readText(file);
    const before = splitHeader(text).header.front_matter;
    const front = Array.isArray(before) ? before.filter((r): r is string => typeof r === 'string') : [];
    await bookSource.fs.writeText(file, withHeader(text, { front_matter: [...front, refOf(sec.element)] }));
    await load();
    nav.open(`${SEC}${key}`);
  }

  async function addSection(divKey: string, name: string) {
    const at = byKey.get(divKey);
    if (!at) return;
    // The new section goes after everything the division shows now, the base game's
    // sections included, so it holds the last number in the world's list.
    const shownNow = sectionsShown(divKey);
    const div = await worldTwin(at);
    const key = await addElement(div.origin, 'chapter', name);
    await save(div, withList(div, 'sections', [...(shownNow ?? list(div, 'sections')), key]));
    await load();
    nav.open(`${SEC}${key}`);
  }

  async function add(origin: Origin, kindId: string, name: string, from: number, stay = false) {
    const key = await addElement(origin, kindId, name);
    await load();
    // An element added from the sheet's last row is written there, so the page stays.
    if (!stay) openElement(key, from);
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
</script>

<div class="game">
  {#if !ui.full}
    <nav class="sidebar" aria-label="Game">
      <input class="find" type="search" placeholder="Find an element" bind:value={filter} aria-label="Find an element" />
      {#if notice}
        <p class="notice" role="status">{notice} <button type="button" onclick={() => (notice = '')}>OK</button></p>
      {/if}
      {#if game?.labelProblems.length}
        <p class="notice" role="alert">Part of labels.md could not be read, so it was left out. {game.labelProblems.join(' ')}</p>
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
        <!-- In a world, the book on screen is the world's (Cerys, November 21). Core is a
             mark on a rule and not a second book to visit. The base game's own book is
             still reached from the foot of this list, for its title page and its order. -->
        {#if game?.books.world && bookOrigin === 'engine'}
          <button type="button" class="back-to-world" onclick={() => (chosen = 'world')}>
            <span class="label">The base game, {engineName}</span>
            <span>← Back to {worldName}</span>
          </button>
        {/if}
        {#if tree}
          <BookTree
            {tree}
            {worldName}
            open={nav.panes}
            onOpen={(id) => nav.open(id)}
            onMoveRule={(r, f, t, b) => void moveRule(r, f, t, b).catch((e) => (notice = errorText(e)))}
            onMoveSection={(sec, f, t, b) => void moveSection(sec, f, t, b).catch((e) => (notice = errorText(e)))}
            names={originName}
            onAddRule={addRule}
            onAddSection={addSection}
            onAddTop={addTopSection}
            onMenu={(e, id) => contextMenu.show(e, menuFor(id))}
            {iconOf} />
        {/if}
        {#if game?.books.world && game.books.engine && bookOrigin === 'world'}
          <button type="button" class="base-book" title="The book every game built on {engineName} starts from: its title page, its divisions, and their order" onclick={() => (chosen = 'engine')}>The base game's book</button>
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
    <Panes
      {nav}
      ids={row}
      {label}
      canWindow={() => false}
      isCard={(id) => {
        const e = index?.get(id);
        return !!e?.imagePath && (e.picture ?? defaultShape(e.category, index?.pictures ?? null)) === 'behind' && views.of(id).picture !== 'hide';
      }}>
      {#snippet pane(id, i, next)}
        {#key `${id}|${bookOrigin}`}
          {#if index?.get(id)}
            <!-- A wiki entry opened from a name in the game's text, beside the page it came from. -->
            <EntryView
              {index}
              {fs}
              {id}
              {view}
              {next}
              fresh={false}
              onOpen={(target) => nav.open(target, i)}
              onMoved={async (from, to) => {
                await rebuild();
                nav.replace(from, to);
              }} />
          {:else if id.startsWith(FRONT) && tree}
            <GameTitlePage
              place="{bookOrigin === 'engine' ? 'Base game' : `${worldName}'s game`} · Title page"
              book={tree.book}
              builtOn={bookOrigin === 'world' && game?.engine ? engineName : null}
              picture={shown(id, bookPicture)}
              choices={bookChoices}
              onFrame={(frame) => saveBook({ frame })}
              onSave={({ name, body, ...page }) => saveBook({ name, body, page })}
              onMoveText={textToFrontMatter}
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
              name={d?.placed.element.name ?? p.element.name}
              body={d?.placed.element.flavor ?? p.element.flavor}
              picture={shown(id, pictureFor(p))}
              choices={choicesFor(p)}
              onFrame={(frame) => saveFrame(p, frame)}
              onSave={(c) => saveDivision(p, d?.placed.element.name ?? p.element.name, c)}
              contents={d
                ? d.catalog.length
                  ? d.catalog.map((c) => ({ label: c.kind.plural, note: `${c.elements.length}`, open: () => nav.open(`${CAT}${c.kind.id}`, i) }))
                  : d.sections.map((x) => ({ label: x.placed.element.name, note: `${x.items.filter((r) => r.type === 'rule').length} rules`, open: () => nav.open(`${SEC}${x.placed.key}`, i) }))
                : []} />
          {:else if id.startsWith(SEC)}
            {@const s = places.sections.get(keyIn(id))!}
            <SectionPage
              titleId={id}
              section={s}
              {inWorld}
              place={(places.sectionIn.get(s.placed.key)?.placed.element.name ?? tree?.book.name ?? '') === s.placed.element.name ? 'Section' : `${places.sectionIn.get(s.placed.key)?.placed.element.name ?? tree?.book.name ?? ''} · Section`}
              {engineName}
              {worldName}
              picture={shown(id, pictureFor(s.placed))}
              choices={choicesFor(s.placed)}
              onFrame={(frame) => saveFrame(s.placed, frame)}
              onSave={(c) => saveTyped(s.placed, c)}
              onSaveRule={(r, c) => saveTyped(r, c)}
              onSaveWorld={(r, text) => saveWorldPiece(r, text)}
              onAddRule={(name) => addRule(s.placed.key, name, true)}
              onOpen={(key, type) => nav.open(`${type === 'rule' ? RULE : EL}${key}`, i)} />
          {:else if id.startsWith(RULE)}
            {@const r = byKey.get(keyIn(id))!}
            {@const sec = places.ruleIn.get(r.key)}
            <RulePage
              titleId={id}
              rule={r}
              worldPiece={game!.addOns.get(refOf(r.element)) ?? null}
              {inWorld}
              place={[...new Set([sec && places.sectionIn.get(sec.placed.key)?.placed.element.name, sec?.placed.element.name ?? 'Rule'].filter(Boolean))].join(' · ')}
              {engineName}
              {worldName}
              picture={shown(id, pictureFor(r))}
              choices={choicesFor(r)}
              onFrame={(frame) => saveFrame(r, frame)}
              onSave={(c) => saveTyped(r, c)}
              onSaveWorld={(text) => saveWorldPiece(r, text)} />
          {:else if id.startsWith(EXP)}
            {@const x = expansionOf(keyIn(id))!}
            <FrontPage
              place="{worldName} · Expansion"
              name={x.name}
              body={x.about}
              picture={null}
              choices={[]}
              onFrame={async () => {}}
              onSave={(c) => saveExpansion(x, { name: c.name, body: c.text })}
              contents={[...game!.kinds.values()]
                .filter((k) => k.id !== 'add-on')
                .map((k) => ({ k, n: game!.elements.filter((p) => p.origin === x.origin && p.element.kind === k.id).length }))
                .filter(({ k, n }) => n > 0 || ['gear', 'chrome', 'vendor', 'module'].includes(k.id))
                .map(({ k, n }) => ({ label: k.plural, note: `${n}`, open: () => nav.open(`${KIND}${x.origin}:${k.id}`, i) }))} />
          {:else if id.startsWith(CAT)}
            {@const c = catalogOf(keyIn(id))!}
            <GameKind
              kind={c.kind}
              gathered={c.byLabel}
              icon={iconOf(c.kind.id)}
              onIcon={() => (pickingIcon = { label: c.kind.id, name: c.kind.plural })}
              where={tree?.book.name ?? worldName}
              {worldName}
              elements={c.elements}
              {engineName}
              onOpen={(key) => openElement(key, i)}
              onMenu={(e, key) => contextMenu.show(e, menuFor(`${EL}${key}`))}
              homes={inWorld && game?.engine && game.kinds.get(c.kind.id)?.origin === 'engine' ? [{ origin: 'world', name: worldName }, { origin: 'engine', name: engineName }] : []}
              onNew={(name, home) => add((home as Origin | undefined) ?? bookOrigin ?? 'world', c.kind.id, name, i)}
              onSave={(p, next, base) => save(p, next, base)}
              onNewHere={(name, home) => add((home as Origin | undefined) ?? bookOrigin ?? 'world', c.kind.id, name, i, true)} />
          {:else if id.startsWith(KIND)}
            {@const [, origin, kindId] = id.split(':')}
            {@const kind = game!.kinds.get(kindId)!}
            <GameKind
              {kind}
              where={originName(origin)}
              {worldName}
              elements={game!.elements.filter((p) => p.origin === origin && p.element.kind === kindId)}
              icon={iconOf(kindId)}
              onOpen={(key) => openElement(key, i)}
              onMenu={(e, key) => contextMenu.show(e, menuFor(`${EL}${key}`))}
              {engineName}
              onNew={(name) => add(origin as Origin, kindId, name, i)}
              onSave={(p, next, base) => save(p, next, base)}
              onNewHere={(name) => add(origin as Origin, kindId, name, i, true)} />
          {:else}
            {@const p = byKey.get(keyIn(id))!}
            <GameElement
              placed={p}
              kind={game!.kinds.get(p.element.kind) ?? null}
              {engineName}
              {worldName}
              {vendors}
              onSave={(next, base) => save(p, next, base)}
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
    <main class="home sheet">
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
        {#if game.engine && !game.books.world && !game.elements.some((p) => p.origin === 'world')}
          <p class="hint">{worldName} is built on {engineName} and has no book of its own yet.</p>
          <button type="button" class="start" disabled={starting} onclick={() => ((starting = true), layOut().catch((e) => (problem = errorText(e))).finally(() => (starting = false)))}>
            {starting ? 'Laying it out…' : `Lay out ${worldName}'s book from ${engineName}`}
          </button>
        {/if}
        {#if !game.engine && !problem && choices.length}
          <p class="hint">{worldName} has no game yet. Building it on an engine gives it that game's core rules, laid out as a book you add {worldName}'s own sections, rules, and aspects to.</p>
          {#each choices as c (c.rel)}
            <button type="button" class="start" disabled={starting} onclick={() => startOn(c.rel)}>{starting ? 'Setting it up…' : `Build ${worldName}'s game on ${c.name}`}</button>
          {/each}
        {:else if !game.engine && !problem}
          <p class="hint">
            This world names no engine. A world's game is built on an engine when its <code>world.md</code> says where the engine's folder is, as a path
            from the top of the library, such as <code>engine: games/example-engine</code>. The engine folder holds an <code>engine.md</code>.
          </p>
        {/if}
      {/if}
    </main>
  {/if}
</div>

{#if tagging}
  <Dialog title="Tags" action="Save" ready busy={tagBusy} problem={tagProblem} onSubmit={saveTags} onCancel={() => (tagging = null)}>
    <p class="hint">The tags of “{tagging.element.name}”, with a comma between each. Tags say where a rule belongs and what it is.</p>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="tag-field" type="text" bind:value={tagText} aria-label="Tags" autocomplete="off" autofocus />
  </Dialog>
{/if}

<!-- ICONS TRIAL -->
{#if pickingIcon}
  <IconPicker what={pickingIcon.name} current={iconOf(pickingIcon.label)} start="objects" onPick={pickIcon} onCancel={() => (pickingIcon = null)} />
{/if}

{#if archiving}
  <Dialog title="Archive this {archiving.element.kind === 'chapter' ? 'section' : archiving.element.kind === 'module' ? 'rule' : archiving.element.kind}" action="Archive" ready busy={archiveBusy} problem={archiveProblem} onSubmit={() => archiving && archiveElement(archiving)} onCancel={() => (archiving = null)}>
    <p class="hint">“{archiving.element.name}” leaves the book and moves to the game's archive folder, with a note of where it stood. The file is kept, so nothing is lost.</p>
    {#if archiving.origin === 'engine'}<p class="hint">It is part of {engineName}, so it leaves every game built on {engineName}, not this world's alone.</p>{/if}
  </Dialog>
{/if}

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
  .back-to-world {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    margin: 6px 12px 8px;
    padding: 8px 10px;
    font-size: calc(13px * var(--type));
    color: var(--text);
    text-align: left;
    background: var(--accent-wash);
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .back-to-world .label {
    font-size: calc(10.5px * var(--type));
    color: var(--accent);
  }
  .base-book {
    display: block;
    margin: 10px 18px 0;
    padding: 2px 0;
    font-size: calc(12px * var(--type));
    color: var(--muted);
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .base-book:hover {
    color: var(--text);
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
  .start {
    align-self: flex-start;
    margin: 4px 18px 10px;
    padding: 9px 16px;
    font-size: calc(14px * var(--type));
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--round);
  }
  .start:disabled {
    opacity: 0.6;
  }
  .tag-field {
    font: inherit;
    font-family: var(--font-label);
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 10px;
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
    font-size: calc(var(--title-size) * var(--type));
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
