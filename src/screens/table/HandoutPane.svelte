<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';

  /**
   * A handout that is a picture (Mike, November 14): a map, a letter, a portrait. It shows
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
  async function rename(e: Event & { currentTarget: HTMLInputElement }) {
    const next = e.currentTarget.value.trim();
    if (!next || next === name) return void (e.currentTarget.value = name);
    problem = (await onRename?.(next)) ?? '';
    if (problem) e.currentTarget.value = name;
  }
</script>

<article class="handout" class:bare>
  {#if !bare}
    <div class="label kind">Handout</div>
    <input class="name" aria-label="The name" readonly={!onRename} value={name} onchange={rename} onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
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
