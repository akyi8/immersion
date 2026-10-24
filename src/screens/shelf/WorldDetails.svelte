<script lang="ts">
  import type { Library, ShelfWorld } from '../../lib/library/types';
  import { withDetails } from '../../lib/world';
  import Dialog from './Dialog.svelte';

  // The name and tagline shown on the world's cover and loading screen. They live in
  // the header of world.md, which is rewritten without touching anything else in it.
  let { library, world, onSaved, onCancel }: { library: Library; world: ShelfWorld; onSaved: () => void; onCancel: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(world.name);
  // svelte-ignore state_referenced_locally
  let tagline = $state(world.tagline);
  let busy = $state(false);
  let problem = $state('');

  async function save() {
    busy = true;
    problem = '';
    try {
      await library.writeWorldMd(world.path, withDetails(world.worldMd ?? '', { name: name.trim(), tagline: tagline.trim() }));
      onSaved();
    } catch (e) {
      problem = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog title="World details" action="Save" ready={!!name.trim()} {busy} {problem} onSubmit={save} {onCancel}>
  <label for="wd-name" class="label">Name</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="wd-name" type="text" bind:value={name} autofocus autocomplete="off" />
  <label for="wd-tagline" class="label">Tagline</label>
  <input id="wd-tagline" type="text" bind:value={tagline} autocomplete="off" placeholder="One line for under the name" />
  <p class="hint">Both are saved in the world's <code>world.md</code>, so Obsidian sees the change too.</p>
</Dialog>

<style>
  code {
    font-family: var(--font-label);
    font-size: 0.9em;
    color: var(--text);
  }
</style>
