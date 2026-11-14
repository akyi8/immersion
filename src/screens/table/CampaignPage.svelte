<script lang="ts">
  import type { WorldFs } from '../../lib/fs/types';
  import { setFacts, type Campaign, type Link } from '../../lib/table/index';

  /**
   * A campaign's own page (Mike, November 14): its name, whether the writer runs it or
   * plays in it, which game it uses, and links the table shares, such as the spreadsheet
   * that holds everyone's characters.
   */
  let {
    fs,
    campaign,
    onChanged,
  }: {
    fs: WorldFs;
    campaign: Campaign;
    onChanged: () => Promise<void>;
  } = $props();

  let problem = $state('');
  async function change(facts: Record<string, unknown>) {
    problem = '';
    try {
      await setFacts(fs, campaign.card, facts);
      await onChanged();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  const saveLinks = (links: Link[]) => change({ links: links.length ? links.map((l) => ({ name: l.name, url: l.url })) : undefined });
  let linkName = $state('');
  let linkUrl = $state('');
  async function addLink(e: SubmitEvent) {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;
    await saveLinks([...campaign.links, { name: linkName.trim() || url, url }]);
    linkName = '';
    linkUrl = '';
  }

  let copied = $state('');
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copied = url;
      setTimeout(() => (copied = ''), 1600);
    } catch {
      // Where copying is refused, the address below can be selected by hand.
    }
  }

  const sessions = $derived(campaign.adventures.reduce((n, a) => n + a.sessions.length, 0));
</script>

<article class="campaign">
  <div class="label kind">Campaign</div>
  <input class="name" aria-label="The campaign's name" value={campaign.name} onchange={(e) => e.currentTarget.value.trim() && change({ name: e.currentTarget.value.trim() })} />
  <p class="count">{campaign.adventures.length} {campaign.adventures.length === 1 ? 'adventure' : 'adventures'} · {sessions} {sessions === 1 ? 'session' : 'sessions'}</p>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}

  <div class="fields">
    <label for="cp-role" class="label">I am</label>
    <select id="cp-role" value={campaign.role} onchange={(e) => change({ role: e.currentTarget.value })}>
      <option value="player">A player in it</option>
      <option value="gm">Running it</option>
    </select>
    <p class="hint">{campaign.role === 'gm' ? 'Each session has a plan beside its log. Plans show only in narrator view.' : 'Each session is its log. A player has no plans to keep.'}</p>

    <label for="cp-game" class="label">The game</label>
    <select id="cp-game" value={campaign.game} onchange={(e) => change({ game: e.currentTarget.value })}>
      <option value="other">Another game</option>
      <option value="own">This world's own game</option>
    </select>
    {#if campaign.game === 'other'}
      <input type="text" aria-label="The game's name" placeholder="The game's name, such as Pendragon" value={campaign.system} onchange={(e) => change({ system: e.currentTarget.value.trim() || undefined })} />
    {/if}
  </div>

  <h2 class="label">Links</h2>
  <p class="hint">Pages the table shares, such as the spreadsheet that holds everyone's characters.</p>
  <ul>
    {#each campaign.links as link, i (link.url + i)}
      <li>
        <span class="link-name">{link.name}</span>
        <span class="url">{link.url}</span>
        <button type="button" onclick={() => copy(link.url)}>{copied === link.url ? 'Copied' : 'Copy'}</button>
        <button type="button" aria-label="Remove {link.name}" onclick={() => saveLinks(campaign.links.filter((_, n) => n !== i))}>Remove</button>
      </li>
    {/each}
  </ul>
  <form class="add" onsubmit={addLink}>
    <input type="text" aria-label="What the link is" placeholder="Our knights" bind:value={linkName} />
    <input type="text" aria-label="The link's address" placeholder="https://…" bind:value={linkUrl} />
    <button type="submit" disabled={!linkUrl.trim()}>Add</button>
  </form>
</article>

<style>
  .campaign {
    max-width: var(--measure, 720px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kind {
    color: var(--structure);
  }
  .name {
    font-family: var(--font-display);
    font-size: calc(44px * var(--type));
    line-height: 1.1;
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
  .count,
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: calc(14px * var(--type));
    line-height: 1.5;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 420px;
    margin-top: 12px;
  }
  .fields .label,
  h2 {
    margin: 14px 0 0;
  }
  select,
  input[type='text'] {
    font: inherit;
    font-size: calc(15px * var(--type));
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 10px;
    min-width: 0;
  }
  ul {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .link-name {
    color: var(--text);
  }
  .url {
    flex: 1 1 200px;
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
    user-select: text;
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .add input:nth-child(2) {
    flex: 1 1 220px;
  }
  button {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--text-soft);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 5px 12px;
  }
  button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .problem {
    color: var(--danger, var(--accent));
    margin: 0;
  }
</style>
