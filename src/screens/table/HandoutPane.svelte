<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import { retitle } from '../../lib/retitle';

  /**
   * A handout that is a picture (Cerys, November 14): a map, a letter, a portrait. It shows
   * whole, as large as the page allows. In a window of its own it fills the window, so it
   * can be shared on a call.
   */
  let {
    fs,
    path,
    name,
    bare = false,
    onRename = null,
  }: {
    fs: WorldFs;
    path: string;
    name: string;
    /** Only the picture, for a window of its own. */
    bare?: boolean;
    onRename?: ((name: string) => Promise<string | null>) | null;
  } = $props();

  let problem = $state('');

  const titled = $derived({ id: path, name, rename: onRename ?? null, problem: (text: string) => (problem = text) });
</script>

<article class="handout" class:bare>
  {#if !bare}
    <div class="label kind">Handout</div>
    <input class="name" aria-label="The name" use:retitle={titled} />
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  {/if}
  <img src={fs.imageUrl(path)} alt={name} />
</article>

<style>
  .handout {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kind {
    color: var(--structure);
  }
  .name {
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-display);
    font-size: calc(30px * var(--type));
    line-height: 1.1;
    color: var(--title);
  }
  .name:focus-visible {
    outline: 1px solid var(--edge);
    outline-offset: 4px;
  }
  img {
    display: block;
    max-width: 100%;
    max-height: calc(100vh - 230px);
    object-fit: contain;
    align-self: center;
    border-radius: 4px;
  }
  .bare {
    height: 100vh;
    justify-content: center;
    background: var(--bg);
  }
  .bare img {
    max-height: 100vh;
    border-radius: 0;
  }
  .problem {
    margin: 0;
    color: var(--danger, var(--accent));
  }
</style>
