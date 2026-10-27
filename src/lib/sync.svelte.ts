import type { SyncReport, WorldFs } from './fs/types';
import { saveAll } from './saves';
import { account } from './account.svelte';

/**
 * When the open world syncs through Git (Mike, October 26): as it opens, a few minutes
 * after the writing stops, and every ten minutes while it is open. Closing the world
 * syncs it once more, from the Rust side, so leaving never waits on the network.
 */
const AFTER_WRITING_MS = 3 * 60 * 1000;
const EVERY_MS = 10 * 60 * 1000;
/** Changes that arrive right after a sync are the sync's own pull, not new writing. */
const ITS_OWN_MS = 4000;

class Sync {
  state = $state<SyncReport['state'] | 'idle' | 'syncing'>('idle');
  message = $state('');
  at = $state<number | null>(null);
  private fs: WorldFs | null = null;
  private name = '';
  private busy = false;
  private quietUntil = 0;
  private afterWriting: ReturnType<typeof setTimeout> | null = null;
  private every: ReturnType<typeof setInterval> | null = null;
  private stopWatching = () => {};

  start(fs: WorldFs, name: string) {
    this.stop();
    this.fs = fs;
    this.name = name;
    this.state = 'idle';
    this.message = '';
    void this.now();
    this.every = setInterval(() => void this.now(), EVERY_MS);
    this.stopWatching = fs.onChange(() => {
      if (this.busy || Date.now() < this.quietUntil) return;
      if (this.afterWriting) clearTimeout(this.afterWriting);
      this.afterWriting = setTimeout(() => void this.now(), AFTER_WRITING_MS);
    });
  }

  stop() {
    this.stopWatching();
    this.stopWatching = () => {};
    if (this.afterWriting) clearTimeout(this.afterWriting);
    if (this.every) clearInterval(this.every);
    this.afterWriting = null;
    this.every = null;
    this.fs = null;
  }

  /** Syncs now, unless a sync is already running or syncing is off. */
  async now() {
    const fs = this.fs;
    if (!fs || this.busy || this.state === 'off' || this.state === 'not-git') return;
    this.busy = true;
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
    }
  }

  /** Lets a world whose syncing was switched back on try again. */
  retry() {
    if (this.state === 'off' || this.state === 'not-git') this.state = 'idle';
    void this.now();
  }
}

export const sync = new Sync();
