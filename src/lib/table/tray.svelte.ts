/**
 * Where the tray writes a roll or a drawn card (Mike, November 14): the session log the
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
