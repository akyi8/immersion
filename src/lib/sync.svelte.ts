import type { Pending, SyncReport, WorldFs } from './fs/types';
import { saveAll } from './saves';
import { account } from './account.svelte';

/**
 * When the open world syncs through Git (Mike, October 26): as it opens, a few minutes
 * after the writing stops, every five minutes while it is open, and when the app comes
 * back to the front. Closing the world
 * syncs it once more, from the Rust side, so leaving never waits on the network.
 */
const AFTER_WRITING_MS = 3 * 60 * 1000;
const EVERY_MS = 5 * 60 * 1000;
/**
 * Coming back to the app syncs too (Mike, October 31), so changes a Claude session made
 * in the meantime arrive without a press of the button, unless a sync just ran.
 */
const BACK_AFTER_MS = 60 * 1000;
/** Changes that arrive right after a sync are the sync's own pull, not new writing. */
const ITS_OWN_MS = 4000;

class Sync {
  state = $state<SyncReport['state'] | 'idle' | 'syncing'>('idle');
  message = $state('');
  at = $state<number | null>(null);
  /** What waits to go out and come in, recounted soon after every change. */
  counts = $state.raw<Pending | null>(null);
  private fs: WorldFs | null = null;
  private recount: ReturnType<typeof setTimeout> | null = null;
  private name = '';
  private busy = false;
  private quietUntil = 0;
  /** When a sync last began, so coming back to the app does not sync twice in a row. */
  private tried = 0;
  private afterWriting: ReturnType<typeof setTimeout> | null = null;
  private every: ReturnType<typeof setInterval> | null = null;
  private stopWatching = () => {};

  start(fs: WorldFs, name: string) {
    this.stop();
    this.fs = fs;
    this.name = name;
    this.state = 'idle';
    this.message = '';
    this.counts = null;
    void this.count();
    void this.now();
    this.every = setInterval(() => void this.now(), EVERY_MS);
    const back = () => {
      if (Date.now() - this.tried > BACK_AFTER_MS) void this.now();
    };
    window.addEventListener('focus', back);
    const stopBack = () => window.removeEventListener('focus', back);
    const watching = fs.onChange(() => {
      // A save shows in the count within a couple of seconds, without waiting for a sync.
      if (this.recount) clearTimeout(this.recount);
      this.recount = setTimeout(() => void this.count(), 1500);
      if (this.busy || Date.now() < this.quietUntil) return;
      if (this.afterWriting) clearTimeout(this.afterWriting);
      this.afterWriting = setTimeout(() => void this.now(), AFTER_WRITING_MS);
    });
    this.stopWatching = () => {
      watching();
      stopBack();
    };
  }

  stop() {
    this.stopWatching();
    this.stopWatching = () => {};
    if (this.afterWriting) clearTimeout(this.afterWriting);
    if (this.every) clearInterval(this.every);
    if (this.recount) clearTimeout(this.recount);
    this.recount = null;
    this.afterWriting = null;
    this.every = null;
    this.fs = null;
  }

  /** Syncs now, unless a sync is already running or syncing is off. */
  async now() {
    const fs = this.fs;
    if (!fs || this.busy || this.state === 'off' || this.state === 'not-git') return;
    this.busy = true;
    this.tried = Date.now();
    const was = this.state;
    this.state = 'syncing';
    try {
      await saveAll();
      const r = await fs.sync(this.name);
      if (fs !== this.fs) return;
      this.state = r.state;
      this.message = r.message;
      if (r.state === 'synced' || r.state === 'local') this.at = Date.now();
      // A pull can bring in another computer's immersion.md: profiles, layout, the vault.
      if (r.state === 'synced') await account.refresh().catch(() => {});
    } catch (e) {
      this.state = 'problem';
      this.message = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
      this.quietUntil = Date.now() + ITS_OWN_MS;
      if (this.state === 'syncing') this.state = was;
      void this.count();
    }
  }

  /** Counts what waits to sync, from Git on this computer alone. */
  async count() {
    const fs = this.fs;
    if (!fs) return;
    try {
      const counts = await fs.pending(false);
      if (fs === this.fs) this.counts = counts;
    } catch {
      // A count that cannot be made leaves the last one showing.
    }
  }

  /** Lets a world whose syncing was switched back on try again. */
  retry() {
    if (this.state === 'off' || this.state === 'not-git') this.state = 'idle';
    void this.now();
  }
}

export const sync = new Sync();
