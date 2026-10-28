import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DirEntry, ImageSource, Pending, SyncReport, WorldFs } from './types';

/** The real world folder on disk, reached through the Rust backend. */
export class DiskFs implements WorldFs {
  readonly kind = 'disk' as const;

  /**
   * Every world's pictures are served at the same addresses, such as `world.png`, so
   * each address also names its world. Otherwise the webview can show a picture it
   * cached from the world opened before (Mike, October 25).
   */
  private worldTag: string;

  constructor(worldPath: string) {
    let hash = 0;
    for (const ch of worldPath) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
    this.worldTag = (hash >>> 0).toString(36);
  }

  readText(path: string): Promise<string> {
    return invoke<string>('read_text', { rel: path });
  }

  readDir(path: string): Promise<DirEntry[]> {
    return invoke<DirEntry[]>('read_dir', { rel: path });
  }

  exists(path: string): Promise<boolean> {
    return invoke<boolean>('exists', { rel: path });
  }

  // Bumped when a picture changes, so the webview loads it again instead of its cached copy.
  private imageVersion = 0;

  imageUrl(path: string): string {
    // The backend serves the open world's files on the `world` scheme.
    const url = convertFileSrc(path.replace(/\\/g, '/'), 'world');
    return `${url}?w=${this.worldTag}${this.imageVersion ? `&v=${this.imageVersion}` : ''}`;
  }

  async setImage(stem: string, image: ImageSource): Promise<string> {
    if (image.kind !== 'path') throw new Error('The desktop app takes pictures from disk.');
    const path = await invoke<string>('set_image', { stem, source: image.path });
    this.imageVersion += 1;
    return path;
  }

  writeText(path: string, content: string): Promise<void> {
    return invoke('write_text', { rel: path, content });
  }

  createDir(path: string): Promise<void> {
    return invoke('create_dir', { rel: path });
  }

  move(from: string, to: string): Promise<void> {
    return invoke('move_path', { from, to });
  }

  writingActivity(dir: string, days: number): Promise<{ days: [string, number][]; uncommitted: number } | null> {
    return invoke('writing_activity', { dir, days });
  }

  sync(name: string): Promise<SyncReport> {
    return invoke<SyncReport>('sync_world', { name });
  }

  pending(fetch: boolean): Promise<Pending> {
    return invoke<Pending>('world_pending', { fetch });
  }

  onChange(callback: (paths: string[]) => void): () => void {
    const stop = listen<string[]>('world-changed', (event) => {
      // A picture changed in another program shows its new version too.
      if (event.payload.some((p) => /\.(jpe?g|png|webp)$/i.test(p))) this.imageVersion += 1;
      callback(event.payload);
    });
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }
}
