<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Navigator, Module } from '../lib/nav.svelte';
  import type { View } from '../lib/render';
  import { ui } from '../lib/ui.svelte';
  import { account } from '../lib/account.svelte';
  import { MODULES } from '../lib/you';
  import { mode } from '../lib/mode.svelte';
  import { zoom } from '../lib/zoom.svelte';
  import { quiet, views } from '../lib/view.svelte';
  import { tumbling } from '../lib/table/tray.svelte';
  import { pageActions, pictureActions } from '../lib/pane.svelte';
  import { room } from '../lib/room.svelte';
  import { sync } from '../lib/sync.svelte';
  import { portal } from '../lib/portal';

  /**
   * The wheel (Mike, November 17): every setting and option in one radial menu, in rings.
   * The first ring holds the groups: this page, this module, this world, you, and this
   * computer. A number key or a click chooses a part of the ring, which either does
   * something or opens the next ring. Escape steps back a ring, and closes the wheel from
   * the first. Ctrl or Cmd with P opens it in the middle of the window, and a click of the
   * mouse's wheel opens it under the pointer.
   *
   * A part of a ring never moves. What cannot be done here shows greyed in its place, so
   * the hand learns where each thing is. Mike is trying the wheel beside the ⋯ and Aa
   * menus, and will keep one or the other.
   */
  let {
    nav,
    view,
    setView,
    at,
    onClose,
    onFind,
    onTheme,
    onDetails,
    onShowLoading,
    onShowShelf,
  }: {
    nav: Navigator;
    view: View;
    setView: (v: View) => void;
    /** Where the wheel opens: under the pointer, or null for the middle of the window. */
    at: { x: number; y: number } | null;
    onClose: () => void;
    onFind: () => void;
    onTheme: () => void;
    onDetails: () => void;
    onShowLoading: () => void;
    onShowShelf: () => void;
  } = $props();

  interface Part {
    label: string;
    /** For something switched on or off, or one choice among a few. */
    on?: boolean;
    disabled?: boolean;
    /** The next ring. */
    ring?: () => Part[];
    run?: () => void;
    /** The wheel stays open afterward, for switches and choices. */
    stay?: boolean;
  }

  const done = (run: () => void) => () => {
    onClose();
    run();
  };

  // The page in use: the one last clicked or typed in, or else the last one open.
  const page = $derived(room.focus && nav.panes.includes(room.focus) ? room.focus : (nav.panes.at(-1) ?? null));
  const named = (id: string, label: string) => pageActions.of(id).find((a) => a !== 'separator' && a.label === label);
  const action = (label: string, show = label): Part => {
    const found = page ? named(page, label) : undefined;
    return found && found !== 'separator' ? { label: show, run: done(found.run), disabled: found.disabled } : { label: show, disabled: true };
  };

  function thisPage(): Part[] {
    const id = page;
    const look = id ? views.of(id) : null;
    const pictures = id ? pictureActions.of(id) : [];
    const others = id ? pageActions.of(id).filter((a) => a !== 'separator' && !['Rename', 'Archive'].includes(a.label)) : [];
    return [
      action('Rename'),
      {
        label: 'Text size',
        disabled: !id,
        ring: () => [
          { label: 'Smaller', on: look?.text === 'small', stay: true, run: () => id && views.set(id, { text: 'small' }) },
          { label: 'Usual', on: look?.text === 'normal', stay: true, run: () => id && views.set(id, { text: 'normal' }) },
        ],
      },
      {
        label: 'Picture',
        disabled: !pictures.length,
        ring: () => pictures.map((p) => ({ label: p.label, on: p.pressed, stay: p.pressed !== undefined, run: p.pressed !== undefined ? p.run : done(p.run) })),
      },
      { label: ui.full === id ? 'Leave full screen' : 'Full screen', disabled: !id, run: done(() => (ui.full = ui.full === id ? null : id)) },
      {
        label: 'More',
        disabled: !others.length,
        ring: () => others.flatMap((a) => (a === 'separator' ? [] : [{ label: a.label, disabled: a.disabled, run: done(a.run) }])),
      },
      action('Archive'),
      { label: 'Close the page', disabled: !id, run: done(() => id && nav.close(id)) },
    ];
  }

  function thisModule(): Part[] {
    const shown = MODULES.filter(([m]) => account.look.modules.includes(m));
    return [
      { label: 'Narrator view', on: view === 'narrator', stay: true, run: () => setView('narrator') },
      { label: 'Protagonist view', on: view === 'protagonist', stay: true, run: () => setView('protagonist') },
      { label: 'Find', run: done(onFind) },
      { label: 'Go to', ring: () => shown.map(([m, label]) => ({ label, on: nav.current.module === m, run: done(() => nav.show(m as Module)) })) },
      { label: "The module's home", disabled: !nav.panes.length, run: done(() => nav.setRow([])) },
    ];
  }

  function thisWorld(): Part[] {
    return [
      { label: 'Theme', run: done(onTheme) },
      { label: 'Edit details', run: done(onDetails) },
      { label: 'Loading screen', run: done(onShowLoading) },
      { label: 'Pictures and more', run: done(() => (ui.settings = 'world')) },
      { label: 'All worlds', run: done(onShowShelf) },
    ];
  }

  function you(): Part[] {
    const look = account.look;
    const save = (change: Partial<typeof look>) => void account.saveLook({ ...look, ...change });
    return [
      {
        label: 'Layout',
        ring: () =>
          (['classic', 'soft', 'radiance'] as const).map((layout) => ({ label: layout[0].toUpperCase() + layout.slice(1), on: account.look.layout === layout, stay: true, run: () => save({ layout }) })),
      },
      { label: "The world's picture behind the desk", on: look.backdrop, disabled: look.layout === 'classic', stay: true, run: () => save({ backdrop: !look.backdrop }) },
      { label: 'Enter a world without waiting', on: look.autoEnter, stay: true, run: () => save({ autoEnter: !look.autoEnter }) },
      {
        label: 'Modules',
        ring: () =>
          MODULES.map(([m, label]) => ({
            label,
            on: account.look.modules.includes(m),
            stay: true,
            run: () => {
              const now = account.look.modules;
              const next = now.includes(m) ? now.filter((x) => x !== m) : MODULES.map(([x]) => x).filter((x) => x === m || now.includes(x));
              if (next.length) void account.saveLook({ ...account.look, modules: next });
            },
          })),
      },
      { label: 'Author profiles and more', run: done(() => (ui.settings = 'you')) },
    ];
  }

  function thisComputer(): Part[] {
    return [
      {
        label: 'Light or dark',
        ring: () => [
          { label: 'Dark', on: mode.choice === 'dark', stay: true, run: () => mode.set('dark') },
          { label: 'Light', on: mode.choice === 'light', stay: true, run: () => mode.set('light') },
          { label: 'Match this computer', on: mode.choice === 'system', stay: true, run: () => mode.set('system') },
        ],
      },
      {
        label: 'Size',
        ring: () => [
          { label: 'Smaller', stay: true, run: () => zoom.step(-1) },
          { label: 'Larger', stay: true, run: () => zoom.step(1) },
        ],
      },
      { label: 'Dim everything but my sentence', on: quiet.on, stay: true, run: () => quiet.set(!quiet.on) },
      { label: 'Tumble the dice', on: tumbling.on, stay: true, run: () => tumbling.set(!tumbling.on) },
      { label: 'Sync now', run: done(() => sync.retry()) },
      { label: 'Library and more', run: done(() => (ui.settings = 'computer')) },
    ];
  }

  const first = (): Part[] => [
    { label: 'This page', disabled: !page, ring: thisPage },
    { label: 'This module', ring: thisModule },
    { label: 'This world', ring: thisWorld },
    { label: 'You', ring: you },
    { label: 'This computer', ring: thisComputer },
  ];

  // The rings chosen so far, as the place of each choice in its ring.
  let path = $state<number[]>([]);
  const trail = $derived.by(() => {
    let ring = first();
    const names: string[] = [];
    for (const i of path) {
      const part = ring[i];
      if (!part?.ring) break;
      names.push(part.label);
      ring = part.ring();
    }
    return { ring: ring.slice(0, 10), names };
  });
  const ring = $derived(trail.ring);

  function choose(i: number) {
    const part = ring[i];
    if (!part || part.disabled) return;
    if (part.ring) {
      path = [...path, i];
      void tick().then(() => focusPart(0));
    } else if (part.run) part.run();
  }
  function back() {
    if (path.length) {
      const was = path.at(-1)!;
      path = path.slice(0, -1);
      void tick().then(() => focusPart(was));
    } else onClose();
  }

  let wheel = $state<HTMLDivElement>();
  function focusPart(i: number) {
    const parts = [...(wheel?.querySelectorAll<HTMLButtonElement>('.part') ?? [])];
    (parts[i] && !parts[i].disabled ? parts[i] : parts.find((p) => !p.disabled))?.focus();
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      // Escape is answered here, so nothing behind the wheel closes.
      e.preventDefault();
      e.stopPropagation();
      return back();
    }
    const n = /^[0-9]$/.test(e.key) ? (e.key === '0' ? 9 : Number(e.key) - 1) : -1;
    if (n >= 0) {
      e.preventDefault();
      e.stopPropagation();
      return choose(n);
    }
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const parts = [...(wheel?.querySelectorAll<HTMLButtonElement>('.part') ?? [])];
      const now = parts.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      for (let k = 1; k <= parts.length; k++) {
        const next = parts[(now + step * k + parts.length * k) % parts.length];
        if (next && !next.disabled) return next.focus();
      }
    }
    // Every other key stays with the wheel while it is up.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) e.preventDefault();
  }

  // The keyboard returns to where it was when the wheel closes.
  onMount(() => {
    const before = document.activeElement as HTMLElement | null;
    void tick().then(() => focusPart(0));
    return () => before?.focus?.({ preventScroll: true });
  });

  // The wheel's middle: under the pointer, kept clear of the window's edges.
  const R = 178;
  const middle = $derived.by(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = R + 110;
    return at ? { x: Math.min(w - pad, Math.max(pad, at.x)), y: Math.min(h - R - 60, Math.max(R + 60, at.y)) } : { x: w / 2, y: h / 2 };
  });
  /** Where a part sits: the first at the top, the rest clockwise. */
  const place = (i: number, n: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
    return { x: Math.cos(angle) * R, y: Math.sin(angle) * R };
  };
