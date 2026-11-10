import { merge3 } from './merge.ts';

/**
 * Saves an open file a moment after typing stops, and settles what happens when the
 * same file changes on disk meanwhile. The writer edits in the app while a Git pull, or
 * an assistant working in the same folder, edits the file from outside.
 *
 * Three rules hold. The app never writes over a version on disk it has not seen. Edits
 * to different lines are joined without a question. Edits to the same lines are shown
 * to the writer, and nothing is written until they choose.
 */
export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error';

export interface AutosaveHost {
  /** The file on disk, with plain line endings. Throws when the file is not there. */
  read(): Promise<string>;
  write(text: string): Promise<void>;
  /** The text in the editor now. */
  doc(): string;
  /** Puts text into the editor. */
  show(text: string): void;
  /** Called whenever the status, the problem, or the conflict changes. */
  changed?(): void;
  /** How long after the last keystroke the save runs. */
  delay?: number;
  /** How long after a failed save the next try runs. */
  retry?: number;
}

export class Autosave {
  status: SaveStatus = 'loading';
  problem = '';
  /** The version on disk that clashes with unsaved typing, while the writer decides. */
  conflict: string | null = null;

  /** The text the app last saw on disk. */
  private seen = '';
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  /** The text being written right now, so the watcher's echo of it is ignored. */
  private writing: string | null = null;
  private showing = false;
  private host: AutosaveHost;

  constructor(host: AutosaveHost) {
    this.host = host;
  }

  /** Begins with the text just read from disk. */
  start(text: string) {
    this.seen = text;
    this.set('saved');
  }

  /** The editor's text changed. */
  typed() {
    if (this.showing) return;
    this.dirty = true;
    this.set('saving');
    if (this.conflict === null) this.schedule(this.host.delay ?? 800);
  }

  /**
   * Writes what is waiting. With `force`, a clash still open is settled in the writer's
   * favor, which is what closing the page without choosing means.
   */
  async save(force = false): Promise<void> {
    this.unschedule();
    while (this.running) await this.running;
    if (force && this.conflict !== null) {
      this.seen = this.conflict;
      this.conflict = null;
      this.dirty = true;
    }
    if (this.conflict !== null || !this.dirty) return;
    this.running = this.write();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  private async write() {
    // The file is read first, because a change made a moment ago may not have been announced yet.
    let disk: string | null;
    try {
      disk = await this.host.read();
    } catch {
      disk = null;
    }
    if (disk !== null && disk !== this.seen && !this.reconcile(disk)) return;
    const text = this.host.doc();
    this.dirty = false;
    if (text === this.seen && disk !== null) {
      this.set('saved');
      return;
    }
    this.writing = text;
    try {
      await this.host.write(text);
      this.seen = text;
      if (this.dirty) this.schedule(this.host.delay ?? 800);
      else this.set('saved');
    } catch (e) {
      this.dirty = true;
      this.set('error', e instanceof Error ? e.message : String(e));
      this.schedule(this.host.retry ?? 5000);
    } finally {
      this.writing = null;
    }
  }

  /** The file changed on disk. Returns true when new text was brought into the editor. */
  async changedElsewhere(): Promise<boolean> {
    let disk: string;
    try {
      disk = await this.host.read();
    } catch {
      return false;
    }
    if (disk === this.seen || disk === this.writing) return false;
    const before = this.host.doc();
    this.reconcile(disk);
    return this.host.doc() !== before;
  }

  /**
   * Takes in a version of the file the app has not seen. Returns false when it clashes
   * with unsaved typing, and the writer is then asked.
   */
  private reconcile(disk: string): boolean {
    const doc = this.host.doc();
    const merged = merge3(this.seen, doc, disk);
    if (merged === null) {
      this.unschedule();
      this.conflict = disk;
      this.host.changed?.();
      return false;
    }
    this.seen = disk;
    this.conflict = null;
    if (merged !== doc) this.put(merged);
    this.dirty = merged !== disk;
    if (this.dirty) {
      this.set('saving');
      this.schedule(this.host.delay ?? 800);
    } else {
      this.unschedule();
      this.set('saved');
    }
    return true;
  }

  /** The writer chose the version on disk. */
  takeTheirs() {
    if (this.conflict === null) return;
    this.unschedule();
    this.seen = this.conflict;
    this.conflict = null;
    this.put(this.seen);
    this.dirty = false;
    this.set('saved');
  }

  /** The writer chose their own text, which is saved at once. */
  async keepMine() {
    if (this.conflict === null) return;
    this.seen = this.conflict;
    this.conflict = null;
    this.dirty = true;
    this.set('saving');
    await this.save();
  }

  private put(text: string) {
    this.showing = true;
    try {
      this.host.show(text);
    } finally {
      this.showing = false;
    }
  }

  private schedule(ms: number) {
    this.unschedule();
    this.timer = setTimeout(() => void this.save(), ms);
  }

  private unschedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(status: SaveStatus, problem = '') {
    this.status = status;
    this.problem = problem;
    this.host.changed?.();
  }

  /** Stops the timer, when the page is going away. */
  stop() {
    this.unschedule();
  }
}
