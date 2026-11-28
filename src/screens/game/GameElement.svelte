<script lang="ts">
  import { errorText } from '../../lib/errors';
  import { retitle } from '../../lib/retitle';
  import GameText from './GameText.svelte';
  import { onDestroy } from 'svelte';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import { bodyLabel, bodyPart, type Element, type Kind } from '../../lib/game/elements';
  import { effective, type Placed } from '../../lib/game/game';
  import { cardOf } from '../../lib/game/card';
  import AspectCard from './AspectCard.svelte';
  import Pick from '../Pick.svelte';
  import { keepWord, word } from '../../lib/prefs';

  /**
   * One element, edited as a form (Cerys, November 7: structured data). Each field of the
   * element's kind gets its own box: a line, a paragraph, or a list with one item a line.
   * Changes save on their own a moment after typing stops.
   *
   * A world's files can set a core element aside or reskin it, and the page shows either
   * where a world has done so. A reskin changes only the name and the flavor, so its
   * mechanics show here read-only, as the core element has them. The page no longer
   * offers to set aside or to reskin (Cerys, November 21), since no game used them and the
   * two controls made every core aspect harder to read.
   *
   * An element of the world's own, or of one of its expansions, can move between them
   * (Cerys, November 9), such as a piece of gear that belongs in an expansion after all.
   */
  let {
    placed,
    kind,
    engineName,
    worldName,
    onSave,
    onSetAside,
    onReskin,
    onOpen,
    where,
    homes = [],
    onMove,
    icon = null,
    tagKey,
  }: {
    placed: Placed;
    kind: Kind | null;
    engineName: string;
    worldName: string;
    onSave: (next: Element, base: Element) => Promise<void>;
    onSetAside: (on: boolean) => void;
    onReskin: () => void;
    onOpen: (key: string) => void;
    /** The name of the engine, world, or expansion the element belongs to. */
    where: string;
    /** Where this element could live instead: the world and each expansion. Empty when it cannot move. */
    homes?: { origin: string; name: string }[];
    onMove?: (origin: string) => Promise<void>;
    /** The kind's icon, for the aspect's card. */
    icon?: string | null;
    /** The keyword a tag names, so the card's tags lead to their keywords. */
    tagKey?: (tag: string) => string | null;
  } = $props();

  let moving = $state(false);
  async function moveTo(origin: string) {
    if (!onMove || origin === placed.origin) return;
    moving = true;
    moveProblem = '';
    try {
      await onMove(origin);
    } catch (e) {
      moveProblem = errorText(e);
    } finally {
      moving = false;
    }
  }

  const SAVE_DELAY_MS = 600;

  // The form holds its own copy while the writer types, seeded from the file.
  let draft = $state<Element>((() => structuredClone($state.snapshot(placed.element)) as Element)());
  // Where the form started, so a save writes only what was changed in it.
  let started = (() => structuredClone($state.snapshot(placed.element)) as Element)();
  // A problem moving the element, which is not a save and so is not the saver's to hold.
  let moveProblem = $state('');
  const saver = new Saver<null>(async () => {
    const next = $state.snapshot(draft) as Element;
    await onSave(next, started);
    // What was just saved is where the next save starts from.
    started = structuredClone(next);
  }, SAVE_DELAY_MS);
  // What is still waiting saves when this page closes. The saver itself answers a closing
  // world or window.
  onDestroy(() => void saver.flush(true));
  const changed = () => saver.push(null);
  const problem = $derived(saver.status === 'problem' ? saver.problem : moveProblem);

  const reskin = $derived(!!placed.base);
  // Reskinning is no longer offered from this page. The files and the module still support it.
  export const offersReskin = () => onReskin;
  const shown = $derived(effective({ ...placed, element: draft }));

  // An aspect's card stands beside its form and redraws as the form is typed in, so the
  // writer sees the moment a face fills (Cerys, November 27).
  const card = $derived(cardOf(shown, kind));
  let flipped = $state(false);

  // An aspect opens as its page in the book (Cerys, November 27): the card first, as it is
  // dealt, and under it what the card has no room for, which is the file's body. The form
  // with the card's fields is one switch away, and the app remembers which was last used.
  const VIEW = 'immersion.game.aspect-view';
  let view = $state<'page' | 'form'>(word(VIEW) === 'form' ? 'form' : 'page');
  async function setView(v: 'page' | 'form') {
    // What is waiting is saved first, so the other view starts from what was just typed.
    await saver.flush();
    view = v;
    keepWord(VIEW, v);
  }
  const asPage = $derived(!!card && view === 'page');

  const fieldText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('\n') : (v ?? ''));

  function setField(key: string, type: string, value: string) {
    draft.fields[key] = type === 'list' ? value.split('\n').filter((l) => l.trim() !== '') : value;
    changed();
  }

  /** A text box that grows with what is typed into it. */
  function grow(el: HTMLTextAreaElement) {
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    el.addEventListener('input', fit);
    return { destroy: () => el.removeEventListener('input', fit) };
  }
