<script lang="ts">
  import type { Element, Kind } from '../../lib/game/elements';
  import { effective, type Placed } from '../../lib/game/game';

  /**
   * One element, edited as a form (Mike, November 7: structured data). Each field of the
   * element's kind gets its own box: a line, a paragraph, or a list with one item a line.
   * Changes save on their own a moment after typing stops.
   *
   * A core element shown in a world can be set aside in that world, or reskinned for it.
   * A reskin changes only the name and the flavor, so its mechanics show here read-only,
   * as the core element has them.
   */
  let {
    placed,
    kind,
    engineName,
    worldName,
    vendors,
    onSave,
    onSetAside,
    onReskin,
    onOpen,
  }: {
    placed: Placed;
    kind: Kind | null;
    engineName: string;
    worldName: string;
    /** The world's vendors, by id and name, for the vendor choice. */
    vendors: { id: string; name: string }[];
    onSave: (next: Element) => Promise<void>;
    onSetAside: (on: boolean) => void;
    onReskin: () => void;
    onOpen: (key: string) => void;
  } = $props();

  const SAVE_DELAY_MS = 600;

  // The form holds its own copy while the writer types, seeded from the file.
  let draft = $state<Element>((() => structuredClone($state.snapshot(placed.element)) as Element)());
  let status = $state<'saved' | 'waiting' | 'saving' | 'problem'>('saved');
  let problem = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;

  const reskin = $derived(!!placed.base);
  const shown = $derived(effective({ ...placed, element: draft }));
  const where = $derived(placed.origin === 'engine' ? engineName : worldName);

  function changed() {
    status = 'waiting';
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  }

  async function save() {
    timer = null;
    status = 'saving';
    try {
      await onSave($state.snapshot(draft) as Element);
      status = 'saved';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      status = 'problem';
    }
  }

  const fieldText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('\n') : (v ?? ''));

  function setField(key: string, type: string, value: string) {
    draft.fields[key] = type === 'list' ? value.split('\n').filter((l) => l.trim() !== '') : value;
    changed();
  }

  /** A text box that grows with what is typed into it. */
  function grow(el: HTMLTextAreaElement) {
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    el.addEventListener('input', fit);
    return { destroy: () => el.removeEventListener('input', fit) };
  }
</script>

