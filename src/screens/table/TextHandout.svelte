<script lang="ts">
  import { errorText } from '../../lib/errors';
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { renderBody } from '../../lib/render';
  import { splitHeader } from '../../lib/world';
  import { setFacts } from '../../lib/table/index';
  import { saveNow } from '../../lib/saves';
  import { retitle } from '../../lib/retitle';
  import EntryEditor from '../world/EntryEditor.svelte';

  /**
   * A handout made of words (Cerys, November 14), such as a message from the game master
   * pasted in from a chat. It is written like any other page, and names in it link. In a
   * window of its own it is shown for reading, with narrator-only text left out, so it
   * can be shared on a call.
   */
  let {
    fs,
    index,
    path,
    name,
    next = null,
    fresh = false,
    reading = false,
    onOpen,
    onMakeEntry,
    onChanged,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    path: string;
    name: string;
    next?: string | null;
    fresh?: boolean;
    /** Shows the handout for reading, as a window of its own does. */
    reading?: boolean;
    onOpen: (id: string) => void;
    onMakeEntry?: (name: string) => void;
    onChanged?: () => Promise<void>;
  } = $props();

  let problem = $state('');
  async function rename(to: string): Promise<string | null> {
    try {
      await saveNow(path);
      await setFacts(fs, path, { name: to });
      await onChanged?.();
      return null;
    } catch (err) {
      return errorText(err);
    }
  }

  // For reading: the file as it is on disk, read again whenever it changes.
  let html = $state('');
  $effect(() => {
    if (!reading) return;
    const show = () =>
      void fs.readText(path).then(
        (text) => (html = renderBody(splitHeader(text.replace(/\r\n?/g, '\n')).body, index, null, 'protagonist')),
        (e) => (problem = errorText(e)),
      );
    show();
    return fs.onChange((paths) => paths.includes(path) && show());
  });

  function follow(e: MouseEvent) {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-entry]')?.dataset.entry;
    if (id) onOpen(id);
  }

</script>

<article class="text-handout" class:reading>
  <div class="label kind">Handout</div>
  {#if reading}
    <h1>{name}</h1>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="prose" onclick={follow}>{@html html}</div>
  {:else}
    <input class="name" aria-label="The handout's name" use:retitle={{ id: path, name, rename, problem: (text) => (problem = text) }} />
    {#key path}
      <EntryEditor {fs} {index} id={path} title="" autofocus={fresh} {onOpen} {next} rumorTool narratorTool {onMakeEntry} />
    {/key}
  {/if}
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
</article>

<style>
  .text-handout {
    max-width: var(--measure, 720px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .reading {
    padding: 34px 28px 60px;
  }
  .kind {
    color: var(--structure);
  }
  .name,
  h1 {
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(var(--title-size) * var(--type));
    line-height: 1.1;
    color: var(--title);
  }
  .name:focus-visible {
    outline: 1px solid var(--edge);
    outline-offset: 4px;
  }
  .problem {
    margin: 0;
    color: var(--danger, var(--accent));
  }
</style>
