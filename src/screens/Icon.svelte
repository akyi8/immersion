<script lang="ts">
  import { icons } from '../lib/icons.svelte';

  // ICONS TRIAL (Cerys, November 24). One icon, drawn in one of the world's own colors.
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
    /* An icon wears the world's second color, so it stands apart from the name beside it
       (Cerys, November 24). A row or a title sets --icon to give it another: the accent on
       the row that is open, and the title's own color in a title. */
    color: var(--icon, var(--structure));
    fill: currentColor;
    margin-inline-end: 0.5em;
  }
</style>