</script>

<svelte:window onkeydowncapture={onkey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="veil" use:portal onclick={onClose} oncontextmenu={(e) => (e.preventDefault(), back())}>
  <div class="wheel" bind:this={wheel} role="menu" tabindex="-1" aria-label={trail.names.at(-1) ?? 'Everything'} style:left="{middle.x}px" style:top="{middle.y}px" onclick={(e) => e.stopPropagation()}>
    <button type="button" class="hub" onclick={back} title={path.length ? 'Back' : 'Close'}>
      <span class="where">{trail.names.at(-1) ?? 'Everything'}</span>
      <span class="hint">{path.length ? 'Esc · back' : 'Esc · close'}</span>
    </button>
    {#key path.join('.')}
      {#each ring as part, i (i)}
        {@const p = place(i, ring.length)}
        <button
          type="button"
          class="part"
          class:on={part.on}
          class:more={!!part.ring}
          role={part.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-checked={part.on}
          disabled={part.disabled}
          style:--x="{p.x}px"
          style:--y="{p.y}px"
          style:--i={i}
          onclick={() => choose(i)}>
          <kbd>{i === 9 ? 0 : i + 1}</kbd>
          <span class="name">{part.label}</span>
          {#if part.on !== undefined}<span class="state" aria-hidden="true">{part.on ? '●' : '○'}</span>{/if}
          {#if part.ring}<span class="state" aria-hidden="true">›</span>{/if}
        </button>
      {/each}
    {/key}
  </div>
</div>

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: color-mix(in oklab, var(--bg) 45%, transparent);
    backdrop-filter: blur(14px) saturate(1.15);
    -webkit-backdrop-filter: blur(14px) saturate(1.15);
    animation: veil-in 160ms ease both;
  }
  .wheel {
    position: absolute;
    width: 0;
    height: 0;
  }
  .hub {
    position: absolute;
    left: -74px;
    top: -74px;
    width: 148px;
    height: 148px;
    /* The Soft layout rounds every button its own way, and the wheel's shapes are its own. */
    border-radius: 50% !important;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    text-align: center;
    color: var(--text);
    background: color-mix(in oklab, var(--text) 8%, var(--bg));
    border: 0;
    box-shadow: 0 10px 40px var(--shadow);
  }
  .where {
    font-family: var(--font-display);
    font-size: calc(22px * var(--type));
    line-height: 1.05;
    letter-spacing: 0.02em;
    color: var(--title);
  }
  .hint {
    font-family: var(--font-label);
    font-size: calc(10px * var(--type));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .part {
    position: absolute;
    left: var(--x);
    top: var(--y);
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 230px;
    padding: 9px 14px 9px 9px;
    font-size: calc(14px * var(--type));
    line-height: 1.2;
    text-align: left;
    color: var(--text);
    background: color-mix(in oklab, var(--text) 9%, var(--bg));
    border: 0;
    border-radius: 999px !important;
    box-shadow: 0 6px 22px var(--shadow);
    white-space: nowrap;
    animation: part-in 220ms cubic-bezier(0.2, 0.8, 0.3, 1) both;
    animation-delay: calc(var(--i) * 18ms);
  }
  .part .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .part:hover:not(:disabled),
  .part:focus-visible {
    background: color-mix(in oklab, var(--text) 18%, var(--bg));
    outline: none;
  }
  .part:focus-visible {
    box-shadow:
      0 0 0 2px var(--accent),
      0 6px 22px var(--shadow);
  }
  .part:disabled {
    color: var(--muted);
    opacity: 0.45;
    box-shadow: none;
  }
  .part.on {
    background: color-mix(in oklab, var(--text) 16%, var(--bg));
  }
  kbd {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-family: var(--font-label);
    font-size: calc(11px * var(--type));
    color: var(--muted);
    background: color-mix(in oklab, var(--text) 8%, transparent);
  }
  .state {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 0.85em;
  }
  .part.on .state {
    color: var(--accent);
  }
  @keyframes veil-in {
    from {
      opacity: 0;
    }
  }
  @keyframes part-in {
    from {
      opacity: 0;
      transform: translate(calc(-50% - var(--x) * 0.35), calc(-50% - var(--y) * 0.35)) scale(0.9);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .veil,
    .part {
      animation: none;
    }
  }
</style>