</script>

<article class="element" class:carded={!!card}>
  <header>
    <div class="label">
      {where} · {kind?.name ?? draft.kind}
      {#if placed.setAside}<span class="flag">Set aside in {worldName}</span>{/if}
      {#if placed.reskinnedBy}<span class="flag">Reskinned in {worldName}</span>{/if}
    </div>
    <!-- svelte-ignore a11y_missing_content -->
    <h1 use:retitle={{ id: `@el:${placed.key}`, name: draft.name || 'Untitled', rename: async (name) => ((draft.name = name), changed(), null) }}></h1>
    <div class="row">
      <span class="meta">{draft.tags.join(', ')}</span>
      <span class="spacer"></span>
      {#if card}<Pick small label="Show {draft.name} as" value={view} onpick={setView} options={[['page', 'Page'], ['form', 'Form']] as const} />{/if}
      <span class="status {saver.status}" aria-live="polite">{said(saver.status)}</span>
      {#if placed.origin === 'engine'}
        {#if placed.reskinnedBy}
          <button type="button" class="tool" onclick={() => onOpen(placed.reskinnedBy!.key)}>Open the reskin</button>
        {:else if placed.setAside}
          <!-- Setting aside and reskinning stay in the files and leave the page (Cerys, November 21).
               A game that already set this aside can still take it back. -->
          <button type="button" class="tool" onclick={() => onSetAside(false)} title="Bring this core element back into {worldName}'s game">Use in {worldName}</button>
        {/if}
      {:else if placed.base}
        <button type="button" class="tool" onclick={() => onOpen(placed.base!.key)}>Open the core element</button>
      {/if}
    </div>
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  </header>

  {#if placed.origin === 'engine'}
    <p class="note">A core element is in every game built on {engineName}. Changes here reach all of them.</p>
  {/if}
  {#if reskin}
    <p class="note">A reskin of {placed.base?.element.name}. It changes only the name and the flavor; the mechanics below are the core element's.</p>
  {/if}

  {#if asPage && card}
    <div class="bookpage">
      <div class="lead">
        <AspectCard {card} {icon} bind:flipped {tagKey} onOpenTag={onOpen} />
        {#if card.hasDark}<p class="turn">The card, as it is dealt. Click it, or press F on it, to turn it over.</p>{/if}
      </div>
      <GameText
        text={placed.element.flavor}
        self="game:{placed.key}"
        label={bodyLabel(kind)}
        placeholder="What {draft.name || 'this'} is and does, in full sentences, with the rulings a table will ask for. A heading, ## Example, starts a worked example."
        onChange={(t) => {
          draft.flavor = t;
          changed();
        }} />
    </div>
  {:else}
  <div class="sides">
  <div class="form">
    {#if !reskin}
      <label class="field">
        <span class="label">Tags</span>
        <input
          type="text"
          value={draft.tags.join(', ')}
          oninput={(e) => {
            draft.tags = (e.currentTarget as HTMLInputElement).value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            changed();
          }}
          autocomplete="off" />
        <span class="hint">Where it belongs and what it is, separated by commas, such as core, gear, weapon.</span>
      </label>
    {/if}
    {#if homes.length > 1 && onMove}
      <label class="field">
        <span class="label">Belongs to</span>
        <select value={placed.origin} disabled={moving} onchange={(e) => moveTo((e.currentTarget as HTMLSelectElement).value)}>
          {#each homes as h (h.origin)}<option value={h.origin}>{h.name}</option>{/each}
        </select>
        <span class="hint">{worldName} itself, or one of its expansions. Moving it moves its file and its picture.</span>
      </label>
    {/if}
    {#each kind?.layout ?? ['flavor'] as part (part)}
      {#if part === bodyPart(kind) && card}
        <!-- An aspect's page is written on its Page view, under its card. -->
      {:else if part === bodyPart(kind)}
        <!-- The main text is written in the same editor as a rule or a chapter, so it links names and reads the same. -->
        <div class="field">
          <span class="label">{bodyLabel(kind)}</span>
          <GameText
            text={placed.element.flavor}
            self="game:{placed.key}"
            label={bodyLabel(kind)}
            onChange={(t) => {
              draft.flavor = t;
              changed();
            }} />
        </div>
      {:else}
        {@const f = kind?.fields.find((x) => x.key === part)}
        {#if f}
          <label class="field" class:locked={reskin && f.key !== 'flavor'}>
            <span class="label">{f.label}</span>
            {#if reskin && f.key !== 'flavor'}
              <div class="readonly">{fieldText(shown.fields[f.key]) || '—'}</div>
            {:else if f.type === 'line'}
              <input type="text" value={fieldText(draft.fields[f.key])} oninput={(e) => setField(f.key, f.type, (e.currentTarget as HTMLInputElement).value)} autocomplete="off" />
            {:else}
              <textarea
                use:grow
                rows={f.type === 'list' ? 3 : 2}
                value={fieldText(draft.fields[f.key])}
                oninput={(e) => setField(f.key, f.type, (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
            {/if}
            {#if f.type === 'list' && !reskin}<span class="hint">One item a line.</span>{:else if f.hint}<span class="hint">{f.hint}</span>{/if}
          </label>
        {/if}
      {/if}
    {/each}
  </div>
  {#if card}
    <aside class="card">
      <AspectCard {card} {icon} bind:flipped {tagKey} onOpenTag={onOpen} />
      {#if card.hasDark}<p class="turn">Click the card, or press F on it, to turn it over.</p>{/if}
    </aside>
  {/if}
  </div>
  {/if}
</article>

<style>
  article {
    max-width: 720px;
    container-type: inline-size;
  }
  /* An aspect's page is its form with its card beside it. In a narrow pane the card goes first. */
  article.carded {
    max-width: 1060px;
  }
  .sides {
    display: grid;
    grid-template-columns: minmax(0, 720px) auto;
    gap: 32px;
    align-items: start;
  }
  .card {
    position: sticky;
    top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bookpage {
    max-width: 720px;
  }
  .lead {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 18px;
    margin-bottom: 22px;
  }
  .lead .turn {
    max-width: 200px;
  }
  .turn {
    margin: 0;
    max-width: 300px;
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  @container (max-width: 800px) {
    .sides {
      grid-template-columns: minmax(0, 1fr);
    }
    .card {
      position: static;
      order: -1;
    }
  }
  header {
    margin-bottom: 18px;
  }
  h1 {
    color: var(--title);
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(var(--title-size) * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .flag {
    margin-left: 10px;
    color: var(--muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .spacer {
    flex: 1;
  }
  .meta,
  .status {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .status.problem {
    color: var(--danger);
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
  .tool:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .note {
    margin: 0 0 16px;
    font-size: calc(14px * var(--type));
    color: var(--text-soft);
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field .label {
    font-size: calc(11px * var(--type));
  }
  input,
  select,
  textarea {
    font: inherit;
    font-size: calc(15px * var(--type));
    line-height: 1.5;
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 10px;
  }
  textarea {
    resize: vertical;
    min-height: 2.6em;
    overflow: hidden;
  }
  .readonly {
    font-size: calc(15px * var(--type));
    line-height: 1.5;
    color: var(--text-soft);
    white-space: pre-wrap;
    padding: 8px 10px;
    border: 1px dashed var(--edge);
    border-radius: var(--round);
  }
  .hint {
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
</style>
