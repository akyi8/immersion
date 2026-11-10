<script lang="ts">
  import Dialog from '../shelf/Dialog.svelte';
  import { BANNER_RATIO, BEHIND_RATIO, CENTERED, MAX_ZOOM, defaultShape, dragged, frameStyle, tidy, type Frame, type Shape } from '../../lib/index/frame';

  /**
   * Framing an entry's picture (Mike, November 1). The picture is dragged inside a fixed
   * frame and zoomed with the slider or the scroll wheel, once as a banner and once as a
   * portrait, and the entry chooses which of the two shows at its top. The picture file
   * itself is never changed.
   */
  let {
    url,
    category,
    shape: chosen,
    portrait: portraitStart,
    banner: bannerStart,
    behind: behindStart = null,
    busy,
    problem,
    bannerOnly = false,
    onSave,
    onCancel,
  }: {
    url: string;
    category: string;
    /** The entry's own choice, or null to follow its category. */
    shape: Shape | null;
    portrait: Frame | null;
    banner: Frame | null;
    /** How the picture is framed when it lies behind the page. */
    behind?: Frame | null;
    busy: boolean;
    problem: string;
    /** Frames the banner alone, for a page that never shows a portrait, such as a rule in a game's book. */
    bannerOnly?: boolean;
    onSave: (result: { shape: Shape | null; portrait: Frame; banner: Frame; behind: Frame }) => void;
    onCancel: () => void;
  } = $props();

  const fallback = $derived(defaultShape(category));
  // Seeded once from the entry; the dialog then holds its own edits.
  let shape = $state<Shape>((() => chosen ?? defaultShape(category))());
  let frames = $state<Record<Shape, Frame>>((() => ({ portrait: portraitStart ?? CENTERED, banner: bannerStart ?? CENTERED, behind: behindStart ?? CENTERED }))());
  let natural = $state<{ width: number; height: number } | null>(null);

  let drag: { which: Shape; x: number; y: number; box: DOMRect } | null = null;

  function down(which: Shape, e: PointerEvent) {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { which, x: e.clientX, y: e.clientY, box };
  }
  function move(e: PointerEvent) {
    if (!drag || !natural) return;
    frames[drag.which] = dragged(frames[drag.which], e.clientX - drag.x, e.clientY - drag.y, drag.box, natural);
    drag.x = e.clientX;
    drag.y = e.clientY;
  }
  function up() {
    drag = null;
  }
  function wheel(which: Shape, e: WheelEvent) {
    e.preventDefault();
    const f = frames[which];
    frames[which] = tidy({ ...f, zoom: f.zoom * Math.exp(-e.deltaY * 0.0015) });
  }
  function key(which: Shape, e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 2;
    const f = frames[which];
    const moves: Record<string, Partial<Frame>> = {
      ArrowLeft: { x: f.x - step },
      ArrowRight: { x: f.x + step },
      ArrowUp: { y: f.y - step },
      ArrowDown: { y: f.y + step },
      '+': { zoom: f.zoom + 0.1 },
      '=': { zoom: f.zoom + 0.1 },
      '-': { zoom: f.zoom - 0.1 },
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    frames[which] = tidy({ ...f, ...moves[e.key] });
  }

  function save() {
    onSave({ shape: shape === fallback ? null : shape, portrait: frames.portrait, banner: frames.banner, behind: frames.behind });
  }
</script>

{#snippet framer(which: Shape, title: string, note: string)}
  <div class="framer {which}" class:in-use={shape === which}>
    <div class="label">{title}<span class="note">{note}</span></div>
    <div
      class="box"
      style:aspect-ratio={which === 'banner' ? BANNER_RATIO : which === 'behind' ? BEHIND_RATIO : 3 / 4}
      role="slider"
      tabindex="0"
      aria-label="{title} framing. Arrow keys move the picture, plus and minus zoom."
      aria-valuenow={frames[which].zoom}
      aria-valuemin={1}
      aria-valuemax={MAX_ZOOM}
      onpointerdown={(e) => down(which, e)}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onwheel={(e) => wheel(which, e)}
      onkeydown={(e) => key(which, e)}>
      <img
        src={url}
        alt=""
        draggable="false"
        style={frameStyle(frames[which])}
        onload={(e) => (natural = { width: (e.currentTarget as HTMLImageElement).naturalWidth, height: (e.currentTarget as HTMLImageElement).naturalHeight })} />
    </div>
    <div class="controls">
      <input
        type="range"
        min="1"
        max={MAX_ZOOM}
        step="0.01"
        aria-label="{title} zoom"
        value={frames[which].zoom}
        oninput={(e) => (frames[which] = tidy({ ...frames[which], zoom: Number((e.currentTarget as HTMLInputElement).value) }))} />
      <button type="button" class="reset" onclick={() => (frames[which] = CENTERED)}>Center</button>
    </div>
  </div>
{/snippet}

<Dialog title="Frame the picture" action="Save" ready={true} {busy} {problem} onSubmit={save} {onCancel} wide>
  {#if !bannerOnly}<div class="shows">
    <span class="label">Shows as</span>
    <div class="seg" role="group" aria-label="Shows as">
      <button type="button" class:on={shape === 'banner'} aria-pressed={shape === 'banner'} onclick={() => (shape = 'banner')}>Banner</button>
      <button type="button" class:on={shape === 'portrait'} aria-pressed={shape === 'portrait'} onclick={() => (shape = 'portrait')}>Portrait</button>
      <button type="button" class:on={shape === 'behind'} aria-pressed={shape === 'behind'} onclick={() => (shape = 'behind')}>Behind the page</button>
    </div>
    <span class="hint">{fallback === 'portrait' ? 'People' : 'Entries outside People'} show a {fallback} unless you choose otherwise.</span>
  </div>{/if}
  <p class="hint">Drag the picture to move it, and zoom with the slider or the scroll wheel.</p>
  <div class="frames">
    {@render framer('banner', 'Banner', '')}
    {#if !bannerOnly}{@render framer('portrait', 'Portrait', 'also its face')}{/if}
  </div>
  {#if !bannerOnly}
    <div class="frames one">
      {@render framer('behind', 'Behind the page', 'low on the page, fading upward, with the name up the spine')}
    </div>
  {/if}
</Dialog>

<style>
  .shows {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .seg {
    display: flex;
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .seg button {
    font-size: calc(13px * var(--type));
    color: var(--muted);
    background: none;
    border: 0;
    padding: 6px 12px;
    min-height: 32px;
  }
  .seg button.on {
    color: var(--selected-fg);
    background: var(--selected-bg);
  }
  .hint {
    margin: 0;
    font-size: calc(13px * var(--type));
    color: var(--muted);
  }
  .frames.one {
    grid-template-columns: minmax(0, 420px);
    margin-top: 14px;
  }
  /* What lies behind the page fades upward there, so its frame shows the fade. */
  .framer.behind .box img {
    -webkit-mask-image: linear-gradient(to top, black 30%, rgb(0 0 0 / 0.35) 75%, rgb(0 0 0 / 0.12) 100%);
    mask-image: linear-gradient(to top, black 30%, rgb(0 0 0 / 0.35) 75%, rgb(0 0 0 / 0.12) 100%);
  }
  .frames {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 160px;
    gap: 20px;
    align-items: start;
    margin-top: 6px;
  }
  .framer .label {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 6px;
    font-size: calc(11px * var(--type));
  }
  .note {
    color: var(--muted);
    text-transform: none;
    letter-spacing: 0;
  }
  .box {
    position: relative;
    overflow: hidden;
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round-box);
    cursor: grab;
    touch-action: none;
    opacity: 0.6;
    transition: opacity 150ms;
  }
  .in-use .box {
    opacity: 1;
    border-color: var(--structure);
  }
  .box:active {
    cursor: grabbing;
  }
  .box:focus-visible {
    outline: 2px solid var(--structure);
    outline-offset: 2px;
  }
  .box img {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
    pointer-events: none;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }
  .controls input {
    flex: 1;
    min-width: 0;
    accent-color: var(--structure);
  }
  .reset {
    font-size: calc(12px * var(--type));
    color: var(--structure);
    background: none;
    border: 0;
    padding: 4px 0;
  }
  @media (max-width: 620px) {
    .frames {
      grid-template-columns: 1fr;
    }
  }
</style>
