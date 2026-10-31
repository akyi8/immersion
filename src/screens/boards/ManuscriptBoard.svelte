<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import type { Manuscript } from '../../lib/story/index';
  import { folderSource } from '../../lib/story/outlineSource';
  import OutlineView from '../story/OutlineView.svelte';
  import BoardTitle from './BoardTitle.svelte';
  import { renamePiece } from '../../lib/story/manage';
  import { saveAllUnder } from '../../lib/saves';

  /** One manuscript's board, its chapters by its threads, as the Boards module shows it. */
  let {
    fs,
    manuscript,
    onWrite,
    onRenamed,
  }: { fs: WorldFs; manuscript: Manuscript; onWrite: (path: string) => void; onRenamed?: (from: string, to: string) => void } = $props();

  const PLACES = { desk: 'On the desk', drawer: 'In the drawer', shelf: 'On the shelf' };
  const source = $derived(folderSource(fs, manuscript));
</script>

<article class="board">
  <header>
    <div class="label">{PLACES[manuscript.place]} · Board</div>
    {#if onRenamed}
      <BoardTitle
        name={manuscript.title}
        label="Manuscript title"
        onRename={async (title) => {
          await saveAllUnder(manuscript.path);
          const to = await renamePiece(fs, manuscript.path, title);
          onRenamed(manuscript.path, to);
        }} />
    {:else}
      <h1>{manuscript.title}</h1>
    {/if}
  </header>
  {#key manuscript.path}
    <OutlineView {fs} {source} partWord={manuscript.partWord} onWrite={(card) => onWrite(card.path)} onAdded={() => {}} />
  {/key}
</article>

<style>
  h1 {
    color: var(--title);
    margin: 4px 0 18px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(60px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
</style>
