<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Card, OutlineSource } from '../../lib/story/outlineSource';
  import type { Thread } from '../../lib/story/threads';
  import type { WikiIndex } from '../../lib/index/wiki';
  import { bands, placed, type Band } from '../../lib/story/structures';
  import { STRUCTURES } from '../../lib/story/guide';
  import { contextMenu } from '../../lib/contextMenu.svelte';
  import Dialog from '../shelf/Dialog.svelte';
  import { counted, plural } from '../../lib/story/book';

  /**
   * Outline view (Mike, October 23 and 25): every chapter as a card, three to a row with
   * tall fields. The cards are the manuscript's chapters, so typing in a card writes that
   * chapter's outline, renaming a card renames the chapter, and adding a card adds one.
   *
   * With more than one thread it becomes the plot grid (Mike, October 25): chapters run
   * along When and threads along Threads, each cell is one thread's beat in one chapter,
   * and Flip swaps which runs across and which runs down.
   */
  let {
    fs,
    source,
    focus = null,
    onWrite,
    onAdded,
    unit = 'chapter',
    partWord = unit === 'book' ? 'Book' : 'Chapter',
    index = null,
    onOpenEntry,
    lead,
    tail,
  }: {
    fs: WorldFs;
    source: OutlineSource;
    /** The chapter to bring into view and put the cursor in. */
    focus?: number | null;
    /** Opens a chapter in the writing view. */
    onWrite: (card: Card) => void;
    onAdded: (at: { path: string; offset: number | null }) => void;
    /** What runs along When: a manuscript's chapters, or a series' books. */
    unit?: 'chapter' | 'book';
    /** What a manuscript's parts are called, such as Chapter or Part (Mike, October 31). */
    partWord?: string;
    /** The wiki, so names in the board's text are lit and linked (Mike, October 31). */
    index?: WikiIndex | null;
    /** Opens a named entry beside the board. */
    onOpenEntry?: (id: string) => void;
    /**
     * The pane's own actions, such as Write and Board and the counts, at the start of the
     * board's row, and its ⋯ at the end, so a pane has one row of actions (Mike, October 31).
     */
    lead?: Snippet;
    tail?: Snippet;
  } = $props();

  // A series board names its books by the series' word, such as Story or Episode, and a
  // manuscript board names its parts by the book's word (Mike, October 31).
  const Unit = $derived(partWord);
  /** The unit in a sentence, such as "chapter" or "episode". */
  const noun = $derived(partWord.toLowerCase());
  const writeLabel = $derived(unit === 'book' ? `Open this ${noun}` : `Write this ${noun}`);

  const SAVE_DELAY_MS = 800;

  let cards = $state<Card[] | null>(null);
  let threads = $state<Thread[]>([{ key: '', name: 'Main plot' }]);
  let problem = $state('');
  let saving = $state(false);
  // Beats waiting to be saved, by card and thread. Titles save when the field is left.
  const pending = new Map<string, { i: number; thread: string; text: string }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let grid: HTMLDivElement | undefined = $state();

  async function load() {
    try {
      cards = await source.load();
      threads = await source.threads();
      structureId = source.structure ? await source.structure() : null;
      problem = '';
    } catch (e) {
      problem = String(e);
    }
  }

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const edits = [...pending];
    pending.clear();
    if (!edits.length) return;
    saving = true;
    try {
      for (const [, e] of edits) await source.setBeat(e.i, e.thread, e.text);
    } catch (e) {
      problem = String(e);
      await load();
    } finally {
      saving = false;
      idle();
    }
  }

  function typed(i: number, text: string, thread = '') {
    // The card keeps what was typed, so leaving the field shows it before it is saved.
    if (cards?.[i]) {
      if (thread) cards[i].beats[thread] = text;
      else cards[i].outline = text;
    }
    pending.set(`${i}:${thread}`, { i, thread, text });
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  async function rename(i: number, title: string) {
    const trimmed = title.trim();
    if (!cards || !trimmed || trimmed === cards[i].title) return;
    await flush();
    try {
      await source.rename(i, trimmed);
      cards[i].title = trimmed;
    } catch (e) {
      problem = String(e);
      await load();
    }
  }

  /** Moves a chapter, with its outline and prose, to another place in the book. */
  async function move(from: number, to: number) {
    if (!cards || to < 0 || to >= cards.length || from === to) return;
    await flush();
    try {
      await source.move(from, to);
      await load();
    } catch (e) {
      problem = String(e);
      await load();
    }
  }

  // Dragging a card by its number moves the chapter to where it is dropped.
  let dragging = $state<number | null>(null);
  let over = $state<number | null>(null);

  // Names on the board (Mike, October 31). A board cell shows its text as written, with
  // the names of wiki entries lit and linked, as the wiki and the writing view do. A click
  // on a name opens the entry beside the board, and a click anywhere else turns the cell
  // into the field to type in, with the cursor where the click was.
  let editing = $state<string | null>(null);
  let caretAt = 0;
  const cellKey = (i: number, thread: string) => `${i}:${thread}`;
  function pieces(text: string): { text: string; id: string | null }[] {
    if (!index || !text) return [{ text, id: null }];
    const out: { text: string; id: string | null }[] = [];
    let at = 0;
    for (const m of index.scanner.find(text)) {
      if (m.start < at) continue;
      if (m.start > at) out.push({ text: text.slice(at, m.start), id: null });
      out.push({ text: text.slice(m.start, m.end), id: m.id });
      at = m.end;
    }
    if (at < text.length) out.push({ text: text.slice(at), id: null });
    return out;
  }
  /** Where in the cell's text a click landed, counted in characters. */
  function offsetAt(cell: HTMLElement, e: MouseEvent): number | null {
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
    const range = pos ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
    const node = pos?.offsetNode ?? range?.startContainer;
    const offset = pos?.offset ?? range?.startOffset ?? 0;
    if (!node || !cell.contains(node)) return null;
    let count = 0;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.parentElement as HTMLElement | null)?.closest('.placeholder')) continue;
      if (n === node) return count + offset;
      count += (n as Text).data.length;
    }
    return null;
  }
  async function startEditing(i: number, thread: string, at: number) {
    editing = cellKey(i, thread);
    caretAt = at;
    await tick();
    const field = grid?.querySelector<HTMLTextAreaElement>(`textarea[data-cell="${editing}"]`);
    if (!field) return;
    field.focus();
    const n = Math.min(caretAt, field.value.length);
    field.setSelectionRange(n, n);
  }
  function cellClick(e: MouseEvent, i: number, thread: string, text: string) {
    const name = (e.target as HTMLElement).closest<HTMLElement>('[data-entry]');
    if (name?.dataset.entry && onOpenEntry) {
      onOpenEntry(name.dataset.entry);
      return;
    }
    void startEditing(i, thread, offsetAt(e.currentTarget as HTMLElement, e) ?? text.length);
  }
  function leaveCell() {
    editing = null;
    void flush();
  }

  // Column widths on the plot grid (Mike, October 31): a story column can be dragged
  // wider by the bar on its right edge, and a double click sets it back. Widths are kept
  // by each chapter's or book's file, on this computer only, like the app's other layout.
  const WIDTHS_KEY = 'immersion.columnWidths';
  const COLUMN = 260;
  function savedWidths(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  }
  let widths = $state<Record<string, number>>(savedWidths());
  function keepWidths() {
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths));
    } catch {
      // Not remembering a width is harmless.
    }
  }
  function resize(e: PointerEvent, path: string) {
    e.preventDefault();
    const bar = e.currentTarget as HTMLElement;
    bar.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const start = widths[path] ?? COLUMN;
    const move = (m: PointerEvent) => (widths = { ...widths, [path]: Math.round(Math.min(900, Math.max(180, start + m.clientX - startX))) });
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      keepWidths();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  }
  function resetWidth(path: string) {
    const { [path]: _, ...rest } = widths;
    widths = rest;
    keepWidths();
  }

  // Story structures (Mike, October 28). With a structure on, the cards sit in one band
  // per part, in story order, with the Unassigned band last. Placing a card in a part
  // records the part in the card's file and moves the card in reading order.
  let structureId = $state<string | null>(null);
  const structure = $derived(STRUCTURES.find((s) => s.id === structureId) ?? null);
  const list = $derived(structure && cards ? bands(structure, cards.map((c) => c.stages)) : null);
  /** The cards in the order they are shown, which is reading order. */
  const shown = $derived(list ? list.flatMap((b) => b.cards) : (cards ?? []).map((_, i) => i));
  const bandOf = (i: number) => list?.find((b) => b.cards.includes(i)) ?? null;
  let guideOpen = $state<string | null>(null);
  let overviewOpen = $state(false);
  let overBand = $state<string | null>(null);
  const bandKey = (b: Band) => b.part?.id ?? 'unassigned';

  async function chooseStructure(id: string) {
    await flush();
    try {
      await source.setStructure?.(id || null);
      guideOpen = null;
      overviewOpen = false;
    } catch (e) {
      problem = String(e);
    }
    await load();
  }

  /** Puts card `card` in part `part` (null for Unassigned), before card `before` or at the end of the band. */
  async function place(card: number, part: string | null, before: number | null) {
    if (!cards || !list || !structure || before === card) return;
    await flush();
    try {
      const order = placed(list, card, part, before);
      if ((bandOf(card)?.part?.id ?? null) !== part) await source.setStage?.(card, structure.id, part);
      if (order.some((c, k) => c !== k)) await source.reorder?.(order);
    } catch (e) {
      problem = String(e);
    }
    await load();
  }

  /** Moves a card one place earlier or later, within its band when a structure is on. */
  function canNudge(i: number, by: -1 | 1): boolean {
    if (!cards) return false;
    if (!list) return i + by >= 0 && i + by < cards.length;
    const b = bandOf(i)!;
    const k = b.cards.indexOf(i) + by;
    return k >= 0 && k < b.cards.length;
  }
  function nudge(i: number, by: -1 | 1) {
    if (!list) return move(i, i + by);
    const b = bandOf(i)!;
    const k = b.cards.indexOf(i);
    return place(i, b.part?.id ?? null, by < 0 ? b.cards[k - 1] : (b.cards[k + 2] ?? null));
  }

  // While a card is dragged, holding it near the edge of the board or its pane scrolls
  // that way, so a part off the screen can still be reached (Mike, October 31).
  const EDGE = 70;
  let dragPoint: { x: number; y: number } | null = null;
  let scrolling = 0;
  function scrollers(): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (let el: HTMLElement | null = grid ?? null; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const x = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const y = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      if (x || y) out.push(el);
    }
    return out;
  }
  function edgeScroll() {
    if (dragging === null || !dragPoint) {
      scrolling = 0;
      return;
    }
    const { x, y } = dragPoint;
    const speed = (d: number) => Math.round(((EDGE - d) / EDGE) * 22);
    for (const box of scrollers()) {
      const r = box.getBoundingClientRect();
      const top = Math.max(r.top, 0);
      const bottom = Math.min(r.bottom, innerHeight);
      if (y - top < EDGE && y >= top) box.scrollTop -= speed(y - top);
      else if (bottom - y < EDGE && y <= bottom) box.scrollTop += speed(bottom - y);
      if (x - r.left < EDGE && x >= r.left) box.scrollLeft -= speed(x - r.left);
      else if (r.right - x < EDGE && x <= r.right) box.scrollLeft += speed(r.right - x);
    }
    scrolling = requestAnimationFrame(edgeScroll);
  }
  function followDrag(e: DragEvent) {
    if (dragging === null) return;
    dragPoint = { x: e.clientX, y: e.clientY };
    if (!scrolling) scrolling = requestAnimationFrame(edgeScroll);
  }

  // Right-click a card for its moves, including Move to, which places it by name (Mike, October 31).
  function cardMenu(e: MouseEvent, i: number) {
    if (!cards) return;
    const card = cards[i];
    contextMenu.show(e, [
      { label: 'Move to…', run: () => (moving = { card: i, part: bandOf(i)?.part?.id ?? null, before: null }) },
      { label: 'Move earlier', run: () => nudge(i, -1), disabled: !canNudge(i, -1) },
      { label: 'Move later', run: () => nudge(i, 1), disabled: !canNudge(i, 1) },
      'separator',
      { label: writeLabel, run: async () => (await flush(), onWrite(card)) },
    ]);
  }
  let moving = $state<{ card: number; part: string | null; before: number | null } | null>(null);
  /** The cards a moved card can be placed before, in the part chosen in the dialog. */
  const neighbours = $derived.by(() => {
    if (!moving || !cards) return [];
    const m = moving;
    const inBand = list ? (list.find((b) => (b.part?.id ?? null) === m.part)?.cards ?? []) : shown;
    return inBand.filter((c) => c !== m.card);
  });
  async function finishMove() {
    if (!moving) return;
    const { card, part, before } = moving;
    moving = null;
    if (list) return place(card, part, before);
    const order = shown.filter((c) => c !== card);
    await move(card, before === null ? order.length : order.indexOf(before));
  }

  /** Where a dragged card lands when dropped on card `i`. */
  function dropOn(i: number) {
    const from = dragging;
    dragging = over = null;
    overBand = null;
    if (from === null || from === i) return;
    if (list) place(from, bandOf(i)?.part?.id ?? null, i);
    else move(from, i);
  }
  function dropOnBand(b: Band) {
    const from = dragging;
    dragging = over = null;
    overBand = null;
    if (from !== null) place(from, b.part?.id ?? null, null);
  }

  /**
   * Where everything sits on the plot grid. Without a structure, the cards run in one
   * line. With one, each part's band spans its cards, and an empty part keeps a slot
   * so a card can be dropped into it.
   */
  const plan = $derived.by(() => {
    if (!cards) return null;
    const segments: Band[] = list ?? [{ part: null, cards: cards.map((_, i) => i) }];
    const on = !!list;
    const heads: { band: Band; style: string }[] = [];
    const slots: { card: number | null; band: Band; n: number; head: string; cells: string[] }[] = [];
    let n = 0;
    if (!flipped) {
      const top = on ? 1 : 0;
      let col = 2;
      for (const band of segments) {
        const start = col;
        for (const card of band.cards.length || !on ? band.cards : [null]) {
          if (card !== null) n++;
          slots.push({ card, band, n, head: `grid-row: ${1 + top}; grid-column: ${col}`, cells: threads.map((_, ti) => `grid-row: ${ti + 2 + top}; grid-column: ${col}`) });
          col++;
        }
        if (on) heads.push({ band, style: `grid-row: 1; grid-column: ${start} / ${col}` });
      }
      return {
        heads,
        slots,
        corner: `grid-row: ${1 + top}; grid-column: 1`,
        threadHead: threads.map((_, ti) => `grid-row: ${ti + 2 + top}; grid-column: 1`),
        add: `grid-row: ${1 + top}; grid-column: ${col}`,
        columns: `200px ${slots.map((s) => (s.card === null ? '210px' : `${widths[cards![s.card].path] ?? COLUMN}px`)).join(' ')} 130px`,
      };
    }
    let row = 2;
    for (const band of segments) {
      if (on) heads.push({ band, style: `grid-row: ${row++}; grid-column: 1 / -1` });
      for (const card of band.cards) {
        n++;
        slots.push({ card, band, n, head: `grid-row: ${row}; grid-column: 1`, cells: threads.map((_, ti) => `grid-row: ${row}; grid-column: ${ti + 2}`) });
        row++;
      }
    }
    return {
      heads,
      slots,
      corner: 'grid-row: 1; grid-column: 1',
      threadHead: threads.map((_, ti) => `grid-row: 1; grid-column: ${ti + 2}`),
      add: `grid-row: ${row}; grid-column: 1`,
      columns: `220px repeat(${threads.length}, 280px)`,
    };
  });

  async function add() {
    await flush();
    try {
      const at = await source.add();
      await load();
      onAdded(at);
      await tick();
      const fields = grid?.querySelectorAll<HTMLTextAreaElement>('.title');
      fields?.[fields.length - 1]?.select();
    } catch (e) {
      problem = String(e);
    }
  }

  // Threads (Mike, October 25).
  function savedFlip(): boolean {
    try {
      return localStorage.getItem('immersion.boardFlip') === 'down';
    } catch {
      return false;
    }
  }
  /** False: chapters run across and threads down. True: the other way round. */
  let flipped = $state(savedFlip());
  function flip() {
    flipped = !flipped;
    try {
      localStorage.setItem('immersion.boardFlip', flipped ? 'down' : 'across');
    } catch {
      // Not remembering the choice is harmless.
    }
  }

  let naming = $state(false);
  let newThread = $state('');
  async function threadAction(run: () => Promise<void>) {
    await flush();
    try {
      await run();
      problem = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    await load();
  }
  async function addThread(event: SubmitEvent) {
    event.preventDefault();
    const name = newThread.trim();
    if (!name) return;
    await threadAction(() => source.addThread(name));
    newThread = '';
    naming = false;
  }
  let removing = $state<string | null>(null);

  /**
   * Grows a field to fit its text, so a long outline never hides inside a scroll box.
   * Measuring collapses the field for a moment, so the pane's scroll position is kept
   * across it, and after typing or pasting the pane follows the cursor, which can
   * otherwise end up below the bottom of the screen (Mike, October 31).
   */
  function grow(el: HTMLTextAreaElement, least: number) {
    const fit = (follow: boolean) => {
      const scroller = scrollParent(el);
      const top = scroller.scrollTop;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, least)}px`;
      scroller.scrollTop = top;
      // The field may have just made its pane long enough to scroll, so look again.
      if (follow && document.activeElement === el) keepCaretInView(el);
    };
    const typed = () => fit(true);
    fit(false);
    el.addEventListener('input', typed);
    return { destroy: () => el.removeEventListener('input', typed) };
  }

  /** The nearest box that scrolls up and down around the field. A plot grid scrolls sideways, so it is passed over. */
  function scrollParent(el: HTMLElement): HTMLElement {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return (document.scrollingElement as HTMLElement) ?? document.documentElement;
  }

  /**
   * Scrolls so the line with the cursor shows, measured with a hidden copy of the field.
   * A plot grid scrolls inside its pane, so every scrolling box around the field takes
   * its turn, from the nearest outward, each keeping the cursor inside what it shows.
   */
  function keepCaretInView(el: HTMLTextAreaElement) {
    const copy = el.cloneNode() as HTMLTextAreaElement;
    copy.style.cssText = `position:absolute;visibility:hidden;height:auto;min-height:0;width:${el.offsetWidth}px`;
    copy.value = el.value.slice(0, el.selectionEnd);
    el.parentElement!.appendChild(copy);
    const depth = copy.scrollHeight;
    copy.remove();
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const margin = 48;
    for (let box = el.parentElement; box; box = box.parentElement) {
      if (!(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight + 1)) continue;
      const rect = box.getBoundingClientRect();
      const view = { top: Math.max(rect.top, 0), bottom: Math.min(rect.bottom, innerHeight) };
      // A field with a height limit scrolls inside itself, so the cursor sits within it.
      const caret = el.getBoundingClientRect().top + Math.min(Math.max(depth - el.scrollTop, line), el.clientHeight);
      if (caret > view.bottom - margin) box.scrollTop += caret - (view.bottom - margin);
      else if (caret - line < view.top + margin) box.scrollTop -= view.top + margin - (caret - line);
    }
  }

  /**
   * Reads the board again, unless something is being typed into it. Then it waits until
   * typing stops, so a reload never pulls text out from under the cursor.
   */
  let stale = false;
  function reloadWhenIdle() {
    if (pending.size || saving || grid?.contains(document.activeElement)) stale = true;
    else void load();
  }
  function idle() {
    if (!stale || pending.size || saving || grid?.contains(document.activeElement)) return;
    stale = false;
    void load();
  }

  // A board handed a new source, such as after its manuscript was read again, reads it.
  let first = true;
  $effect(() => {
    source;
    if (first) first = false;
    else untrack(reloadWhenIdle);
  });

  onMount(() => {
    load().then(async () => {
      if (focus === null) return;
      if (index && cards?.[focus]) editing = cellKey(focus, '');
      await tick();
      const field = index ? grid?.querySelector<HTMLTextAreaElement>(`textarea[data-cell="${cellKey(focus, '')}"]`) : grid?.querySelectorAll<HTMLTextAreaElement>('textarea.body')[focus];
      if (field) {
        field.scrollIntoView({ block: 'center' });
        field.focus();
      } else {
        // On the plot grid, the chapter's header comes into view.
        grid?.querySelectorAll<HTMLElement>('.chapter-head')[focus]?.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    });
    // Changes from elsewhere show up here once nothing typed here is waiting to save.
    const stop = fs.onChange(reloadWhenIdle);
    const left = () => setTimeout(idle, 0);
    document.addEventListener('focusout', left);
    // Heard on the way down, since a card stops the event on its way back up.
    document.addEventListener('dragover', followDrag, true);
    return () => {
      stop();
      document.removeEventListener('focusout', left);
      document.removeEventListener('dragover', followDrag, true);
      cancelAnimationFrame(scrolling);
      void flush();
    };
  });
</script>

{#snippet linkedCell(i: number, thread: string, text: string, kind: 'body' | 'beat', least: number, placeholder: string, label: string)}
  {#if !index || editing === cellKey(i, thread)}
    <textarea
      class={kind}
      data-cell={cellKey(i, thread)}
      use:grow={least}
      value={text}
      {placeholder}
      aria-label={label}
      oninput={(e) => typed(i, (e.currentTarget as HTMLTextAreaElement).value, thread)}
      onblur={leaveCell}></textarea>
  {:else}
    <div
      class="{kind} linked"
      style:min-height="{least}px"
      role="textbox"
      tabindex="0"
      aria-label={label}
      aria-multiline="true"
      onclick={(e) => cellClick(e, i, thread, text)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
          if (e.key === 'Enter') e.preventDefault();
          void startEditing(i, thread, text.length);
        }
      }}>{#each pieces(text) as p}{#if p.id}<span class="mention name" data-entry={p.id}>{p.text}</span>{:else}{p.text}{/if}{/each}{#if !text}<span class="placeholder">{placeholder}</span>{/if}</div>
  {/if}
{/snippet}

{#snippet bandHead(band: Band, style: string)}
  {@const key = bandKey(band)}
  <div
    class="band"
    class:loose={!band.part}
    class:over-band={overBand === key && dragging !== null}
    {style}
    role="group"
    aria-label={band.part ? band.part.name : 'Unassigned'}
    ondragover={(e) => {
      if (dragging === null) return;
      e.preventDefault();
      overBand = key;
    }}
    ondragleave={() => (overBand = overBand === key ? null : overBand)}
    ondrop={(e) => {
      e.preventDefault();
      dropOnBand(band);
    }}>
    <div class="band-row">
      <span class="band-name">{band.part ? band.part.name : 'Unassigned'}</span>
      <span class="band-count" class:empty={!band.cards.length}>{band.cards.length ? `${band.cards.length} ${band.cards.length === 1 ? unit : `${noun}s`}` : `Drag a ${noun} here`}</span>
      {#if band.part}
        <button
          type="button"
          class="guide-toggle"
          aria-expanded={guideOpen === band.part.id}
          title="What belongs in {band.part.name}"
          onclick={() => (guideOpen = guideOpen === band.part!.id ? null : band.part!.id)}>
          Guidance
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" class:open={guideOpen === band.part.id}><path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
      {/if}
    </div>
    {#if band.part && guideOpen === band.part.id}
      <div class="guide">
        {#each band.part.about.split('\n\n') as p}<p>{p}</p>{/each}
        {#if band.part.prompts.length}
          <ul class="prompts">
            {#each band.part.prompts as q}<li>{q}</li>{/each}
          </ul>
        {/if}
        {#if band.part.recommended.length}
          <h4 class="label">Recommended stages</h4>
          <ul class="stages">
            {#each band.part.recommended as st}<li><strong>{st.name}.</strong> {st.essence}</li>{/each}
          </ul>
        {/if}
        {#if band.part.optional.length}
          <h4 class="label">Optional stages</h4>
          <ul class="stages">
            {#each band.part.optional as st}<li><strong>{st.name}.</strong> {st.essence}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet cardView(card: Card, i: number, n: number)}
  <section
    class="card"
    role="group"
    aria-label="{Unit} {n}: {card.title}"
    class:over={over === i && dragging !== null && dragging !== i}
    oncontextmenu={(e) => cardMenu(e, i)}
    ondragover={(e) => {
      if (dragging === null) return;
      e.preventDefault();
      e.stopPropagation();
      over = i;
    }}
    ondragleave={() => (over = over === i ? null : over)}
    ondrop={(e) => {
      e.preventDefault();
      e.stopPropagation();
      dropOn(i);
    }}>
    <div class="top">
      <span
        class="n"
        draggable="true"
        title="Drag to move this {noun}"
        role="button"
        tabindex="-1"
        ondragstart={(e) => {
          dragging = i;
          e.dataTransfer?.setData('text/plain', String(i));
        }}
        ondragend={() => ((dragging = over = null), (overBand = null))}>⋮⋮ {String(n).padStart(2, '0')}</span>
      <span class="move">
        <button type="button" aria-label="Move {card.title} earlier" title="Move earlier" disabled={!canNudge(i, -1)} onclick={() => nudge(i, -1)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2 L4 6 L8 10" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
        <button type="button" aria-label="Move {card.title} later" title="Move later" disabled={!canNudge(i, 1)} onclick={() => nudge(i, 1)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
      </span>
      <span class="words">{card.words ? `${card.words.toLocaleString()} words` : 'Not written yet'}</span>
    </div>
    <textarea
      class="title"
      rows="1"
      use:grow={0}
      value={card.title}
      aria-label="{Unit} {n} title"
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLTextAreaElement).blur();
        }
      }}
      onblur={(e) => rename(i, (e.currentTarget as HTMLTextAreaElement).value.replace(/\s+/g, ' '))}></textarea>
    {@render linkedCell(i, '', card.outline, 'body', 200, `What happens in this ${noun}?`, `What happens in ${card.title}`)}
    <button type="button" class="write" onclick={async () => (await flush(), onWrite(card))}>{writeLabel}</button>
  </section>
{/snippet}

{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
<div class="toolbar">
  {@render lead?.()}
  <span class="spacer"></span>
  {#if cards}
    {#if naming}
      <form class="name-thread" onsubmit={addThread}>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={newThread} placeholder="Mara's arc" aria-label="New thread's name" autofocus autocomplete="off" />
        <button type="submit" class="tool strong" disabled={!newThread.trim()}>Add thread</button>
        <button type="button" class="tool" onclick={() => ((naming = false), (newThread = ''))}>Cancel</button>
      </form>
    {:else}
      <button type="button" class="tool" onclick={() => (naming = true)} title="A plotline, a character's arc, or a timeline that runs alongside the {plural(noun)}">+ Thread</button>
    {/if}
    {#if source.structure}
      <select
        class="tool structure-pick"
        aria-label="Story structure"
        title="Give this board the parts of a story structure"
        value={structureId ?? ''}
        onchange={(e) => chooseStructure((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">No structure</option>
        {#each STRUCTURES as st (st.id)}<option value={st.id}>{st.name}</option>{/each}
      </select>
      {#if structure}
        <button type="button" class="tool" aria-expanded={overviewOpen} onclick={() => (overviewOpen = !overviewOpen)}>About {structure.name}</button>
      {/if}
    {/if}
    {#if threads.length > 1}
      <button
        type="button"
        class="tool"
        onclick={flip}
        title="When runs {flipped ? 'down' : 'across'} and threads run {flipped ? 'across' : 'down'}. Flip swaps them.">Flip</button>
    {/if}
  {/if}
  {@render tail?.()}
</div>
{#if cards}
  {#if structure && overviewOpen}
    <div class="overview">
      {#each structure.overview.split('\n\n') as p}<p>{p}</p>{/each}
    </div>
  {/if}
  {#if threads.length === 1}
  <div class="grid" bind:this={grid}>
    {#if list}
      {#each list as band (bandKey(band))}
        {@render bandHead(band, 'grid-column: 1 / -1')}
        {#each band.cards as i (cards[i].path)}
          {@render cardView(cards[i], i, shown.indexOf(i) + 1)}
        {/each}
      {/each}
    {:else}
      {#each cards as card, i (card.path + ':' + i)}
        {@render cardView(card, i, i + 1)}
      {/each}
    {/if}
    <button type="button" class="card add" onclick={add}>
      <span class="plus" aria-hidden="true">+</span>
      <span>{Unit}</span>
    </button>
  </div>
  {:else if plan}
    <div class="grid board" class:flipped bind:this={grid} style:grid-template-columns={plan.columns}>
      <div class="corner" style={plan.corner}>{flipped ? 'When ↓  Threads →' : 'Threads ↓  When →'}</div>
      {#each plan.heads as h (bandKey(h.band))}
        {@render bandHead(h.band, h.style)}
      {/each}
      {#each threads as t, ti (t.key)}
        <div class="thread-head" style={plan.threadHead[ti]}>
          <input
            class="thread-name"
            value={t.name}
            aria-label="Thread name"
            onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            onblur={(e) => {
              const name = (e.currentTarget as HTMLInputElement).value.trim();
              if (name && name !== t.name) threadAction(() => source.renameThread(t.key, name));
            }} />
          <div class="thread-tools">
            {#if ti > 0}
              <button type="button" aria-label="Move {t.name} {flipped ? 'left' : 'up'}" disabled={ti === 1} onclick={() => threadAction(() => source.moveThread(t.key, -1))}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M8 2 L4 6 L8 10' : 'M2 8 L6 4 L10 8'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
              </button>
              <button type="button" aria-label="Move {t.name} {flipped ? 'right' : 'down'}" disabled={ti === threads.length - 1} onclick={() => threadAction(() => source.moveThread(t.key, 1))}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M4 2 L8 6 L4 10' : 'M2 4 L6 8 L10 4'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
              </button>
              {#if removing === t.key}
                <span class="confirm">
                  Remove its beats?
                  <button type="button" class="yes" onclick={() => ((removing = null), threadAction(() => source.removeThread(t.key)))}>Remove</button>
                  <button type="button" onclick={() => (removing = null)}>Keep</button>
                </span>
              {:else}
                <button type="button" aria-label="Remove {t.name}" title="Remove this thread" onclick={() => (removing = t.key)}>
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.5" /></svg>
                </button>
              {/if}
            {:else}
              <span class="main-note">Main thread</span>
            {/if}
          </div>
        </div>
      {/each}
      {#each plan.slots as slot, si (slot.card === null ? `empty:${bandKey(slot.band)}` : cards[slot.card].path + ':' + slot.card)}
        {#if slot.card === null}
          <div
            class="empty-slot"
            class:over-band={overBand === bandKey(slot.band) && dragging !== null}
            style={slot.head}
            role="group"
            aria-label="Empty {slot.band.part?.name ?? 'Unassigned'}"
            ondragover={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              overBand = bandKey(slot.band);
            }}
            ondragleave={() => (overBand = overBand === bandKey(slot.band) ? null : overBand)}
            ondrop={(e) => {
              e.preventDefault();
              dropOnBand(slot.band);
            }}>
            Drag a {noun} here
          </div>
        {:else}
          {@const i = slot.card}
          {@const card = cards[i]}
          <div
            class="chapter-head"
            class:over={over === i && dragging !== null && dragging !== i}
            oncontextmenu={(e) => cardMenu(e, i)}
            style={slot.head}
            role="group"
            aria-label="{Unit} {slot.n}: {card.title}"
            ondragover={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              over = i;
            }}
            ondragleave={() => (over = over === i ? null : over)}
            ondrop={(e) => {
              e.preventDefault();
              dropOn(i);
            }}>
            <div class="top">
              <span
                class="n"
                draggable="true"
                title="Drag to move this {noun}"
                role="button"
                tabindex="-1"
                ondragstart={(e) => {
                  dragging = i;
                  e.dataTransfer?.setData('text/plain', String(i));
                }}
                ondragend={() => ((dragging = over = null), (overBand = null))}>⋮⋮ {String(slot.n).padStart(2, '0')}</span>
              <span class="move">
                <button type="button" aria-label="Move {card.title} earlier" title="Move earlier" disabled={!canNudge(i, -1)} onclick={() => nudge(i, -1)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M2 8 L6 4 L10 8' : 'M8 2 L4 6 L8 10'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
                </button>
                <button type="button" aria-label="Move {card.title} later" title="Move later" disabled={!canNudge(i, 1)} onclick={() => nudge(i, 1)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={flipped ? 'M2 4 L6 8 L10 4' : 'M4 2 L8 6 L4 10'} fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
                </button>
              </span>
              <span class="words">{card.words ? `${card.words.toLocaleString()} words` : 'Not written yet'}</span>
            </div>
            <textarea
              class="title small"
              rows="1"
              use:grow={0}
              value={card.title}
              aria-label="{Unit} {slot.n} title"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.currentTarget as HTMLTextAreaElement).blur();
                }
              }}
              onblur={(e) => rename(i, (e.currentTarget as HTMLTextAreaElement).value.replace(/\s+/g, ' '))}></textarea>
            <button type="button" class="write" onclick={async () => (await flush(), onWrite(card))}>{writeLabel}</button>
            {#if !flipped}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="col-resize"
                title="Drag to widen this column. Double-click to set it back."
                onpointerdown={(e) => resize(e, card.path)}
                ondblclick={() => resetWidth(card.path)}>
              </div>
            {/if}
          </div>
          {#each threads as t, ti (t.key)}
            <div class="cell" style={slot.cells[ti]}>
              {@render linkedCell(i, t.key, card.beats[t.key] ?? '', 'beat', 110, '—', `${t.name} in ${card.title}`)}
            </div>
          {/each}
        {/if}
      {/each}
      <button type="button" class="add-when" style={plan.add} onclick={add}>+ {Unit}</button>
    </div>
  {/if}
{/if}

{#if moving && cards}
  {@const m = moving}
  <Dialog title="Move {cards[m.card].title}" action="Move" ready={true} busy={false} problem="" onSubmit={finishMove} onCancel={() => (moving = null)}>
    {#if list}
      <label class="label" for="move-part">Into</label>
      <select id="move-part" value={m.part ?? ''} onchange={(e) => (moving = { ...m, part: (e.currentTarget as HTMLSelectElement).value || null, before: null })}>
        {#each list as band (bandKey(band))}<option value={band.part?.id ?? ''}>{band.part?.name ?? 'Unassigned'}</option>{/each}
      </select>
    {/if}
    <label class="label" for="move-before">Place it</label>
    <select id="move-before" value={m.before === null ? '' : String(m.before)} onchange={(e) => (moving = { ...m, before: (e.currentTarget as HTMLSelectElement).value === '' ? null : Number((e.currentTarget as HTMLSelectElement).value) })}>
      {#each neighbours as c (c)}<option value={String(c)}>Before {cards[c].title}</option>{/each}
      <option value="">{list ? 'At the end of the part' : 'At the end'}</option>
    </select>
  </Dialog>
{/if}

<style>
  .band {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    margin-top: 10px;
    border-top: 2px solid var(--structure);
    background: color-mix(in oklab, var(--structure) 7%, transparent);
    border-radius: var(--round);
  }
  .board .band {
    margin-top: 0;
    align-self: stretch;
  }
  .band.loose {
    border-top-color: var(--rule-strong);
    background: none;
  }
  .band.over-band,
  .empty-slot.over-band {
    background: color-mix(in oklab, var(--structure) 18%, transparent);
  }
  .band-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }
  /* Across the plot grid a part can be one column wide, so an empty part's slot says
     where to drop, and opened guidance floats wider than the column. */
  .board:not(.flipped) .band-count.empty {
    display: none;
  }
  .board:not(.flipped) .guide {
    position: relative;
    z-index: 3;
    width: 400px;
    max-width: none;
    padding: 12px 14px;
    background: var(--surface);
    border-radius: var(--round-box);
    box-shadow: 0 12px 30px -12px var(--shadow);
  }
  .band-name {
    font-family: var(--font-display);
    font-size: calc(24px * var(--type));
    letter-spacing: 0.02em;
    color: var(--title);
  }
  .band.loose .band-name {
    color: var(--muted);
  }
  .band-count {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .guide-toggle {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--structure);
    background: none;
    border: 0;
    padding: 4px 6px;
  }
  .guide-toggle svg {
    transition: rotate var(--glide) var(--ease);
  }
  .guide-toggle svg.open {
    rotate: 90deg;
  }
  .guide {
    max-width: 760px;
    font-size: calc(14px * var(--type));
    line-height: 1.55;
    color: var(--text-soft);
  }
  .guide p {
    margin: 0 0 10px;
  }
  .guide ul {
    margin: 0 0 12px;
    padding-left: 20px;
  }
  .guide li {
    margin-bottom: 4px;
  }
  .prompts li {
    color: var(--text);
  }
  .guide h4 {
    margin: 12px 0 6px;
    font-size: calc(11px * var(--type));
    font-weight: 500;
  }
  .stages strong {
    color: var(--text);
  }
  .overview {
    max-width: 760px;
    margin: 0 0 16px;
    font-size: calc(14px * var(--type));
    line-height: 1.55;
    color: var(--text-soft);
  }
  .overview p {
    margin: 0 0 10px;
  }
  .structure-pick {
    cursor: pointer;
  }
  .empty-slot {
    display: grid;
    place-items: center;
    min-height: 120px;
    padding: 12px;
    text-align: center;
    font-size: calc(12px * var(--type));
    color: var(--muted);
    border: 1px dashed var(--edge);
    border-radius: var(--round-box);
  }
  .col-resize {
    position: absolute;
    top: 0;
    right: -5px;
    bottom: 0;
    width: 9px;
    cursor: col-resize;
    z-index: 2;
  }
  .col-resize::after {
    content: '';
    position: absolute;
    top: 25%;
    bottom: 25%;
    left: 4px;
    width: 1px;
    background: var(--structure);
    opacity: 0;
    transition: opacity 120ms;
  }
  .chapter-head:hover .col-resize::after,
  .col-resize:active::after {
    opacity: 0.8;
  }
  .chapter-head.over {
    box-shadow: inset 3px 0 0 var(--structure);
  }
  .grid {
    display: grid;
    /* Three to a row at most (Mike, October 23), fewer when the pane is narrow. */
    grid-template-columns: repeat(auto-fill, minmax(max(250px, calc((100% - 36px) / 3)), 1fr));
    gap: 18px;
    align-items: start;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--round-box);
    padding: 14px 16px 12px;
    min-height: 320px;
    box-sizing: border-box;
  }
  .card:focus-within {
    border-color: var(--hover-edge);
  }
  .card.over {
    border-color: var(--structure);
    box-shadow: inset 3px 0 0 var(--structure);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .n {
    color: var(--structure);
    cursor: grab;
    user-select: none;
  }
  .move {
    display: flex;
    gap: 2px;
    margin-right: auto;
  }
  .move button {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    padding: 0;
  }
  .move button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--edge);
  }
  .move button:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .title {
    font-family: var(--font-display);
    font-size: calc(30px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.1;
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 2px 0;
    width: 100%;
    resize: none;
    overflow: hidden;
  }
  .title:focus {
    outline: none;
    border-bottom-color: var(--structure);
  }
  .body {
    /* Grows to its measured height, never shrinks below it, so a long outline is never cut off. */
    flex: 1 0 auto;
    min-height: 200px;
    resize: none;
    overflow: hidden;
    font: inherit;
    font-size: calc(15px * var(--type));
    line-height: 1.55;
    color: var(--text);
    background: none;
    border: 0;
    padding: 4px 0;
  }
  .body:focus {
    outline: none;
  }
  .body::placeholder {
    color: var(--muted);
  }
  .write {
    align-self: flex-start;
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: none;
    border: 0;
    padding: 6px 0;
  }
  .write:hover {
    color: var(--text);
  }
  .add {
    align-items: center;
    justify-content: center;
    background: none;
    border-style: dashed;
    color: var(--text);
    font-family: var(--font-display);
    font-size: calc(30px * var(--type));
    letter-spacing: 0.02em;
  }
  .add:hover {
    border-style: solid;
    border-color: var(--hover-edge);
  }
  .plus {
    font-size: calc(56px * var(--type));
    line-height: 1;
    color: var(--accent);
  }
  .toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-bottom: 14px;
  }
  .spacer {
    flex: 1;
  }
  .tool {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tool:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .tool.strong {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 700;
  }
  .tool:disabled {
    opacity: 0.5;
  }
  .name-thread {
    display: flex;
    gap: 8px;
  }
  .name-thread input {
    font: inherit;
    font-size: calc(14px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    width: 220px;
  }
  /* The plot grid. Its headers stay in view while the cells scroll under them. */
  .board {
    display: grid;
    gap: 0;
    overflow: auto;
    max-height: 78vh;
    border: 1px solid var(--line);
    border-radius: var(--round-box);
    align-items: stretch;
  }
  .board > * {
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    box-sizing: border-box;
  }
  .corner,
  .chapter-head,
  .thread-head {
    background: var(--surface);
  }
  .corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 3;
    display: flex;
    align-items: flex-end;
    padding: 10px 12px;
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: pre;
  }
  .chapter-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .board.flipped .chapter-head {
    top: auto;
    left: 0;
  }
  .thread-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    position: sticky;
    left: 0;
    z-index: 2;
  }
  .board.flipped .thread-head {
    left: auto;
    top: 0;
  }
  .thread-name {
    font: inherit;
    font-weight: 700;
    font-size: calc(15px * var(--type));
    color: var(--title);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 2px 0;
    width: 100%;
  }
  .thread-name:focus {
    outline: none;
    border-bottom-color: var(--structure);
  }
  .thread-tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
  }
  .thread-tools button {
    min-width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    padding: 0 4px;
    font-size: calc(12px * var(--type));
  }
  .thread-tools button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--edge);
  }
  .thread-tools button:disabled {
    opacity: 0.25;
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: calc(12px * var(--type));
    color: var(--danger);
  }
  .thread-tools .yes {
    color: var(--danger);
  }
  .main-note {
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    color: var(--muted);
  }
  .title.small {
    font-size: calc(22px * var(--type));
  }
  .cell {
    background: var(--bg);
    padding: 8px 12px;
  }
  .cell:focus-within {
    box-shadow: inset 0 0 0 1px var(--structure);
  }
  .beat {
    width: 100%;
    min-height: 110px;
    resize: none;
    overflow: hidden;
    font: inherit;
    font-size: calc(14px * var(--type));
    line-height: 1.5;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
  }
  .beat:focus {
    outline: none;
  }
  .beat::placeholder {
    color: var(--rule-strong);
  }
  .add-when {
    font-family: var(--font-display);
    font-size: calc(22px * var(--type));
    color: var(--text);
    background: none;
    border-style: dashed !important;
    padding: 10px;
  }
  .add-when:hover {
    color: var(--title);
  }
  .problem {
    color: var(--danger);
  }
  /* The writer's board font, when one is chosen in Settings (Mike, October 31). */
  .body,
  .beat {
    font-family: var(--board-font, inherit);
  }
  /* A board cell at rest: the same text, as written, with names lit. */
  .linked {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    cursor: text;
    box-sizing: border-box;
  }
  .linked:focus-visible {
    outline: 1px solid var(--structure);
    outline-offset: 2px;
  }
  .linked .name {
    cursor: pointer;
  }
  .linked .name:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .linked .placeholder {
    color: var(--muted);
    opacity: 0.7;
  }
</style>
