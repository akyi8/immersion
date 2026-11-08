<script lang="ts">
  import type { Placed } from '../../lib/game/game';

  /**
   * A module of the rulebook (Mike, November 8): one major rule, or a major rule with a
   * few minor ones. A core module has its engine's piece, which every game built on it prints,
   * and this world's piece, mostly its examples, side by side. A module of the world's own
   * has only the world's piece. Each piece saves on its own a moment after typing stops.
   */
  let {
    module,
    worldPiece,
    chapterName,
    engineName,
    worldName,
    onSaveModule,
    onSaveWorldPiece,
  }: {
    module: Placed;
    /** This world's piece of a core module, if it has one yet. */
    worldPiece: Placed | null;
    chapterName: string;
    engineName: string;
    worldName: string;
    onSaveModule: (name: string, text: string) => Promise<void>;
    /** Saves the world's piece, creating it the first time. */
    onSaveWorldPiece: (text: string) => Promise<void>;
  } = $props();

  const SAVE_DELAY_MS = 700;
  const core = $derived(module.origin === 'engine');

  // Each box holds its own copy while the writer types, seeded once from the files.
  let name = $state((() => module.element.name)());
  let text = $state((() => module.element.flavor)());
  let world = $state((() => worldPiece?.element.flavor ?? '')());
  let status = $state<Record<'module' | 'world', 'saved' | 'editing' | 'saving' | 'problem'>>({ module: 'saved', world: 'saved' });
  let problem = $state('');
  const timers: Record<string, ReturnType<typeof setTimeout> | null> = { module: null, world: null };

  function changed(which: 'module' | 'world') {
    status[which] = 'editing';
    const t = timers[which];
    if (t) clearTimeout(t);
    timers[which] = setTimeout(() => save(which), SAVE_DELAY_MS);
  }

  async function save(which: 'module' | 'world') {
    timers[which] = null;
    status[which] = 'saving';
    try {
      if (which === 'module') await onSaveModule(name.trim() || module.element.name, text);
      else await onSaveWorldPiece(world);
      status[which] = 'saved';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      status[which] = 'problem';
    }
  }

  const said = (s: string) => (s === 'saved' ? 'Saved' : s === 'saving' ? 'Saving…' : s === 'editing' ? 'Editing' : 'Not saved');

  /** A text box that grows with what is typed into it. */
  function grow(el: HTMLTextAreaElement) {
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight + 2, 140)}px`;
    };
    fit();
    el.addEventListener('input', fit);
    return { destroy: () => el.removeEventListener('input', fit) };
  }
</script>

<article class="module" class:pair={core}>
  <header>
    <div class="label">{chapterName} · {core ? 'Module' : `${worldName} module`}</div>
    <input class="title" type="text" bind:value={name} oninput={() => changed('module')} aria-label="Module name" autocomplete="off" />
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  </header>
  <div class="pieces">
    <section class="piece">
      <div class="piece-head">
        <span class="label">{core ? engineName : worldName}</span>
        <span class="status">{said(status.module)}</span>
      </div>
      {#if core}<p class="hint">Every game built on {engineName} prints this.</p>{/if}
      <textarea use:grow bind:value={text} oninput={() => changed('module')} aria-label="{core ? engineName : worldName} text"></textarea>
    </section>
    {#if core}
      <section class="piece world">
        <div class="piece-head">
          <span class="label">{worldName}</span>
          <span class="status">{said(status.world)}</span>
        </div>
        <p class="hint">{worldName}'s add-on to this module, and its examples. Only {worldName}'s book prints this.</p>
        <textarea use:grow bind:value={world} oninput={() => changed('world')} aria-label="{worldName} text" placeholder="Examples and rules that are {worldName}'s alone."></textarea>
      </section>
    {/if}
  </div>
</article>

<style>
  article {
    container-type: inline-size;
  }
  article:not(.pair) {
    max-width: 760px;
  }
  header {
    margin-bottom: 14px;
  }
  .title {
    display: block;
    width: 100%;
    margin: 4px 0 4px;
    box-sizing: border-box;
    color: var(--title);
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(44px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.05;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--round);
    padding: 2px 4px;
  }
  .title:hover,
  .title:focus {
    border-color: var(--edge);
    outline: none;
  }
  .pieces {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
  }
  /* Side by side when the pane is wide enough, one above the other when it is not. */
  @container (min-width: 900px) {
    .pair .pieces {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
  .piece-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }
  .piece-head .label {
    font-size: calc(11px * var(--type));
  }
  .status {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .hint {
    margin: 0 0 6px;
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-family: var(--font-body);
    font-size: calc(15px * var(--type));
    line-height: 1.6;
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 12px 14px;
    resize: vertical;
    overflow: hidden;
  }
  .world textarea {
    border-color: var(--structure-deep, var(--edge));
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
</style>
