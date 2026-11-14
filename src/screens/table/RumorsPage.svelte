<script lang="ts">
  import type { WikiIndex } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import type { Campaign } from '../../lib/table/index';
  import { rumorsIn, setStanding, type Rumor, type Standing } from '../../lib/table/rumors';
  import { saveNow } from '../../lib/saves';
  import type { View } from '../../lib/render';

  /**
   * Every rumor in a campaign's sessions and in the wiki, in one list (Mike, November 14).
   * Nobody keeps this page by hand. A rumor is settled here or where it is written.
   */
  let {
    fs,
    index,
    campaign,
    view,
    onOpen,
  }: {
    fs: WorldFs;
    index: WikiIndex;
    campaign: Campaign;
    view: View;
    onOpen: (id: string) => void;
  } = $props();

  interface Row extends Rumor {
    path: string;
    source: string;
  }

  let rows = $state<Row[]>([]);
  let loaded = $state(false);
  let problem = $state('');

  async function gather() {
    const out: Row[] = [];
    const read = async (path: string, source: string) => {
      try {
        for (const r of rumorsIn(await fs.readText(path))) out.push({ ...r, path, source });
      } catch {
        // A file that went away between the listing and the reading has no rumors.
      }
    };
    for (const a of campaign.adventures) {
      for (const s of a.sessions) {
        if (s.log) await read(s.log, s.name);
        // A plan's rumors are the narrator's, so they show only in narrator view.
        if (s.plan && view === 'narrator' && campaign.role === 'gm') await read(s.plan, `${s.name} · plan`);
      }
    }
    for (const e of index.entries.values()) if (/\[!rumor\]/i.test(e.body)) await read(e.id, `Wiki · ${e.name}`);
    rows = out;
    loaded = true;
  }

  $effect(() => {
    void campaign;
    void index;
    void view;
    void gather();
  });
  $effect(() => fs.onChange(() => void gather()));

  async function settle(row: Row, standing: Standing) {
    problem = '';
    try {
      await saveNow(row.path);
      const next = setStanding((await fs.readText(row.path)).replace(/\r\n?/g, '\n'), row.line, standing);
      if (next === null) throw new Error('That rumor has moved. Try again in a moment.');
      await fs.writeText(row.path, next);
      await gather();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  const open = $derived(rows.filter((r) => r.standing === 'open'));
  const settled = $derived(rows.filter((r) => r.standing !== 'open'));
</script>

<article class="rumors">
  <div class="label kind">Kept by the campaign <span class="where">{campaign.name}</span></div>
  <h1>Rumors</h1>
  <p class="hint">Every paragraph marked as a rumor, from this campaign's sessions and from the wiki. Select text in a session or a wiki entry and choose Rumor to add one.</p>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  {#snippet list(items: Row[])}
    <ul>
      {#each items as row (row.path + ':' + row.line)}
        <li class:settled={row.standing !== 'open'}>
          <p>{row.text}</p>
          <div class="meta">
            <button type="button" class="source" onclick={() => onOpen(row.path)}>{row.source}</button>
            {#if row.standing === 'open'}
              <button type="button" onclick={() => settle(row, 'confirmed')}>Confirmed</button>
              <button type="button" onclick={() => settle(row, 'false')}>False</button>
            {:else}
              <span class="pill" class:true={row.standing === 'confirmed'}>{row.standing}</span>
              <button type="button" onclick={() => settle(row, 'open')}>Open it again</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/snippet}
  {#if open.length}
    <h2 class="label">Open · {open.length}</h2>
    {@render list(open)}
  {:else if loaded}
    <p class="none">No open rumors.</p>
  {/if}
  {#if settled.length}
    <h2 class="label">Settled · {settled.length}</h2>
    {@render list(settled)}
  {/if}
</article>

<style>
  .rumors {
    max-width: var(--measure, 720px);
    margin: 0 auto;
  }
  .kind {
    display: flex;
    justify-content: space-between;
    color: var(--structure);
  }
  .where {
    color: var(--muted);
  }
  h1 {
    margin: 6px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(40px * var(--type));
    color: var(--title);
  }
  .hint,
  .none {
    color: var(--muted);
    font-size: calc(14px * var(--type));
    line-height: 1.5;
    max-width: 60ch;
  }
  h2 {
    margin: 26px 0 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  li p {
    margin: 0 0 6px;
    font-family: var(--font-body);
    font-size: var(--prose-size);
    line-height: var(--prose-leading);
  }
  li.settled p {
    color: var(--text-soft);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .meta button,
  .pill {
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-soft);
    background: none;
    border: 1px solid var(--edge);
    border-radius: 999px;
    padding: 3px 10px;
  }
  .meta button:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .meta .source {
    border: 0;
    padding-left: 0;
    color: var(--muted);
    margin-right: auto;
    text-transform: none;
    letter-spacing: 0.02em;
    font-size: calc(12px * var(--type));
  }
  .pill {
    color: var(--muted);
  }
  .pill.true {
    color: var(--structure);
    border-color: var(--structure);
  }
  .problem {
    color: var(--danger, var(--accent));
  }
</style>