<article class="element">
  <header>
    <div class="label">
      {where} · {kind?.name ?? draft.kind}
      {#if placed.setAside}<span class="flag">Set aside in {worldName}</span>{/if}
      {#if placed.reskinnedBy}<span class="flag">Reskinned in {worldName}</span>{/if}
    </div>
    <h1>{draft.name || 'Untitled'}</h1>
    <div class="row">
      <span class="meta">{draft.tags.join(', ')}</span>
      <span class="spacer"></span>
      <span class="status {status}" aria-live="polite">{status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : status === 'waiting' ? 'Editing' : 'Not saved'}</span>
      {#if placed.origin === 'engine'}
        {#if placed.reskinnedBy}
          <button type="button" class="tool" onclick={() => onOpen(placed.reskinnedBy!.key)}>Open the reskin</button>
        {:else}
          <button type="button" class="tool" onclick={onReskin} title="Give this element a new name and flavor in {worldName}, keeping its mechanics">Reskin for {worldName}</button>
          <button type="button" class="tool" onclick={() => onSetAside(!placed.setAside)} title="Whether {worldName}'s game uses this core element">
            {placed.setAside ? `Use in ${worldName}` : `Set aside in ${worldName}`}
          </button>
        {/if}
      {:else if placed.base}
        <button type="button" class="tool" onclick={() => onOpen(placed.base!.key)}>Open the core element</button>
      {/if}
    </div>
    {#if status === 'problem'}<p class="problem" role="alert">{problem}</p>{/if}
  </header>

  {#if placed.origin === 'engine'}
    <p class="note">A core element is in every game built on {engineName}. Changes here reach all of them.</p>
  {/if}
  {#if reskin}
    <p class="note">A reskin of {placed.base?.element.name}. It changes only the name and the flavor; the mechanics below are the core element's.</p>
  {/if}

  <div class="form">
    <label class="field">
      <span class="label">Name</span>
      <input type="text" bind:value={draft.name} oninput={changed} autocomplete="off" />
    </label>
    {#if !reskin}
      <label class="field">
        <span class="label">Tags</span>
        <input
          type="text"
          value={draft.tags.join(', ')}
          oninput={(e) => {
            draft.tags = (e.currentTarget as HTMLInputElement).value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            changed();
          }}
          autocomplete="off" />
        <span class="hint">Where it belongs and what it is, separated by commas, such as core, gear, weapon.</span>
      </label>
    {/if}
    {#if placed.origin === 'world' && !reskin && draft.kind !== 'vendor' && vendors.length}
      <label class="field">
        <span class="label">Sold by</span>
        <select
          value={draft.vendor}
          onchange={(e) => {
            draft.vendor = (e.currentTarget as HTMLSelectElement).value;
            changed();
          }}>
          <option value="">No vendor</option>
          {#each vendors as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#each kind?.layout ?? ['flavor'] as part (part)}
      {#if part === 'flavor'}
        <label class="field">
          <span class="label">{kind?.body ?? 'Flavor'}</span>
          <textarea use:grow rows="3" bind:value={draft.flavor} oninput={changed}></textarea>
        </label>
      {:else}
        {@const f = kind?.fields.find((x) => x.key === part)}
        {#if f}
          <label class="field" class:locked={reskin}>
            <span class="label">{f.label}</span>
            {#if reskin}
              <div class="readonly">{fieldText(shown.fields[f.key]) || '—'}</div>
            {:else if f.type === 'line'}
              <input type="text" value={fieldText(draft.fields[f.key])} oninput={(e) => setField(f.key, f.type, (e.currentTarget as HTMLInputElement).value)} autocomplete="off" />
            {:else}
              <textarea
                use:grow
                rows={f.type === 'list' ? 3 : 2}
                value={fieldText(draft.fields[f.key])}
                oninput={(e) => setField(f.key, f.type, (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
            {/if}
            {#if f.type === 'list' && !reskin}<span class="hint">One item a line.</span>{:else if f.hint}<span class="hint">{f.hint}</span>{/if}
          </label>
        {/if}
      {/if}
    {/each}
  </div>
</article>

<style>
  article {
    max-width: 720px;
  }
  header {
    margin-bottom: 18px;
  }
  h1 {
    color: var(--title);
    margin: 4px 0 8px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: calc(48px * var(--type));
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .flag {
    margin-left: 10px;
    color: var(--muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .spacer {
    flex: 1;
  }
  .meta,
  .status {
    font-family: var(--font-label);
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
  .status.problem {
    color: var(--danger);
  }
  .tool {
    font-size: calc(13px * var(--type));
    color: var(--structure);
    background: var(--well);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 6px 10px;
    min-height: 32px;
  }
  .tool:hover {
    color: var(--text);
    border-color: var(--hover-edge);
  }
  .note {
    margin: 0 0 16px;
    font-size: calc(14px * var(--type));
    color: var(--text-soft);
  }
  .problem {
    color: var(--danger);
    font-size: calc(14px * var(--type));
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field .label {
    font-size: calc(11px * var(--type));
  }
  input,
  select,
  textarea {
    font: inherit;
    font-size: calc(15px * var(--type));
    line-height: 1.5;
    color: var(--text);
    background: var(--field);
    border: 1px solid var(--edge);
    border-radius: var(--round);
    padding: 8px 10px;
  }
  textarea {
    resize: vertical;
    min-height: 2.6em;
    overflow: hidden;
  }
  .readonly {
    font-size: calc(15px * var(--type));
    line-height: 1.5;
    color: var(--text-soft);
    white-space: pre-wrap;
    padding: 8px 10px;
    border: 1px dashed var(--edge);
    border-radius: var(--round);
  }
  .hint {
    font-size: calc(12px * var(--type));
    color: var(--muted);
  }
</style>
