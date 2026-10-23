/**
 * Back and forward across everything the app shows (design: back and forward buttons).
 * A location is a module plus, in the World module, the entry on screen.
 */
export type Module = 'character' | 'play' | 'world' | 'story';

export interface Location {
  module: Module;
  entry: string | null;
}

export class Navigator {
  stack = $state<Location[]>([{ module: 'world', entry: null }]);
  index = $state(0);

  current: Location = $derived(this.stack[this.index]);
  canBack: boolean = $derived(this.index > 0);
  canForward: boolean = $derived(this.index < this.stack.length - 1);

  go(patch: Partial<Location>) {
    const next = { ...this.current, ...patch };
    if (next.module === this.current.module && next.entry === this.current.entry) return;
    this.stack = [...this.stack.slice(0, this.index + 1), next];
    this.index = this.stack.length - 1;
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
    for (let i = this.index - 1; i >= 0 && seen.length < limit; i--) {
      const e = this.stack[i].entry;
      if (e && e !== this.current.entry && !seen.includes(e)) seen.push(e);
    }
    return seen;
  }
}
