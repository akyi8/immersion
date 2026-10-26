<script lang="ts">
  import { tick } from 'svelte';
  import type { Entry } from '../../lib/index/wiki';
  import type { WorldFs } from '../../lib/fs/types';
  import { parseWhen } from '../../lib/time/when';
  import { withHeader } from '../../lib/world';
  import { saveNow } from '../../lib/saves';

  /**
   * An entry's date (Mike, October 26). Any entry can be given one with "+ Date", which
   * puts it on the timeline. A date that covers a stretch of time, such as `2045 to 2060`,
   * can also make the entry an era, so everything dated inside it falls under it.
   */
  let { fs, entry, editable }: { fs: WorldFs; entry: Entry; editable: boolean } = $props();

  let adding = $state(false);
  let text = $state('');
  let problem = $state('');
  let input: HTMLInputElement | undefined = $state();
  let focused = $state(false);

  $effect(() => {
    text = entry.when?.text ?? '';
  });

  const parsed = $derived(parseWhen(text));
  /** A date longer than a single year can hold an era. */
  const isSpan = $derived(!!parsed && parsed.end - parsed.start > 1.001);

  async function write(changes: Record<string, unknown>) {
    problem = '';
    try {
      await saveNow(entry.id);
      await fs.writeText(entry.id, withHeader(await fs.readText(entry.id), changes));
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  async function commit() {
    const v = text.trim();
    if (v === (entry.when?.text ?? '')) {
      if (!v) adding = false;
      return;
    }
    if (v && !parseWhen(v)) {
      problem = 'The timeline can’t place that date. Try a year such as 2057, a day such as 14 October 1066, or a span such as 2045 to 2060.';
      return;
    }
    const span = v ? (parseWhen(v)!.end - parseWhen(v)!.start > 1.001) : false;
    await write({ when: v || undefined, era: v && span && entry.era ? true : undefined });
    adding = false;
  }

  async function start() {
    adding = true;
    await tick();
    input?.focus();
  }
</script>

{#if entry.when || adding}
  <div class="date">
    <label class="label" for="when-{entry.id}">When</label>
    {#if editable}
      <input
        id="when-{entry.id}"
        bind:this={input}
        type="text"
        bind:value={text}
        size={Math.max(22, text.length + 2)}
        autocomplete="off"
        placeholder="2057, or 1985 to 2000"
        aria-describedby="when-help-{entry.id}"
        onfocus={() => (focused = true)}
        onkeydown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            text = entry.when?.text ?? '';
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        onblur={() => ((focused = false), commit())} />
      {#if isSpan && entry.when}
        <label class="era">
          <input type="checkbox" checked={entry.era} onchange={(e) => write({ era: (e.currentTarget as HTMLInputElement).checked ? true : undefined })} />
          This is an era
        </label>
      {/if}
    {:else}
      <span id="when-{entry.id}" class="value">{entry.when?.text}{entry.era ? ' · an era' : ''}</span>
    {/if}
  </div>
  {#if editable && (focused || problem)}
    <p class="help" id="when-help-{entry.id}">
      A year, <code>2057</code>. A day, <code>Aug 8 2020</code>, <code>8 August 2020</code>, <code>2020-08-08</code>, or <code>8/8/2020</code>, month first.
      A span for an era, <code>1985 to 2000</code> or <code>1985-2000</code>. Also a season, <code>spring 2052</code>, a decade, <code>1920s</code>,
      <code>5th century BCE</code>, and <code>c. 1200 BCE</code>.
    </p>
  {/if}
  {#if problem}<div class="problem" role="alert">{problem}</div>{/if}
{:else if editable}
  <button type="button" class="add" onclick={start}>+ Date</button>
{/if}

<style>
  .date {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin-top: 10px;
  }
  .label {
    font-size: 11px;
  }
  input[type='text'] {
    font-family: var(--font-label);
    font-size: 13px;
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--rule-strong);
    padding: 3px 2px;
    min-width: 0;
  }
  input[type='text']:focus {
    outline: none;
    border-bottom-color: var(--structure);
  }
  .value {
    font-family: var(--font-label);
    font-size: 13px;
    color: var(--text-soft);
  }
  .era {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-soft);
  }
  .add {
    margin-top: 8px;
    font-size: 12px;
    color: var(--structure);
    background: none;
    border: 0;
    padding: 2px 0;
  }
  .add:hover {
    color: var(--text);
  }
  .help {
    margin: 6px 0 0;
    max-width: 520px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--muted);
  }
  .help code {
    font-family: var(--font-label);
    color: var(--text-soft);
  }
  .problem {
    margin-top: 6px;
    font-size: 13px;
    color: var(--danger);
  }
</style>
