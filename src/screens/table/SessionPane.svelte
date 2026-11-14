<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { lastWords, setFacts, type Campaign, type Session } from '../../lib/table/index';
  import { saveNow } from '../../lib/saves';
  import EntryEditor from '../world/EntryEditor.svelte';

  /**
   * One side of a session (Mike, November 14). The log is what happened, and the plan is
   * what the game master prepared. They are two files that share a name, and they open
   * side by side. The session's facts are kept in the log's header and shown on both.
   */
  let {
    fs,
    index,
    campaign,
    session,
    before,
    side,
    next,
    fresh = false,
    onOpen,
    onMakeEntry,
    onChanged,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    campaign: Campaign;
    session: Session;
    /** The session played before this one, for where things were left. */
    before: Session | null;
    side: 'log' | 'plan';
    next: string | null;
    fresh?: boolean;
    onOpen: (id: string) => void;
    onMakeEntry: (name: string) => void;
    onChanged: () => Promise<void>;
  } = $props();

  const path = $derived((side === 'log' ? session.log : session.plan)!);
  /** The file that holds the session's facts: the log, or the plan of a session not yet played. */
  const facts = $derived(session.log ?? session.plan!);

  let problem = $state('');
  async function change(change: Record<string, unknown>, both = false) {
    problem = '';
    try {
      for (const file of both ? [session.log, session.plan] : [facts]) {
        if (!file) continue;
        await saveNow(file);
        await setFacts(fs, file, change);
      }
      await onChanged();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  // Where the last session ended, read when the page opens.
  let last = $state('');
  $effect(() => {
    const log = side === 'log' ? before?.log : null;
    last = '';
    if (!log) return;
    void fs.readText(log).then(
      (text) => (last = lastWords(text)),
      () => {},
    );
  });
</script>

<article class="session">
  <div class="kind label">
    {#if side === 'plan'}Session plan · narrator only{:else}Session log{/if}
    <span class="where">{campaign.name}</span>
  </div>
  <input class="name" aria-label="The session's name" value={session.name} onchange={(e) => e.currentTarget.value.trim() && change({ name: e.currentTarget.value.trim() }, true)} />
  <div class="facts">
    <label>Played <input type="date" value={session.played} onchange={(e) => change({ played: e.currentTarget.value })} /></label>
    <label class="wide">In the game <input type="text" value={session.when} placeholder="Spring, 485" onchange={(e) => change({ when: e.currentTarget.value.trim() })} /></label>
    <label class="wide">At the table <input type="text" value={session.people.join(', ')} placeholder="Names, with commas between" onchange={(e) => change({ table: e.currentTarget.value.split(',').map((p) => p.trim()).filter(Boolean) })} /></label>
  </div>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  {#if last}
    <details class="last">
      <summary class="label">Last time · {before!.name}</summary>
      <p>{last}</p>
    </details>
  {/if}
  {#key path}
    <EntryEditor {fs} {index} id={path} title={session.name} autofocus={fresh} {onOpen} {next} rumorTool narratorTool={campaign.role === 'gm'} {onMakeEntry} />
  {/key}
</article>

<style>
  .session {
    max-width: var(--measure, 720px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .kind {
    white-space: nowrap;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--structure);
  }
  .where {
    color: var(--muted);
  }
  .name {
    font-family: var(--font-display);
    font-size: calc(40px * var(--type));
    line-height: 1.1;
    letter-spacing: 0.02em;
    color: var(--title);
    background: none;
    border: 0;
    padding: 0;
    width: 100%;
  }
  .name:focus-visible {
    outline: 1px solid var(--edge);
    outline-offset: 4px;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-bottom: 8px;
  }
  .facts label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .facts .wide {
    flex: 1 1 240px;
  }
  .facts .wide:last-child {
    flex-basis: 100%;
  }
  .facts input {
    font: inherit;
    letter-spacing: 0.04em;
    text-transform: none;
    font-size: calc(13px * var(--type));
    color: var(--text-soft);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    padding: 2px 0;
    min-width: 0;
    color-scheme: inherit;
  }
  .facts .wide input {
    flex: 1;
  }
  .facts input:hover,
  .facts input:focus {
    border-bottom-color: var(--edge);
    outline: none;
  }
  .last {
    border: 1px dashed var(--edge);
    border-radius: var(--round);
    padding: 8px 14px;
    color: var(--text-soft);
  }
  .last summary {
    cursor: pointer;
  }
  .last p {
    margin: 6px 0 2px;
    font-size: calc(var(--prose-size) * 0.92);
  }
  .problem {
    color: var(--danger, var(--accent));
    margin: 0;
  }
</style>
