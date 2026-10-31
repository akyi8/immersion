/**
 * The right-click menu (Mike, October 25). Any list in the app can open it with the
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

  /** Opens at the pointer, or at `at` when the menu belongs under a button. */
  show(event: MouseEvent, items: MenuEntry[], at?: { x: number; y: number }) {
    event.preventDefault();
    event.stopPropagation();
    this.items = items;
    this.x = at?.x ?? event.clientX;
    this.y = at?.y ?? event.clientY;
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

export const contextMenu = new ContextMenu();
