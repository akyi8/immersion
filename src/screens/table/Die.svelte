<script lang="ts">
  /**
   * A die drawn as its own shape (Cerys, November 14), with a number on its face: the die's
   * sides when it is a button, or what it rolled when it is a result.
   */
  let { sides, face, size = 34 }: { sides: number; face: string | number; size?: number } = $props();

  const SHAPES: Record<number, { outline: string; lines?: string }> = {
    4: { outline: '16,3 30,28 2,28' },
    6: { outline: '5,5 27,5 27,27 5,27' },
    8: { outline: '16,2 29,16 16,30 3,16', lines: 'M3 16 L29 16' },
    10: { outline: '16,2 30,13 16,30 2,13', lines: 'M2 13 L16 18 L30 13 M16 18 L16 30' },
    12: { outline: '16,2 30,12 25,29 7,29 2,12' },
    20: { outline: '16,2 28,9 28,23 16,30 4,23 4,9', lines: 'M4 9 L28 9 L16 30 Z' },
    100: { outline: '16,2 30,13 16,30 2,13', lines: 'M2 13 L16 18 L30 13 M16 18 L16 30' },
  };
  const shape = $derived(SHAPES[sides] ?? { outline: '16,2 28,9 28,23 16,30 4,23 4,9' });
  const text = $derived(String(face));
</script>

<svg class="die" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
  <polygon points={shape.outline} />
  {#if shape.lines}<path d={shape.lines} />{/if}
  <text x="16" y={sides === 4 ? 23 : 17} class:small={text.length > 2}>{text}</text>
</svg>

<style>
  .die {
    display: block;
    overflow: visible;
  }
  polygon {
    fill: var(--die-fill, var(--field));
    stroke: var(--die-edge, currentColor);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  path {
    fill: none;
    stroke: var(--die-edge, currentColor);
    stroke-width: 0.7;
    opacity: 0.35;
  }
  text {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 500;
    text-anchor: middle;
    dominant-baseline: middle;
    fill: var(--die-ink, var(--text));
    paint-order: stroke;
    stroke: var(--die-fill, var(--field));
    stroke-width: 3px;
  }
  text.small {
    font-size: 8.5px;
  }
</style>
