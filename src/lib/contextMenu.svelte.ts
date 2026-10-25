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

  show(event: MouseEvent, items: MenuEntry[]) {
    event.preventDefault();
    event.stopPropagation();
    this.items = items;
    this.x = event.clientX;
    this.y = event.clientY;
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

export const contextMenu = new ContextMenu();
