import { merge3 } from './merge.ts';

/**
 * What an open piece of text does when the same text arrives changed from outside,
 * such as from a Git pull or an assistant working in the same folder. It serves pages
 * that save through their own form, like the Game module's, where the editor holds one
 * part of a file. `lib/editor/autosave.ts` does the same for a page that is a whole file.
 *
 * `seed` is the text the editor last took from the file. `mine` is what the editor holds
 * now. `theirs` is what the file says now. `sent` holds what this editor recently handed
 * over to be saved, so that its own save coming back is not mistaken for someone else's.
 */
export interface Reconciled {
  /** The text to put in the editor, or null to leave the editor as it is. */
  show: string | null;
  /** What the editor has now taken from the file. */
  seed: string;
  /** Both changed the same lines. The writer's text stays, and the next save writes it. */
  clash: boolean;
}

export function reconcile(seed: string, mine: string, theirs: string, sent: readonly string[] = []): Reconciled {
  if (theirs === seed) return { show: null, seed, clash: false };
  if (theirs === mine || sent.includes(theirs)) return { show: null, seed: theirs, clash: false };
  if (mine === seed) return { show: theirs, seed: theirs, clash: false };
  const merged = merge3(seed, mine, theirs);
  if (merged === null) return { show: null, seed: theirs, clash: true };
  return { show: merged === mine ? null : merged, seed: theirs, clash: false };
}
