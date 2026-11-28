<script lang="ts">
  import { onDestroy } from 'svelte';
  import { hasPage, type Element, type Kind } from '../../lib/game/elements';
  import type { Placed } from '../../lib/game/game';
  import { Saver, said } from '../../lib/game/saver.svelte';
  import CoreMark from './CoreMark.svelte';
  import { renderLines } from '../../lib/render';
  import { hover } from '../../lib/hover.svelte';

  /**
   * One aspect as a row of a sheet (Cerys, November 21): its name, each of its kind's
   * fields, and its flavor, each typed in place. The row saves itself a moment after
   * typing stops, as its form does.
   */
  let {
    placed,
    kind,
    engineName,
    onSave,
    onOpen,
  }: {
    placed: Placed;
    kind: Kind;
    engineName: string;
    onSave: (next: Element, base: Element) => Promise<void>;
    onOpen: () => void;
  } = $props();

  // Seeded once from the file; the row then holds the writer's own copy.
  let draft = $state<Element>((() => structuredClone($state.snapshot(placed.element)) as Element)());
  // Where this row started, so a save writes only what was changed in it.
  let started = (() => structuredClone($state.snapshot(placed.element)) as Element)();
  const saver = new Saver(async () => {
    const next = { ...($state.snapshot(draft) as Element), name: draft.name.trim() || started.name };
    await onSave(next, started);
    started = structuredClone(next);
  });
  onDestroy(() => void saver.flush(true));

  // The tags are typed as one line with commas between. The line is the writer's own while
  // they type, so a comma just typed is not taken away before the next tag is.
  let tagText = $state((() => placed.element.tags.join(', '))());
  function setTags(value: string) {
    tagText = value;
    draft.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
    saver.push(null);
  }

  const textOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('\n') : (v ?? ''));
  function setField(key: string, type: string, value: string) {
    draft.fields[key] = type === 'list' ? value.split('\n').filter((l) => l.trim() !== '') : value;
    saver.push(null);
  }

  /** A cell grows with what is typed into it, and the row grows with its tallest cell. */
  function grow(el: HTMLTextAreaElement) {
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
      el.scrollTop = 0;
    };
    fit();
    el.addEventListener('input', fit);
    // A column changes width when the page does, and the text then wraps differently.
    let width = el.offsetWidth;
    const watch = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      fit();
    });
    watch.observe(el);
    // The text arrives a moment after the cell does, so it is measured again once it has.
    queueMicrotask(fit);
    return {
      destroy: () => {
        el.removeEventListener('input', fit);
        watch.disconnect();
      },
    };
  }

  /**
   * Alt with an up or down arrow moves to the same column of the row above or below, and
   * Enter in a one-line cell moves down, as in a spreadsheet. Tab moves across as it
   * does anywhere.
   */
  function move(e: KeyboardEvent, oneLine = false) {
    const by = e.altKey && e.key === 'ArrowDown' ? 1 : e.altKey && e.key === 'ArrowUp' ? -1 : oneLine && e.key === 'Enter' && !e.shiftKey ? 1 : 0;
    if (!by) return;
    e.preventDefault();
    const cell = (e.currentTarget as HTMLElement).closest('td, th');
    const row = cell?.parentElement;
    if (!cell || !row) return;
    const at = [...row.children].indexOf(cell);
    let to = by > 0 ? row.nextElementSibling : row.previousElementSibling;
    while (to && !to.children[at]?.querySelector('textarea, input')) to = by > 0 ? to.nextElementSibling : to.previousElementSibling;
    to?.children[at]?.querySelector<HTMLElement>('textarea, input')?.focus();
  }
</script>

