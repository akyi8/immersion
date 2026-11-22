/**
 * Where the tray writes a roll or a drawn card (Cerys, November 14): the session log the
 * writer was last in. The log's page says so when it has the keyboard.
 */
export interface LogTarget {
  path: string;
  name: string;
  /** Writes a line into the log as a paragraph of its own, after the cursor's paragraph. */
  write: (line: string) => void;
}

class Tray {
  target = $state<LogTarget | null>(null);

  aim(target: LogTarget) {
    if (this.target?.path !== target.path) this.target = target;
    else this.target.write = target.write;
  }

  leave(path: string) {
    if (this.target?.path === path) this.target = null;
  }
}

export const tray = new Tray();

/** Whether dice tumble across the screen when rolled (Cerys, November 14). Kept by this computer. */
const TUMBLE = 'immersion.table.tumble';
class Tumbling {
  on = $state(
    (() => {
      try {
        return localStorage.getItem(TUMBLE) !== 'off';
      } catch {
        return true;
      }
    })(),
  );

  set(on: boolean) {
    this.on = on;
    try {
      localStorage.setItem(TUMBLE, on ? 'on' : 'off');
    } catch {
      // Not remembering the choice is harmless.
    }
  }
}
export const tumbling = new Tumbling();

/**
 * Renaming is typing over a page's title (Cerys, November 15). "Rename" in a menu opens
 * the page and asks it to put the cursor in its title, which this carries.
 */
class TitleFocus {
  ask = $state<{ id: string; at: number } | null>(null);

  request(id: string) {
    this.ask = { id, at: Date.now() };
  }

  /** Puts the cursor in a title field when it is the one asked for. Used from an effect. */
  serve(id: string, input: HTMLInputElement | undefined) {
    const ask = this.ask;
    if (!ask || ask.id !== id || !input || Date.now() - ask.at > 4000) return;
    input.focus();
    input.select();
    this.ask = null;
  }
}
export const titleFocus = new TitleFocus();
