<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import { PANE } from '../lib/pane.svelte';

  /** Tells the page inside which pane it is in, so the page can add to that pane's view menu. */
  let { id, children }: { id: string; children: Snippet } = $props();
  // svelte-ignore state_referenced_locally
  setContext(PANE, { id });
</script>

{@render children()}
