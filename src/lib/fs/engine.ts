import { invoke } from '@tauri-apps/api/core';
import type { DirEntry } from './types';
import type { GameFs } from '../game/game';

/**
 * The engine folder a world's game is built on (Mike, November 7), reached through the
 * Rust backend's engine commands. Its paths are relative to the engine folder.
 */
export class EngineFs implements GameFs {
  readText(path: string): Promise<string> {
    return invoke<string>('engine_read_text', { rel: path });
  }

  readDir(path: string): Promise<DirEntry[]> {
    return invoke<DirEntry[]>('engine_read_dir', { rel: path });
  }

  exists(path: string): Promise<boolean> {
    return invoke<boolean>('engine_exists', { rel: path });
  }

  writeText(path: string, content: string): Promise<void> {
    return invoke('engine_write_text', { rel: path, content });
  }
}
