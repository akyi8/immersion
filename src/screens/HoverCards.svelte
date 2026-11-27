<script lang="ts">
  import { Popover } from 'bits-ui';
  import type { WikiIndex } from '../lib/index/wiki';
  import { folderLabel } from '../lib/index/wiki';
  import type { WorldFs } from '../lib/fs/types';
  import { frameStyle } from '../lib/index/frame';
  import { hover, firstSentence, type CardFacts } from '../lib/hover.svelte';
  import { icons } from '../lib/icons.svelte';
  import { quiet } from '../lib/view.svelte';
  import Icon from './Icon.svelte';

  /**
   * Hover cards (Cerys, November 24). One card for the whole window. It watches for the
   * pointer coming to rest on a linked name, in the editor or on a read page, and shows
   * that name's card beside it. Where the card goes, and keeping it inside the window, is
   * Bits UI's Popover, anchored to the name. The look is this file's own.
   */
  let { index, fs }: { index: WikiIndex | null; fs: WorldFs } = $props();

  // The pointer must rest this long before a card shows, so crossing a paragraph sets
  // nothing off. The card then stays a moment after the pointer leaves, long enough to
  // move onto the card itself.
  const WAIT = 500;
  const LINGER = 180;
  let opening: ReturnType<typeof setTimeout> | null = null;
  let closing: ReturnType<typeof setTimeout> | null = null;
  const stop = (t: ReturnType<typeof setTimeout> | null) => {
    if (t) clearTimeout(t);
    return null;
  };

  const facts = $derived.by((): CardFacts | null => {
    const id = hover.id;
    if (!id || !hover.anchor?.isConnected) return null;
    if (id.startsWith('game:')) return hover.game?.(id.slice(5)) ?? null;
    const e = index?.get(id);
    if (!e || !index) return null;
    const folder = id.slice(0, id.lastIndexOf('/'));
    const under = folder.startsWith(index.root.path + '/') ? folder.slice(index.root.path.length + 1) : '';
    return {
      id,
      kind: folderLabel(e.category),
      icon: icons.forEntry(under, e.icon),
      main: e.name,
      lead: '',
      brief: firstSentence(e.summary),
      also: e.aliases.slice(0, 3),
      facts: [],
      picture: e.imagePath ? { url: fs.imageUrl(e.imagePath), style: frameStyle(e.portraitFrame) } : null,
      game: false,
    };
  });

  $effect(() => {
    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('.hover-card')) {
        closing = stop(closing);
        return;
      }
      const el = target?.closest<HTMLElement>('[data-entry]');
      const id = el?.dataset.entry;
      if (!el || !id) return;
      closing = stop(closing);
      if (hover.anchor === el) return;
      opening = stop(opening);
      opening = setTimeout(() => {
        // No card while the writer is typing: the names have stepped back with the rest.
        if (!quiet.typing && el.isConnected) hover.show(el, id);
      }, WAIT);
    };
    const out = (e: PointerEvent) => {
      const from = e.target as HTMLElement | null;
      if (!from?.closest('[data-entry], .hover-card')) return;
      const to = e.relatedTarget as HTMLElement | null;
      if (to?.closest('.hover-card') || (hover.anchor && to && hover.anchor.contains(to))) return;
      opening = stop(opening);
      closing = stop(closing);
      closing = setTimeout(() => hover.hide(), LINGER);
    };
    const away = () => {
      opening = stop(opening);
      closing = stop(closing);
      if (hover.id) hover.hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    // A key, a click, or a scroll means the writer has moved on.
    document.addEventListener('keydown', away, true);
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('wheel', away, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('keydown', away, true);
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('wheel', away, true);
      away();
    };
  });
</script>

