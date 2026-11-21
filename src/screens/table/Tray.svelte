<script lang="ts">
  import Pick from '../Pick.svelte';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Campaign } from '../../lib/table/index';
  import { chance, diceIn, parseRoll, roll, rollLine, saidRoll, thrown, troubleLine, troubleRoll } from '../../lib/table/dice';
  import { tumble } from '../../lib/table/tumble';
  import { tumbling } from '../../lib/table/tray.svelte';
  import Die from './Die.svelte';
  import { draw, readDecks, readDraws, remaining, writeDraws, type Deck, type Draws } from '../../lib/table/decks';
  import { tray } from '../../lib/table/tray.svelte';

  /**
   * The tray at the foot of the Table sidebar (Mike, November 14): dice and cards. A roll
   * or a drawn card can be written into the session log the writer was last in. Drawn
   * cards are remembered by the campaign.
   */
  let { fs, campaign }: { fs: WorldFs; campaign: Campaign | null } = $props();

  const OPEN = 'immersion.table.tray';
  const saved = (() => {
    try {
      return localStorage.getItem(OPEN);
    } catch {
      return null;
    }
  })();
  let tab = $state<'dice' | 'cards' | null>(saved === 'cards' ? 'cards' : saved === 'shut' ? null : 'dice');
  function show(next: 'dice' | 'cards') {
    tab = tab === next ? null : next;
    try {
      localStorage.setItem(OPEN, tab ?? 'shut');
    } catch {
      // Not remembering the tray is harmless.
    }
  }

  // Dice. The roll is built by clicking the dice (Mike, November 14): a click adds one die
  // of that shape, and a right click takes one away. The roll can also be typed.
  const SHAPES = [4, 6, 8, 10, 12, 20, 100];
  // A world's own game rolls a pool of eight-sided dice and nothing else.
  const own = $derived(campaign?.game === 'own');
  let said = $state('');
  let why = $state('');
  type Shown = { sides: number; value: number; mark?: 'trouble' | 'high' | 'low' };
  let result = $state<{ big: string; small: string; dice: Shown[]; line: (why: string) => string } | null>(null);
  let problem = $state('');
  let wrote = $state(false);
  let rolls = $state(0);

  // A different kind of game starts with an empty roll.
  $effect(() => {
    void own;
    said = '';
    result = null;
  });

  const pool = $derived(parseRoll(said) ?? []);
  const countOf = (sides: number) => pool.filter((t) => t.count && t.sides === sides && t.sign > 0).reduce((n, t) => n + t.count, 0);

  function change(sides: number, by: 1 | -1) {
    const terms = pool.map((t) => ({ ...t }));
    const at = terms.findIndex((t) => t.count && t.sides === sides && t.sign > 0);
    if (at >= 0) {
      terms[at].count += by;
      if (terms[at].count < 1) terms.splice(at, 1);
    } else if (by > 0) {
      // Dice go before plain numbers, so the roll reads 2d6 + 3.
      const numbers = terms.findIndex((t) => !t.count);
      terms.splice(numbers < 0 ? terms.length : numbers, 0, { sign: 1, count: 1, sides });
    }
    if (terms.some((t) => t.count > 99)) return;
    said = terms.some((t) => t.count) ? saidRoll(terms) : '';
    problem = '';
  }

  let rolling = $state(false);
  /** Throws dice across the screen when that is switched on and the computer can draw them. */
  async function land(dice: { qty: number; sides: number }[]) {
    if (!tumbling.on || dice.reduce((n, d) => n + d.qty, 0) > 40) return null;
    rolling = true;
    try {
      return await tumble(dice);
    } finally {
      rolling = false;
    }
  }

  async function throwDice() {
    if (rolling) return;
    wrote = false;
    if (own) return throwTrouble();
    const terms = parseRoll(said);
    if (!terms) {
      problem = said.trim() ? 'Write a roll such as d20, 3d6, or 2d6+3.' : 'Click a die to add it to the roll.';
      return;
    }
    problem = '';
    const landed = await land(diceIn(terms));
    const r = roll(terms, landed ? thrown(landed) : chance);
    rolls++;
    result = {
      big: String(r.total),
      small: r.said,
      dice: r.dice.flatMap((d) => d.values.map((value) => ({ sides: Number(d.said.split('d')[1]), value }))),
      line: (w) => rollLine(r, w),
    };
  }

  // A pool roll: the d8s in the pool are the pressure.
  let edge = $state(7);
  async function throwTrouble() {
    const pressure = countOf(8);
    if (!pressure) {
      problem = 'Click the die once for each point of pressure.';
      return;
    }
    problem = '';
    const landed = await land([{ qty: pressure, sides: 8 }]);
    const r = troubleRoll(pressure, edge, landed ? thrown(landed) : chance);
    rolls++;
    const extras = [r.eights ? `${r.eights} × 8` : '', r.ones ? `${r.ones} × 1` : ''].filter(Boolean).join(' · ');
    result = {
      big: `${r.trouble} trouble`,
      small: `${r.values.length}d8 at edge ${r.edge}${extras ? ` · ${extras}` : ''}`,
      dice: r.values.map((value) => ({ sides: 8, value, mark: value === 8 ? 'high' : value === 1 ? 'low' : value < r.edge ? 'trouble' : undefined })),
      line: (w) => troubleLine(r, w),
    };
  }

  // Cards
  let decks = $state<Deck[]>([]);
  let draws = $state<Draws>({});
  let deckId = $state('poker');
  const deck = $derived(decks.find((d) => d.id === deckId) ?? decks[0] ?? null);
  const drawn = $derived(deck ? (draws[deck.id] ?? []) : []);
  const left = $derived(deck ? remaining(deck, drawn).length : 0);
  let card = $state<string | null>(null);

  // The campaign's path, so a campaign read again from disk does not clear the card on the table.
  const campaignPath = $derived(campaign?.path ?? null);
  $effect(() => {
    const path = campaignPath;
    void readDecks(fs).then((d) => (decks = d));
    card = null;
    if (path) void readDraws(fs, path).then((d) => (draws = d));
    else draws = {};
  });

  async function drawCard() {
    if (!deck || !campaign) return;
    problem = '';
    wrote = false;
    const next = draw(deck, drawn, chance);
    if (!next) {
      problem = 'The deck is spent. Shuffle the cards back to draw again.';
      return;
    }
    card = next;
    const name = deck.name;
    draws = { ...draws, [deck.id]: [...drawn, next] };
    result = { big: '', small: '', dice: [], line: (w) => `Drew from the ${name}${w.trim() ? ` for ${w.trim()}` : ''}: ${next}` };
    try {
      await writeDraws(fs, campaign.path, draws);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  async function shuffle() {
    if (!deck || !campaign) return;
    problem = '';
    card = null;
    draws = { ...draws, [deck.id]: [] };
    try {
      await writeDraws(fs, campaign.path, draws);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  function toLog() {
    if (!result || !tray.target) return;
    tray.target.write(result.line(why));
    wrote = true;
    // What a roll was for belongs to that roll alone.
    why = '';
  }
  const canWrite = $derived(!!result && !!tray.target && ((tab === 'dice' && !!result.big) || (tab === 'cards' && !!card)));
</script>

<section class="tray" class:open={!!tab} aria-label="Dice and cards">
  <div class="tabs">
    <Pick small label="Dice or cards" value={tab} onpick={(v) => v && show(v)} options={[['dice', 'Dice', 'Click again to put the tray away'], ['cards', 'Cards', 'Click again to put the tray away']] as const} />
  </div>
  {#if tab === 'dice'}
    <div class="dice">
      {#each own ? [8] : SHAPES as sides (sides)}
        {@const n = countOf(sides)}
        <button
          type="button"
          class="pick"
          class:in={n > 0}
          aria-label="Add a d{sides}. {n} in the roll. Right click takes one away."
          title="Click to add a d{sides}. Right click to take one away."
          onclick={() => change(sides, 1)}
          oncontextmenu={(e) => (e.preventDefault(), change(sides, -1))}>
          <Die {sides} face={sides === 100 ? '%' : sides} />
          {#if n}<span class="count">{n}</span>{/if}
        </button>
      {/each}
    </div>
    <form class="line" onsubmit={(e) => (e.preventDefault(), throwDice())}>
      {#if own}
        <span class="pool">Pressure {countOf(8)}</span>
        <label class="edge">Edge <input type="number" min="2" max="8" bind:value={edge} /></label>
      {:else}
        <input type="text" aria-label="The roll" bind:value={said} placeholder="Click dice, or type 2d6+3" autocomplete="off" spellcheck="false" />
      {/if}
      <button type="submit" class="go" disabled={rolling}>{rolling ? 'Rolling…' : 'Roll'}</button>
      <button type="button" aria-label="Empty the roll" title="Empty the roll" disabled={!said} onclick={() => ((said = ''), (problem = ''))}>×</button>
    </form>
    {#if result?.big}
      <div class="result" aria-live="polite">
        {#key rolls}
          <div class="rolled">
            {#each result.dice.slice(0, 40) as d, i (i)}
              <span class="landed {d.mark ?? ''}" style:animation-delay="{Math.min(i, 12) * 35}ms"><Die sides={d.sides} face={d.value} size={30} /></span>
            {/each}
          </div>
        {/key}
        <span class="big">{result.big}</span><span class="small">{result.small}</span>
      </div>
    {/if}
  {:else if tab === 'cards'}
    {#if !campaign}
      <p class="hint">Start a campaign to draw cards. A campaign remembers what has been drawn.</p>
    {:else if deck}
      <select aria-label="The deck" bind:value={deckId} onchange={() => (card = null)}>
        {#each decks as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
      </select>
      <div class="line">
        <button type="button" onclick={drawCard}>Draw</button>
        <button type="button" onclick={shuffle} disabled={!drawn.length}>Shuffle back</button>
        <span class="left">{left} of {deck.cards.length} left</span>
      </div>
      {#if card}
        <div class="result" aria-live="polite"><span class="card">{card}</span></div>
      {:else if drawn.length}
        <p class="hint">Last drawn: {drawn.at(-1)}</p>
      {/if}
    {/if}
  {/if}
  {#if tab}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <input class="why" type="text" aria-label="What it is for" bind:value={why} placeholder="What it is for, such as Hunting 12" autocomplete="off" />
    <button type="button" class="tolog" disabled={!canWrite || wrote} onclick={toLog}>
      {#if wrote}In the log{:else if tray.target}Write it in {tray.target.name}{:else}Click in a session log to write it there{/if}
    </button>
  {/if}
</section>

<style>
  .tray {
    flex-shrink: 0;
    border-top: 1px solid var(--line);
    padding: 10px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* An open tray keeps one height, so its controls stay under the pointer while a result
     comes and goes (the design pass, November 15). */
  .tray.open {
    height: 318px;
    box-sizing: border-box;
    overflow-y: auto;
  }
  .tabs,
  .quick,
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  button,
  select,
  input {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--text-soft);
    /* A button has a shape of its own, so it reads as one where the layout draws no lines. */
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 5px 9px;
    min-width: 0;
  }
  input,
  select {
    color: var(--text);
    background: var(--field);
  }
  button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  button:disabled {
    opacity: 0.55;
  }
  .line input[type='text'] {
    flex: 1;
  }
  .dice,
  .rolled {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pick {
    position: relative;
    padding: 3px;
    border-color: transparent;
    color: var(--muted);
  }
  .pick.in {
    color: var(--structure);
    --die-ink: var(--text);
  }
  .count {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 15px;
    padding: 0 3px;
    box-sizing: border-box;
    border-radius: 999px;
    font-size: calc(10px * var(--type));
    line-height: 15px;
    text-align: center;
    color: var(--selected-fg);
    background: var(--selected-bg);
    border: 1px solid var(--selected-border, var(--edge));
  }
  .pool,
  .edge {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .pool {
    flex: 1;
  }
  .edge {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .edge input {
    width: 44px;
  }
  .go {
    color: var(--selected-fg);
    background: var(--selected-bg);
    border-color: var(--selected-border, var(--edge));
  }
  .landed {
    color: var(--structure);
    animation: land 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
  }
  .landed.trouble {
    color: var(--accent);
    --die-fill: var(--accent-wash);
  }
  .landed.high,
  .landed.low {
    --die-ink: var(--accent);
  }
  .landed.low {
    color: var(--accent);
  }
  @keyframes land {
    from {
      opacity: 0;
      transform: translateY(-14px) rotate(-140deg) scale(0.6);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .landed {
      animation: none;
    }
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0;
  }
  .big {
    font-family: var(--font-display);
    font-size: calc(38px * var(--type));
    line-height: 1;
    color: var(--title);
  }
  .card {
    font-family: var(--font-display);
    font-size: calc(24px * var(--type));
    line-height: 1.15;
    color: var(--title);
  }
  .small,
  .left,
  .hint {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
    margin: 0;
    line-height: 1.5;
  }
  .left {
    margin-left: auto;
  }
  .why {
    margin-top: auto;
    width: 100%;
    box-sizing: border-box;
  }
  .tolog {
    text-align: left;
    color: var(--text);
    background: var(--well);
    padding: 8px 10px;
  }
  .tolog:disabled {
    background: none;
  }
  .problem {
    margin: 0;
    font-size: calc(12px * var(--type));
    color: var(--danger, var(--accent));
  }
</style>
