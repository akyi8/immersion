/**
 * What a page offers about its picture, shown in the page's view menu (Mike, November 10).
 * Everything about how a page looks sits behind one button: its column, its text, and its
 * picture, including changing, framing, and removing the picture. A page says what it
 * offers here, and the view menu in `Panes.svelte` shows it.
 */
import { untrack } from 'svelte';
import type { MenuEntry } from './contextMenu.svelte';

export interface PaneAction {
  label: string;
  run: () => void;
  /** Set on a choice among a few, such as how the picture shows, and true on the one in use. */
  pressed?: boolean;
}

/** The context a page reads to learn which pane it is in. */
export const PANE = 'immersion.pane';

class ActionList<T> {
  // The lists are kept outside the reactive state, and a counter says when they changed.
  // A page sets its list from an effect, and an effect that both read and wrote one
  // piece of state would run itself forever.
  private lists = new Map<string, T[]>();
  private changed = $state(0);

  of(id: string): T[] {
    void this.changed;
    return this.lists.get(id) ?? [];
  }

  set(id: string, actions: T[]) {
    this.lists.set(id, actions);
    this.changed = untrack(() => this.changed) + 1;
  }

  clear(id: string) {
    if (!this.lists.delete(id)) return;
    this.changed = untrack(() => this.changed) + 1;
  }
}

export const pictureActions = new ActionList<PaneAction>();

/**
 * What can be done to a page as a whole, such as renaming or archiving it (Mike,
 * November 10). The page says what it offers, and the pane shows it behind the ⋯ in its
 * corner, beside the view menu, full screen, and close. Every page's actions are then in
 * one place, in the app's one menu.
 */
export const pageActions = new ActionList<MenuEntry>();
