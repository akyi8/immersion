import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DirEntry, ImageSource, WorldFs } from './types';

/** The real world folder on disk, reached through the Rust backend. */
export class DiskFs implements WorldFs {
  readonly kind = 'disk' as const;

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
    return this.imageVersion ? `${url}?v=${this.imageVersion}` : url;
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
