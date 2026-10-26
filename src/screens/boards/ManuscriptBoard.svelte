<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import type { Manuscript } from '../../lib/story/index';
  import { folderSource } from '../../lib/story/outlineSource';
  import OutlineView from '../story/OutlineView.svelte';

  /** One manuscript's board, its chapters by its threads, as the Boards module shows it. */
  let { fs, manuscript, onWrite }: { fs: WorldFs; manuscript: Manuscript; onWrite: (path: string) => void } = $props();

  const PLACES = { desk: 'On the desk', drawer: 'In the drawer', shelf: 'On the shelf' };
  const source = $derived(folderSource(fs, manuscript));
</script>

<article class="board">
  <header>
    <div class="label">{PLACES[manuscript.place]} · Board</div>
    <h1>{manuscript.title}</h1>
  </header>
  {#key manuscript.path}
    <OutlineView {fs} {source} onWrite={(card) => onWrite(card.path)} onAdded={() => {}} />
  {/key}
</article>

<style>
  h1 {
    color: var(--title);
    margin: 4px 0 18px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 60px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
</style>
