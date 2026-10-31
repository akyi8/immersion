import type { Update } from '@tauri-apps/plugin-updater';
import { findUpdate } from './updates';

/**
 * Whether a newer build is waiting (Mike, October 31). The app asks GitHub when it
 * starts, and again whenever it has been open six hours since it last asked, so a build
 * that arrives during a long day still shows its button. One small request each time.
 */
const EVERY_MS = 6 * 60 * 60 * 1000;

class Updates {
  available = $state.raw<Update | null>(null);
  private asked = 0;

  start() {
    void this.check();
    setInterval(() => void this.check(), EVERY_MS);
    window.addEventListener('focus', () => void this.check());
  }

  async check() {
    if (this.available || (this.asked && Date.now() - this.asked < EVERY_MS)) return;
    this.asked = Date.now();
    this.available = await findUpdate();
  }
}

export const updates = new Updates();