<Popover.Root open={!!facts} onOpenChange={(open) => !open && hover.hide()}>
  <Popover.Portal>
    {#if facts}
      <Popover.Content
        class="hover-card{facts.picture ? ' has-art' : ''}{facts.game ? ' game' : ''}"
        customAnchor={hover.anchor}
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        trapFocus={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        role="tooltip">
        {#if facts.picture}
          <div class="art" aria-hidden="true"><img src={facts.picture.url} alt="" style={facts.picture.style} /></div>
        {/if}
        <div class="spine">
          <!-- The whole name at one size (Cerys, November 27). On a card this small, one large word and one small one read as a mistake. A longer name is set smaller, and wraps to a second line up the spine. -->
          <div class="name" style:font-size="{facts.main.length <= 12 ? 26 : facts.main.length <= 22 ? 22 : 18}px">{facts.main}</div>
          <div class="kind"><Icon name={facts.icon} size={12} />{facts.kind}</div>
        </div>
        <div class="body">
          {#if facts.brief}<p class="brief">{facts.brief}</p>{/if}
          {#if facts.also.length}<p class="also"><span class="k">Also</span> {facts.also.join(', ')}</p>{/if}
          {#if facts.facts.length}
            <dl>{#each facts.facts as [k, v] (k)}<div><dt class="k">{k}</dt><dd>{v}</dd></div>{/each}</dl>
          {/if}
        </div>
      </Popover.Content>
    {/if}
  </Popover.Portal>
</Popover.Root>

<style>
  /* The card is drawn by Bits UI at the end of the page, outside this file's own elements,
     so its styles are named in full. */
  :global(.hover-card) {
    position: relative;
    z-index: 40;
    width: 340px;
    max-width: calc(100vw - 32px);
    min-height: 132px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    padding: 14px 16px 14px 12px;
    overflow: hidden;
    color: var(--text);
    font-family: var(--font-ui);
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--round);
    box-shadow: 0 14px 34px var(--shadow);
    outline: none;
    animation: hover-card-in 0.14s ease-out;
  }
  :global(.hover-card.game) {
    border-color: var(--structure);
  }
  @keyframes hover-card-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.hover-card) {
      animation: none;
    }
  }
  :global(.hover-card .art) {
    position: absolute;
    inset: 0 0 0 38%;
    pointer-events: none;
  }
  :global(.hover-card .art img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.55;
  }
  /* The picture fades toward the words, so the summary stays easy to read over it. */
  :global(.hover-card.has-art::after) {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, var(--surface) 38%, color-mix(in oklab, var(--surface) 60%, transparent) 66%, color-mix(in oklab, var(--surface) 25%, transparent) 100%);
    pointer-events: none;
  }
  :global(.hover-card .spine),
  :global(.hover-card .body) {
    position: relative;
    z-index: 1;
  }
  :global(.hover-card .spine) {
    display: flex;
    align-items: flex-end;
    gap: 5px;
  }
  :global(.hover-card .name),
  :global(.hover-card .kind) {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
  }
  :global(.hover-card .name) {
    max-height: 176px;
    overflow: hidden;
    white-space: normal;
    font-family: var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 1;
    text-shadow: 0 2px 12px var(--shadow);
  }
  :global(.hover-card .kind) {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
  }
  :global(.hover-card .name) {
    max-height: 176px;
    overflow: hidden;
    white-space: normal;
    font-family: var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 1;
    text-shadow: 0 2px 12px var(--shadow);
  }
  :global(.hover-card .name .main) {
    display: block;
    font-size: 30px;
    letter-spacing: 0.01em;
  }
  :global(.hover-card .name .lead) {
    display: block;
    font-size: 13px;
    letter-spacing: 0.08em;
    line-height: 1.2;
    opacity: 0.85;
  }
  :global(.hover-card .kind) {
    display: flex;
    align-items: center;
    font-family: var(--font-label);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--structure);
  }
  :global(.hover-card .kind .icon) {
    transform: rotate(180deg);
    margin: 0 0 0.5em;
  }
  :global(.hover-card .body) {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  :global(.hover-card p) {
    margin: 0;
  }
  :global(.hover-card .brief) {
    font-size: 14px;
    line-height: 1.5;
  }
  :global(.hover-card .also),
  :global(.hover-card dd) {
    margin: 0;
    font-size: 12.5px;
    color: var(--text-soft);
  }
  :global(.hover-card .k) {
    margin-right: 4px;
    font-family: var(--font-label);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  :global(.hover-card dl) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0;
  }
  :global(.hover-card dl div) {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
</style>