<tr class:problem={saver.status === 'problem'}>
  <th scope="row">
    <textarea rows="1" use:grow bind:value={draft.name} oninput={() => saver.push(null)} onkeydown={(e) => move(e, true)} aria-label="Name" spellcheck="false"></textarea>
    <span class="under">
      {#if placed.origin === 'engine'}<CoreMark {engineName} />{/if}
      <button type="button" class="open" title="Open {placed.element.name} as a page" aria-label="Open {placed.element.name} as a page" onclick={onOpen}>
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 2.5 H2.5 V11.5 H11.5 V8.5 M8 2.5 H11.5 V6 M11.5 2.5 L6.5 7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      {#if hasPage(kind)}
        <!-- The aspect's card, as it is dealt, shown from its row (Cerys, November 27). -->
        <button type="button" class="open card" title="Show {placed.element.name} as a card" onclick={(e) => hover.show(e.currentTarget, `game:${placed.key}`)}>Card</button>
      {/if}
      {#if saver.status !== 'saved'}<span class="status" title={saver.problem}>{said(saver.status)}</span>{/if}
    </span>
  </th>
  <td class="line tags">
    <textarea rows="1" use:grow value={tagText} oninput={(e) => setTags(e.currentTarget.value)} onkeydown={(e) => move(e, true)} aria-label="Tags of {placed.element.name}" spellcheck="false"></textarea>
  </td>
  {#each kind.fields as f (f.key)}
    <td class={f.type}>
      <div class="cell">
        <div class="shown" aria-hidden="true">{@html renderLines(textOf(draft.fields[f.key]))}</div>
        <textarea rows="1" use:grow value={textOf(draft.fields[f.key])} oninput={(e) => setField(f.key, f.type, e.currentTarget.value)} onkeydown={(e) => move(e, f.type === 'line')} aria-label="{f.label} of {placed.element.name}"></textarea>
      </div>
    </td>
  {/each}
  <!-- A kind whose aspects have a page keeps the page out of the sheet: it is long, and it is written on the aspect's own page. -->
  {#if !hasPage(kind)}
  <td class="text">
    <div class="cell">
      <div class="shown" aria-hidden="true">{@html renderLines(draft.flavor)}</div>
      <textarea rows="1" use:grow bind:value={draft.flavor} oninput={() => saver.push(null)} onkeydown={move} aria-label="{kind.body ?? 'Flavor'} of {placed.element.name}"></textarea>
    </div>
  </td>
  {/if}
</tr>

<style>
  th,
  td {
    vertical-align: top;
    padding: 0;
    border-top: 1px solid var(--line);
    border-right: 1px solid var(--line);
    font-weight: 400;
    text-align: left;
  }
  th {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--paper, var(--bg));
  }
  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-height: 28px;
    resize: none;
    overflow: hidden;
    font: inherit;
    font-size: calc(13.5px * var(--type));
    line-height: 1.45;
    color: var(--text);
    background: none;
    border: 1px solid transparent;
    border-radius: 0;
    padding: 5px 8px;
  }
  th textarea {
    font-weight: 700;
  }
  textarea:hover {
    background: color-mix(in oklab, var(--text) 4%, transparent);
  }
  textarea:focus {
    outline: none;
    border-color: var(--structure);
    background: var(--field, transparent);
  }
  .under {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 5px;
    min-height: 18px;
  }
  .open {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    color: var(--muted);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--round);
  }
  .open.card {
    width: auto;
    padding: 0 6px;
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .open:hover {
    color: var(--text);
  }
  .status {
    font-family: var(--font-label);
    font-size: calc(10.5px * var(--type));
    color: var(--muted);
  }
  tr.problem .status {
    color: var(--danger);
  }
  /* A cell shows its text as it will print, bold as bold (Cerys, November 27). The text box
     sits over that with its own words unseen, and takes over, marks and all, the moment
     the cell is clicked or tabbed into. */
  .cell {
    position: relative;
  }
  .shown {
    position: absolute;
    inset: 0;
    padding: 6px 9px;
    overflow: hidden;
    font-size: calc(13.5px * var(--type));
    line-height: 1.45;
    color: var(--text);
    overflow-wrap: break-word;
    pointer-events: none;
  }
  .cell textarea:not(:focus) {
    color: transparent;
  }
  .cell:focus-within .shown {
    visibility: hidden;
  }
  /* Every other row sits on a slightly different ground (Cerys, November 27), so the eye
     can follow one aspect across a wide sheet. */
  tr:nth-child(even) th,
  tr:nth-child(even) td {
    background: color-mix(in oklab, var(--text) 6%, var(--paper, var(--bg)));
  }
</style>
