<script lang="ts">
  import { errorText } from '../lib/errors';
  import Choice from './Pick.svelte';
  import { splitHeader, withHeader } from '../lib/world';
  import { contrast, HEADING_FONTS, isHex, NIGHT, palette, PROSE_FONTS, themeFrom, themeHeader, type FontChoice, type Mode, type SideOverrides, type ThemeSpec } from '../lib/theme';
  import { mode } from '../lib/mode.svelte';

  /**
   * The theme editor (Cerys, October 25). For the open world it is the Theme group of the
   * Settings page (November 18), which stands to one side while it is open. On the Worlds
   * page it is a panel at the side of the window. Either way the app behind it shows the
   * theme while it is being chosen. A theme is two colors and
   * two fonts, with optional overrides for the background and the text, and it is
   * saved in the world's `world.md`. Its light side is worked out from the same colors,
   * and any of the light side's colors can be chosen by hand.
   */
  let {
    worldMd,
    worldName,
    onPreview,
    onSave,
    onCancel,
    embedded = false,
  }: {
    worldMd: string;
    worldName: string;
    /** Shows a theme on the whole app, on one side, while it is being chosen; null shows Night. */
    onPreview: (spec: ThemeSpec | null, side: Mode) => void;
    /** Saves the new text of `world.md`. */
    onSave: (text: string) => Promise<void>;
    onCancel: () => void;
    /** Set inside the Settings page, as its Theme group, and not as a panel of its own. */
    embedded?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  const start = themeFrom(splitHeader(worldMd).header);
  let own = $state(!!start);
  let base = $state(start?.base ?? NIGHT.base);
  let highlight = $state(start?.highlight ?? NIGHT.highlight);
  let pickBackground = $state(!!start?.background);
  let background = $state(start?.background ?? '#0b0b10');
  let pickText = $state(!!start?.text);
  let text = $state(start?.text ?? '#ece6e3');
  // The side being looked at, which the whole app shows while the panel is open.
  let side = $state<Mode>(mode.current);
  // Light-side colors chosen by hand. Each starts from what would be worked out.
  type Pick = { on: boolean; value: string };
  const pick = (v: string | undefined): Pick => ({ on: !!v, value: v ?? '' });
  let lightPicks = $state<Record<keyof SideOverrides, Pick>>({
    base: pick(start?.light?.base),
    highlight: pick(start?.light?.highlight),
    background: pick(start?.light?.background),
    text: pick(start?.light?.text),
  });
  const LIGHT_ROWS: [keyof SideOverrides, string, string][] = [
    ['base', 'Base', '--structure'],
    ['highlight', 'Highlight', '--accent'],
    ['background', 'Background', '--bg'],
    ['text', 'Text', '--text'],
  ];
  let headings = $state(start?.headings ?? NIGHT.headings);
  let prose = $state(start?.prose ?? NIGHT.prose);
  let busy = $state(false);
  let problem = $state('');

  const spec = $derived<ThemeSpec | null>(
    own
      ? {
          base: isHex(base) ? base : NIGHT.base,
          highlight: isHex(highlight) ? highlight : NIGHT.highlight,
          background: pickBackground && isHex(background) ? background : undefined,
          text: pickText && isHex(text) ? text : undefined,
          headings,
          prose,
          light: lightSide(),
        }
      : null,
  );

  function lightSide(): SideOverrides | undefined {
    const out: SideOverrides = {};
    for (const [key] of LIGHT_ROWS) if (lightPicks[key].on && isHex(lightPicks[key].value)) out[key] = lightPicks[key].value;
    return Object.keys(out).length ? out : undefined;
  }

  /** The light side's colors as they would be worked out, without any chosen by hand. */
  const workedOut = $derived(palette({ ...(spec ?? NIGHT), light: undefined }, 'light'));

  function choose(key: keyof SideOverrides, on: boolean) {
    const tokens = Object.fromEntries(LIGHT_ROWS.map(([k, , t]) => [k, t]));
    lightPicks[key] = { on, value: lightPicks[key].value || workedOut[tokens[key]] };
  }

  $effect(() => onPreview(spec, side));

  // What is saved, to tell whether there is anything to save or to put back.
  let saved = $state<string | null>(null);
  $effect(() => {
    if (saved === null) saved = JSON.stringify(spec);
  });
  const changed = $derived(saved !== null && JSON.stringify(spec) !== saved);

  const colors = $derived(palette(spec ?? NIGHT, side));
  const warning = $derived.by(() => {
    if (!spec) return '';
    const ratio = contrast(colors['--text'], colors['--bg']);
    if (ratio < 7) return `The text and the background are close in brightness (contrast ${ratio.toFixed(1)} to 1), so long reading will tire the eyes. A darker background or a lighter text helps.`;
    const apart = Math.abs(hue(colors['--structure']) - hue(colors['--accent'])) % 360;
    if (Math.min(apart, 360 - apart) < 25)
      return 'The base and the highlight are close in hue, so names and structure will be hard to tell apart.';
    return '';
  });

  function hue(hexColor: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hexColor.replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  }

  async function save() {
    busy = true;
    problem = '';
    try {
      await onSave(withHeader(worldMd, { theme: spec ? themeHeader(spec) : undefined }));
      saved = JSON.stringify(spec);
    } catch (e) {
      problem = errorText(e);
    } finally {
      busy = false;
    }
  }

  const groups = (list: FontChoice[]) => (['Sans', 'Serif', 'Mono', 'Display'] as const).map((k) => [k, list.filter((f) => f.kind === k)] as const).filter(([, fonts]) => fonts.length);
</script>

<svelte:window onkeydown={(e) => !embedded && e.key === 'Escape' && (e.preventDefault(), onCancel())} />

<svelte:element this={embedded ? 'div' : 'aside'} class="panel" class:embedded aria-label="Theme for {worldName}">
  {#if !embedded}
    <h2>Theme</h2>
    <p class="for">for {worldName}</p>
  {/if}

  <Choice fill label="Theme" value={own} onpick={(v) => (own = v)} options={[[false, 'Night and Ink and Paper'], [true, 'Its own theme']] as const} />

  {#if own}
    <h3 class="label">Colors</h3>
    <div class="color">
      <input type="color" bind:value={base} aria-label="Base color" />
      <div>
        <div class="name">Base</div>
        <div class="about">Lines, labels, and quiet buttons</div>
      </div>
      <input type="text" class="hex" bind:value={base} aria-label="Base color as hex" spellcheck="false" />
    </div>
    <div class="color">
      <input type="color" bind:value={highlight} aria-label="Highlight color" />
      <div>
        <div class="name">Highlight</div>
        <div class="about">Titles, names, and what is selected</div>
      </div>
      <input type="text" class="hex" bind:value={highlight} aria-label="Highlight color as hex" spellcheck="false" />
    </div>
  {/if}

  <h3 class="label">{own ? 'Each side' : 'Sides'}</h3>
  <Choice fill label="Side" value={side} onpick={(v) => (side = v)} options={[['dark', 'Dark side'], ['light', 'Light side']] as const} />

  {#if own && side === 'dark'}
    <label class="check"><input type="checkbox" bind:checked={pickBackground} /> Choose the background myself</label>
    {#if pickBackground}
      <div class="color">
        <input type="color" bind:value={background} aria-label="Background color" />
        <div><div class="name">Background</div></div>
        <input type="text" class="hex" bind:value={background} aria-label="Background color as hex" spellcheck="false" />
      </div>
    {/if}
    <label class="check"><input type="checkbox" bind:checked={pickText} /> Choose the text color myself</label>
    {#if pickText}
      <div class="color">
        <input type="color" bind:value={text} aria-label="Text color" />
        <div><div class="name">Text</div></div>
        <input type="text" class="hex" bind:value={text} aria-label="Text color as hex" spellcheck="false" />
      </div>
    {/if}
    {#if warning}<p class="warning">{warning}</p>{/if}
  {:else if own}
    <p class="about">The light side is worked out from the same two colors. The darker one leads, taking titles, names, and what is selected, and the other tints the page and draws the lines. Any of its colors can be chosen by hand.</p>
    {#each LIGHT_ROWS as [key, label, token]}
      <label class="check"><input type="checkbox" checked={lightPicks[key].on} onchange={(e) => choose(key, (e.currentTarget as HTMLInputElement).checked)} /> Choose the light side's {label.toLowerCase()} myself</label>
      {#if lightPicks[key].on}
        <div class="color">
          <input type="color" bind:value={lightPicks[key].value} aria-label="Light {label.toLowerCase()} color" />
          <div><div class="name">{label}</div><div class="about">Worked out: {workedOut[token]}</div></div>
          <input type="text" class="hex" bind:value={lightPicks[key].value} aria-label="Light {label.toLowerCase()} color as hex" spellcheck="false" />
        </div>
      {/if}
    {/each}
    {#if warning}<p class="warning">{warning}</p>{/if}
  {/if}

  {#if own}
    <h3 class="label">Headings</h3>
    {#each groups(HEADING_FONTS) as [kind, fonts]}
      <div class="kind">{kind}</div>
      <div class="fonts">
        {#each fonts as f}
          <button type="button" class="font heading" class:on={headings === f.name} aria-pressed={headings === f.name} style:font-family={f.stack} onclick={() => (headings = f.name)}>
            {f.name}
          </button>
        {/each}
      </div>
    {/each}

    <h3 class="label">Prose</h3>
    {#each groups(PROSE_FONTS) as [kind, fonts]}
      <div class="kind">{kind}</div>
      <div class="fonts">
        {#each fonts as f}
          <button type="button" class="font prose-font" class:on={prose === f.name} aria-pressed={prose === f.name} style:font-family={f.stack} onclick={() => (prose = f.name)}>
            {f.name} <em>reads like this</em>
          </button>
        {/each}
      </div>
    {/each}
  {:else}
    <p class="about night">
      {side === 'dark'
        ? "Night is the app's own dark theme: teal structure, amber names, Bebas Neue headings, and Atkinson Hyperlegible prose."
        : "Ink and Paper is the app's own light theme: a warm page, oxblood names, Playfair Display headings, and Literata prose."}
    </p>
  {/if}

  <div class="sample" aria-hidden="true">
    <div class="label">Sample</div>
    <div class="sample-title">The Long Road</div>
    <p>The ferry left at dawn, and <span class="sample-name">Mara Vell</span> watched the harbor shrink. <em>Not long now,</em> she thought.</p>
    <span class="sample-button">Create</span>
  </div>

  {#if problem}<p class="warning" role="alert">{problem}</p>{/if}
  <div class="actions">
    {#if embedded}
      <button type="button" class="cancel" disabled={!changed} onclick={onCancel}>Put it back</button>
      <button type="button" class="save" disabled={busy || !changed} onclick={save}>{changed ? 'Save the theme' : 'Saved'}</button>
    {:else}
      <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
      <button type="button" class="save" disabled={busy} onclick={save}>Save</button>
    {/if}
  </div>
</svelte:element>

<style>
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, 100vw);
    box-sizing: border-box;
    overflow-y: auto;
    z-index: 25;
    background: var(--surface);
    border-left: 1px solid var(--edge);
    box-shadow: -12px 0 32px var(--shadow);
    padding: 24px 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel.embedded {
    position: static;
    width: auto;
    overflow: visible;
    z-index: auto;
    background: none;
    border: 0;
    box-shadow: none;
    padding: 6px 0 0;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(40px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .for {
    margin: 0 0 8px;
    color: var(--muted);
    font-size: calc(14px * var(--type));
  }
  h3 {
    margin: 18px 0 2px;
    font-size: calc(11px * var(--type));
    font-weight: 400;
  }
  .color {
    display: grid;
    grid-template-columns: 44px 1fr 96px;
    gap: 10px;
    align-items: center;
  }
  input[type='color'] {
    width: 44px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--edge);
    border-radius: var(--round);
    background: var(--well);
  }
  .name {
    font-size: calc(14px * var(--type));
  }
  .about {
    font-size: calc(12px * var(--type));
    color: var(--muted);
    line-height: 1.4;
  }
  .night {
    font-size: calc(14px * var(--type));
    margin: 8px 0;
  }
  .hex {
    font-family: var(--font-label);
    font-size: calc(13px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 7px 8px;
    width: 100%;
    box-sizing: border-box;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    margin-top: 4px;
  }
  .warning {
    margin: 4px 0 0;
    font-size: calc(13px * var(--type));
    line-height: 1.45;
    color: var(--danger);
  }
  .kind {
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-top: 6px;
  }
  .fonts {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .font {
    text-align: left;
    color: var(--text);
    background: none;
    border: 1px solid transparent;
    padding: 6px 10px;
  }
  .font:hover {
    border-color: var(--edge);
  }
  .font.on {
    border-color: var(--structure);
    background: var(--structure-deep);
  }
  .heading {
    font-size: calc(24px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.15;
  }
  .prose-font {
    font-size: calc(16px * var(--type));
  }
  .prose-font em {
    color: var(--text-soft);
  }
  .sample {
    margin-top: 18px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: var(--round-box);
    background: var(--bg);
  }
  .sample-title {
    font-family: var(--font-display);
    font-size: calc(34px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1.05;
    margin: 6px 0 8px;
  }
  .sample p {
    margin: 0 0 12px;
    font-family: var(--font-body);
    font-size: calc(16px * var(--type));
    line-height: 1.6;
  }
  .sample-name {
    color: var(--accent);
    border-bottom: 1px solid var(--accent-wash);
  }
  .sample-button {
    display: inline-block;
    font-weight: 700;
    font-size: calc(13px * var(--type));
    color: var(--accent-ink);
    background: var(--accent);
    padding: 8px 14px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  .actions button {
    font-size: calc(14px * var(--type));
    padding: 10px 16px;
    min-height: 44px;
    border: 0;
  }
  .cancel {
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--edge) !important;
    border-radius: var(--round);
  }
  .save {
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
  }
  .save:disabled {
    opacity: 0.5;
  }
</style>
