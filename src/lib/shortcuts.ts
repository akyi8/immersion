import type { KeyBinding } from '@codemirror/view';

/**
 * The app's own keyboard shortcuts, in one place.
 *
 * | Keys                                   | What it does                       | Where it is bound      |
 * | -------------------------------------- | ---------------------------------- | ---------------------- |
 * | Cmd K on a Mac, Ctrl K elsewhere       | Opens Find                         | `screens/Shell.svelte` |
 * | Cmd [ and Cmd ] on a Mac               | Back and Forward                   | `screens/Shell.svelte` |
 * | Alt Left and Alt Right elsewhere       | Back and Forward                   | `screens/Shell.svelte` |
 * | Ctrl or Cmd with + - 0                 | Makes everything larger or smaller | `lib/zoom.svelte.ts`   |
 * | Ctrl or Cmd, Shift, L                  | Locks the vault                    | `App.svelte`           |
 *
 * Each one is bound with `onShortcut`, which leaves a key alone when something nearer to
 * the writer has already used it. The editor's own keymap is passed through `forEditor`,
 * which takes out the editor keys that mean something else in the app, so one key never
 * does two things at once.
 */
export function onShortcut(handle: (e: KeyboardEvent) => void): () => void {
  const listen = (e: KeyboardEvent) => {
    if (!e.defaultPrevented) handle(e);
  };
  window.addEventListener('keydown', listen);
  return () => window.removeEventListener('keydown', listen);
}

export const onMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/** Whether the key is the platform's main modifier alone: Cmd on a Mac, Ctrl elsewhere. */
export function mod(e: KeyboardEvent): boolean {
  return (onMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey;
}

/** The editor keys the app uses for something else: indenting a line by a bracket key. */
const TAKEN = new Set(['Mod-[', 'Mod-]']);

/** The editor's keymap without the keys the app has taken. */
export function forEditor(keys: readonly KeyBinding[]): KeyBinding[] {
  return keys.filter((k) => !(k.key && TAKEN.has(k.key)));
}
