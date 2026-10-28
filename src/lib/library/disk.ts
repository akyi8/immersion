import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { DiskFs } from '../fs/disk';
import type { ImageSource, Pending, SyncReport, WorldFs } from '../fs/types';
import { pickImage } from '../pickImage';
import { describeWorld } from '../world';
import type { FolderShape, Library, LibraryInfo, ShelfWorld } from './types';

interface RawShelfWorld {
  path: string;
  worldMd: string | null;
  hasCover: boolean;
  local: boolean;
}

/** This machine's shelf, kept by the Rust backend in the app's settings. */
export class DiskLibrary implements Library {
  async list(): Promise<ShelfWorld[]> {
    const raw = await invoke<RawShelfWorld[]>('shelf');
    // Covers are served by their place on the shelf. The stamp makes a changed cover load again.
    const stamp = Date.now();
    return raw.map((w, i) => {
      const about = w.worldMd ? describeWorld(w.worldMd) : null;
      return {
        path: w.path,
        name: about?.name ?? w.path.split(/[\\/]/).filter(Boolean).pop() ?? w.path,
        tagline: about?.tagline ?? '',
        cover: w.hasCover ? `${convertFileSrc(String(i), 'shelf')}?v=${stamp}` : null,
        missing: w.worldMd === null,
        worldMd: w.worldMd,
        local: w.local,
        journal: about?.journal ?? false,
      };
    });
  }

  last(): Promise<string | null> {
    return invoke<string | null>('remembered_world');
  }

  async open(path: string): Promise<WorldFs> {
    await invoke('open_world', { path });
    return new DiskFs(path);
  }

  close(): Promise<void> {
    return invoke('close_world');
  }

  forget(path: string): Promise<void> {
    return invoke('forget_world', { path });
  }

  async pickFolder(title: string, start?: string | null): Promise<string | null> {
    const picked = await open({ directory: true, title, defaultPath: start ?? undefined });
    return typeof picked === 'string' ? picked : null;
  }

  pickImage(): Promise<ImageSource | null> {
    return pickImage();
  }

  async inspect(path: string): Promise<FolderShape> {
    const shape = await invoke<{ hasWorld: boolean; folders: [string, number][] }>('inspect_folder', { path });
    return { hasWorld: shape.hasWorld, folders: shape.folders.map(([name, markdown]) => ({ name, markdown })) };
  }

  add(path: string, worldMd: string | null): Promise<void> {
    return invoke('add_world', { path, worldMd });
  }

  defaultLocation(): Promise<string> {
    return invoke<string>('default_library');
  }

  create(parent: string, folder: string, worldMd: string, dirs: string[]): Promise<string> {
    return invoke<string>('create_world', { parent, folder, worldMd, dirs });
  }

  writeWorldMd(path: string, text: string): Promise<void> {
    return invoke('write_world_md', { path, text });
  }

  async setCover(path: string, image: ImageSource): Promise<void> {
    if (image.kind !== 'path') throw new Error('The desktop app takes pictures from disk.');
    await invoke('set_world_cover', { path, source: image.path });
  }

  info(): Promise<LibraryInfo> {
    return invoke<LibraryInfo>('library_info');
  }

  setLibrary(path: string | null): Promise<void> {
    return invoke('set_library', { path });
  }

  skipLibrary(): Promise<void> {
    return invoke('skip_library');
  }

  setGitSync(on: boolean): Promise<void> {
    return invoke('set_git_sync', { on });
  }

  readYou(): Promise<string | null> {
    return invoke<string | null>('read_you');
  }

  writeYou(text: string): Promise<void> {
    return invoke('write_you', { text });
  }

  syncYou(): Promise<SyncReport> {
    return invoke<SyncReport>('sync_you');
  }

  pending(fetch: boolean): Promise<Pending> {
    return invoke<Pending>('library_pending', { fetch });
  }

  syncLibrary(): Promise<SyncReport> {
    return invoke<SyncReport>('sync_library');
  }

  vaultList(world: string): Promise<string[]> {
    return invoke<string[]>('vault_list', { world });
  }

  vaultRead(world: string, name: string): Promise<string> {
    return invoke<string>('vault_read', { world, name });
  }

  vaultWrite(world: string, name: string, text: string): Promise<void> {
    return invoke('vault_write', { world, name, text });
  }

  vaultArchive(world: string, name: string): Promise<void> {
    return invoke('vault_archive', { world, name });
  }

  vaultRemember(key: string): Promise<void> {
    return invoke('vault_remember', { key });
  }

  vaultRecall(): Promise<string | null> {
    return invoke<string | null>('vault_recall');
  }

  vaultForget(): Promise<void> {
    return invoke('vault_forget');
  }

  async readPicture(image: ImageSource): Promise<Uint8Array> {
    if (image.kind === 'file') return new Uint8Array(await image.file.arrayBuffer());
    return new Uint8Array(await invoke<ArrayBuffer>('read_picture', { path: image.path }));
  }
}
