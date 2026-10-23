import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DirEntry, WorldFs } from './types';

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

  imageUrl(path: string): string {
    // The backend serves the open world's files on the `world` scheme.
    return convertFileSrc(path.replace(/\\/g, '/'), 'world');
  }

  writeText(path: string, content: string): Promise<void> {
    return invoke('write_text', { rel: path, content });
  }

  createDir(path: string): Promise<void> {
    return invoke('create_dir', { rel: path });
  }

  onChange(callback: (paths: string[]) => void): () => void {
    const stop = listen<string[]>('world-changed', (event) => callback(event.payload));
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }
}

/** The world folder this machine opened last time, if it still exists. */
export function rememberedWorld(): Promise<string | null> {
  return invoke<string | null>('remembered_world');
}

/** Opens a world folder. Fails when the folder has no world.md. */
export function openWorldFolder(path: string): Promise<void> {
  return invoke('open_world', { path });
}

/** Forgets the open world, so the app asks for a folder again. */
export function closeWorld(): Promise<void> {
  return invoke('close_world');
}
