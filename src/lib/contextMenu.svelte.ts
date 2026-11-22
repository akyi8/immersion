/**
 * The right-click menu (Cerys, October 25). Any list in the app can open it with the
 * actions that fit what was clicked, and one menu, drawn by the app's shell, shows them.
 */
export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
}

export type MenuEntry = MenuItem | 'separator';

class ContextMenu {
  items = $state<MenuEntry[]>([]);
  x = $state(0);
  y = $state(0);
  open = $state(false);
  /** What held the keyboard when the menu opened, which gets it back when the menu closes. */
  private opener: HTMLElement | null = null;

  /**
   * Opens at the pointer, or at `at` when the menu belongs under a button. A menu opened
   * from the keyboard has no pointer, so it opens under the row or button that opened it.
   */
  show(event: MouseEvent, items: MenuEntry[], at?: { x: number; y: number }) {
    event.preventDefault();
    event.stopPropagation();
    const from = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const keyed = event.detail === 0 && event.clientX === 0 && event.clientY === 0;
    const box = keyed && !at ? from?.getBoundingClientRect() : null;
    this.opener = keyed && from ? from : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.items = items;
    this.x = at?.x ?? (box ? box.left + 12 : event.clientX);
    this.y = at?.y ?? (box ? box.bottom + 2 : event.clientY);
    this.open = true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
}

export const contextMenu = new ContextMenu();
