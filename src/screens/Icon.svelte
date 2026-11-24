<script lang="ts">
  import { icons } from '../lib/icons.svelte';

  // ICONS TRIAL (Cerys, November 24). One icon, drawn in the color of the text around it.
  let { name, size = 15 }: { name: string | null | undefined; size?: number } = $props();

  const body = $derived(icons.on ? icons.body(name) : null);
  $effect(() => {
    if (icons.on && name) void icons.load();
  });
</script>

{#if body}
  <!-- The drawing comes from the icon package, which the app ships, and never from a world's files. -->
  <svg class="icon" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">{@html body}</svg>
{/if}

<style>
  .icon {
    flex: none;
    display: inline-block;
    vertical-align: -0.15em;
    fill: currentColor;
    margin-inline-end: 0.45em;
  }
</style>
