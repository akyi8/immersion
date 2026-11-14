<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import type { Campaign } from '../../lib/table/index';
  import { chance, parseRoll, roll, rollLine, troubleLine, troubleRoll } from '../../lib/table/dice';
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

  // Dice
  const QUICK = ['d20', 'd6', '2d6', '3d6', 'd100'];
  let said = $state('d20');
  let why = $state('');
  let result = $state<{ big: string; small: string; line: (why: string) => string } | null>(null);
  let problem = $state('');
  let wrote = $state(false);

  function throwDice(text = said) {
    const terms = parseRoll(text);
    wrote = false;
    if (!terms) {
      problem = 'Write a roll such as d20, 3d6, or 2d6+3.';
      return;
    }
    problem = '';
    said = text;
    const r = roll(terms);
    const each = r.dice.map((d) => d.values.join(', ')).join(' | ');
    result = { big: String(r.total), small: r.dice.length === 1 && r.dice[0].values.length === 1 ? r.said : `${r.said} · ${each}`, line: (w) => rollLine(r, w) };
  }

  // A Beautiful Disasters roll, offered when the campaign uses the world's own game.
  let pressure = $state(4);
  let edge = $state(7);
  function throwTrouble() {
    problem = '';
    wrote = false;
    const r = troubleRoll(pressure, edge);
    const extras = [r.eights ? `${r.eights} × 8` : '', r.ones ? `${r.ones} × 1` : ''].filter(Boolean).join(' · ');
    result = { big: `${r.trouble} trouble`, small: `${r.values.join(', ') || 'no dice'} at edge ${r.edge}${extras ? ` · ${extras}` : ''}`, line: (w) => troubleLine(r, w) };
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
    result = { big: '', small: '', line: (w) => `Drew from the ${name}${w.trim() ? ` for ${w.trim()}` : ''}: ${next}` };
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

<section class="tray" aria-label="Dice and cards">
  <div class="tabs">
    <button type="button" aria-pressed={tab === 'dice'} onclick={() => show('dice')}>Dice</button>
    <button type="button" aria-pressed={tab === 'cards'} onclick={() => show('cards')}>Cards</button>
  </div>
  {#if tab === 'dice'}
    <div class="quick">
      {#each QUICK as q (q)}<button type="button" onclick={() => throwDice(q)}>{q}</button>{/each}
    </div>
    <form class="line" onsubmit={(e) => (e.preventDefault(), throwDice())}>
      <input type="text" aria-label="The roll" bind:value={said} placeholder="2d6+3" autocomplete="off" spellcheck="false" />
      <button type="submit">Roll</button>
    </form>
    {#if campaign?.game === 'own'}
      <div class="line trouble">
        <label>Pressure <input type="number" min="0" max="20" bind:value={pressure} /></label>
        <label>Edge <input type="number" min="2" max="8" bind:value={edge} /></label>
        <button type="button" onclick={throwTrouble}>Roll</button>
      </div>
    {/if}
    {#if result?.big}
      <div class="result" aria-live="polite"><span class="big">{result.big}</span><span class="small">{result.small}</span></div>
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
    background: none;
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
  .tabs button {
    border-color: transparent;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: calc(11px * var(--type));
  }
  .tabs button[aria-pressed='true'] {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .line input[type='text'] {
    flex: 1;
  }
  .trouble label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
  }
  .trouble input {
    width: 46px;
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
    width: 100%;
    box-sizing: border-box;
  }
  .tolog {
    text-align: left;
  }
  .problem {
    margin: 0;
    font-size: calc(12px * var(--type));
    color: var(--danger, var(--accent));
  }
</style>
