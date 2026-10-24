/**
 * Back and forward across everything the app shows (design: back and forward buttons).
 * A location is a module plus, in the World module, the row of entries open side by side
 * as sliding panes (Mike, October 24). Every change to the row is one step of history,
 * so Back after following a name closes the pane it opened.
 */
export type Module = 'character' | 'play' | 'world' | 'story';

export interface Location {
  module: Module;
  /** Entry ids open in the World module, left to right. Empty shows the world's home. */
  panes: string[];
}

function same(a: Location, b: Location): boolean {
  return a.module === b.module && a.panes.length === b.panes.length && a.panes.every((p, i) => p === b.panes[i]);
}

export class Navigator {
  stack = $state<Location[]>([{ module: 'world', panes: [] }]);
  index = $state(0);
  /** The pane to bring into view, set when a name that is already open is followed. */
  reveal = $state<{ id: string; at: number } | null>(null);

  current: Location = $derived(this.stack[this.index]);
  /** The rightmost open entry, which the sidebar's working set follows. */
  entry: string | null = $derived(this.current.panes.at(-1) ?? null);
  canBack: boolean = $derived(this.index > 0);
  canForward: boolean = $derived(this.index < this.stack.length - 1);

  go(patch: Partial<Location>) {
    const next = { ...this.current, ...patch };
    if (same(next, this.current)) return;
    this.stack = [...this.stack.slice(0, this.index + 1), next];
    this.index = this.stack.length - 1;
  }

  /**
   * Opens an entry. Followed from the pane at `from`, it opens just to the right of that
   * pane and closes the panes beyond it. Opened from anywhere else, such as the sidebar,
   * it starts a new row. An entry that is already open is brought into view instead.
   */
  open(id: string, from?: number) {
    const panes = this.current.panes;
    if (from !== undefined && panes.includes(id)) {
      this.reveal = { id, at: Date.now() };
      return;
    }
    this.go({ module: 'world', panes: from === undefined ? [id] : [...panes.slice(0, from + 1), id] });
  }

  close(id: string) {
    this.go({ panes: this.current.panes.filter((p) => p !== id) });
  }

  home() {
    this.go({ module: 'world', panes: [] });
  }

  back() {
    if (this.canBack) this.index -= 1;
  }

  forward() {
    if (this.canForward) this.index += 1;
  }

  /** Entries visited before the current location, most recent first, without repeats. */
  recentEntries(limit = 5): string[] {
    const seen: string[] = [];
    const open = this.current.panes;
    for (let i = this.index - 1; i >= 0 && seen.length < limit; i--) {
      for (const e of [...this.stack[i].panes].reverse()) {
        if (seen.length < limit && !open.includes(e) && !seen.includes(e)) seen.push(e);
      }
    }
    return seen;
  }
}
