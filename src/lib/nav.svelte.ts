/**
 * Back and forward across everything the app shows (design: back and forward buttons).
 * A location is a module plus, for each module, the row of things open side by side as
 * sliding panes (Mike, October 24): wiki entries in World, and a manuscript with the
 * entries opened from it in Story. Every change to a row is one step of history, so
 * Back after following a name closes the pane it opened.
 */
export type Module = 'character' | 'play' | 'world' | 'story';

export interface Location {
  module: Module;
  /** What is open in each module, left to right. An empty World row shows the world's home. */
  rows: Partial<Record<Module, string[]>>;
}

function sameRow(a: string[] = [], b: string[] = []): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

function same(a: Location, b: Location): boolean {
  const modules = new Set([...Object.keys(a.rows), ...Object.keys(b.rows)]) as Set<Module>;
  return a.module === b.module && [...modules].every((m) => sameRow(a.rows[m], b.rows[m]));
}

export class Navigator {
  stack = $state<Location[]>([{ module: 'world', rows: {} }]);
  index = $state(0);
  /** The pane to bring into view, set when something already open is opened again. */
  reveal = $state<{ id: string; at: number } | null>(null);

  current: Location = $derived(this.stack[this.index]);
  /** The row of panes in the module on screen. */
  panes: string[] = $derived(this.current.rows[this.current.module] ?? []);
  /** The rightmost open entry, which the sidebar's working set follows. */
  entry: string | null = $derived(this.panes.at(-1) ?? null);
  canBack: boolean = $derived(this.index > 0);
  canForward: boolean = $derived(this.index < this.stack.length - 1);

  private push(next: Location) {
    if (same(next, this.current)) return;
    this.stack = [...this.stack.slice(0, this.index + 1), next];
    this.index = this.stack.length - 1;
  }

  /** Shows a module, with whatever was open in it before. */
  show(module: Module) {
    this.push({ ...this.current, module });
  }

  /** Replaces the row of panes in the module on screen. */
  setRow(panes: string[]) {
    this.push({ ...this.current, rows: { ...this.current.rows, [this.current.module]: panes } });
  }

  /**
   * Opens something in the module on screen. Followed from the pane at `from`, it opens
   * just to the right of that pane, and the panes beyond it move one place right (Mike,
   * October 24). Nothing closes unless the writer closes it. Opened from anywhere else,
   * such as the sidebar, it opens beside the last pane. Something already open is
   * brought into view instead.
   */
  open(id: string, from?: number) {
    const panes = this.panes;
    if (panes.includes(id)) {
      this.reveal = { id, at: Date.now() };
      return;
    }
    const after = from ?? panes.length - 1;
    this.setRow([...panes.slice(0, after + 1), id, ...panes.slice(after + 1)]);
  }

  close(id: string) {
    this.setRow(this.panes.filter((p) => p !== id));
  }

  back() {
    if (this.canBack) this.index -= 1;
  }

  forward() {
    if (this.canForward) this.index += 1;
  }

  /** Things opened before the current location, most recent first, without repeats. */
  recentEntries(limit = 5): string[] {
    const seen: string[] = [];
    const open = this.panes;
    for (let i = this.index - 1; i >= 0 && seen.length < limit; i--) {
      for (const row of Object.values(this.stack[i].rows)) {
        for (const e of [...(row ?? [])].reverse()) {
          if (seen.length < limit && !open.includes(e) && !seen.includes(e)) seen.push(e);
        }
      }
    }
    return seen;
  }
}
