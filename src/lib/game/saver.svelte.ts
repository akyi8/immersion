import { errorText } from '../errors.ts';
/**
 * Saves one piece of a page a moment after typing stops, and at once when the page
 * closes, so nothing typed is lost. `status` drives the page's Saved line.
 */
import { registerPanel } from '../saves';

/** Savers with something waiting, so a closing world or window saves them first. */
const waiting = new Set<Saver<never>>();
registerPanel(async () => (await Promise.all([...waiting].map((s) => s.flush()))).every(Boolean));
// The list above is asked before a world or the window closes. A page asks its own saver
// with `last` when the page itself goes away.

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

  /**
   * Saves what is waiting, and says whether it is now on disk. With `last` the page is
   * going away, so a save that fails is not tried again: a later try would write into
   * whichever world was open by then.
   */
  async flush(last = false): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const job = this.waiting;
    if (!job) return this.status !== 'problem';
    this.waiting = null;
    this.status = 'saving';
    try {
      await this.run(job.value);
      this.problem = '';
      if (!this.waiting) {
        waiting.delete(this as unknown as Saver<never>);
        this.status = 'saved';
      }
      return true;
    } catch (e) {
      // What failed to save is kept and tried again, so closing the page cannot lose it.
      this.waiting ??= job;
      this.problem = errorText(e);
      this.status = 'problem';
      if (last) waiting.delete(this as unknown as Saver<never>);
      else this.timer = setTimeout(() => void this.flush(), 5000);
      return false;
    }
  }
}

export const said = (s: Saver<unknown>['status']) => (s === 'saved' ? 'Saved' : s === 'saving' ? 'Saving…' : s === 'editing' ? 'Editing' : 'Not saved');
