/**
 * Saves one piece of a page a moment after typing stops, and at once when the page
 * closes, so nothing typed is lost. `status` drives the page's Saved line.
 */
import { registerPanel } from '../saves';

/** Savers with something waiting, so a closing world or window saves them first. */
const waiting = new Set<Saver<never>>();
registerPanel(async () => {
  await Promise.all([...waiting].map((s) => s.flush()));
});

export class Saver<T> {
  status = $state<'saved' | 'editing' | 'saving' | 'problem'>('saved');
  problem = $state('');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiting: { value: T } | null = null;

  constructor(
    private run: (value: T) => Promise<void>,
    private delay = 700,
  ) {}

  push(value: T) {
    this.waiting = { value };
    waiting.add(this as unknown as Saver<never>);
    this.status = 'editing';
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const job = this.waiting;
    waiting.delete(this as unknown as Saver<never>);
    if (!job) return;
    this.waiting = null;
    this.status = 'saving';
    try {
      await this.run(job.value);
      if (!this.waiting) this.status = 'saved';
    } catch (e) {
      this.problem = e instanceof Error ? e.message : String(e);
      this.status = 'problem';
    }
  }
}

export const said = (s: Saver<unknown>['status']) => (s === 'saved' ? 'Saved' : s === 'saving' ? 'Saving…' : s === 'editing' ? 'Editing' : 'Not saved');
