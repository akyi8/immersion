<script lang="ts">
  import { frameStyle, type Frame } from '../../lib/index/frame';

  // An entry's image, framed as the entry says, or its initials on a plain tile when it has none yet.
  let {
    url,
    name,
    size = 'card',
    frame = null,
  }: { url: string | null; name: string; size?: 'card' | 'large' | 'face'; frame?: Frame | null } = $props();

  const initials = $derived(
    name
      .replace(/["'“”‘’]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );
</script>

<div class="portrait {size}">
  {#if url}
    <img src={url} alt="" style={frameStyle(frame)} />
  {:else}
    <span aria-hidden="true">{initials}</span>
  {/if}
</div>

<style>
  .portrait {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--round-box);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .large {
    width: 132px;
    height: 168px;
  }
  .card {
    width: 100%;
    height: 120px;
  }
  .face {
    width: 100%;
    aspect-ratio: 3 / 4;
  }
  img {
    width: 100%;
    height: 100%;
  }
  span {
    font-family: var(--font-display);
    font-size: calc(34px * var(--type));
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .face span {
    font-size: calc(26px * var(--type));
  }
</style>
