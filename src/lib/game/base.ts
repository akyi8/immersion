import { MemoryFs } from '../fs/memory.ts';
import { splitHeader } from '../world.ts';
import type { GameFs, Source } from './game.ts';

/**
 * A base game opened on its own (Cerys, November 28). An engine's folder can carry a
 * `world.md` of its own, which puts it on the Worlds page and opens it like a world with
 * one module, Game. Its files are then the open folder's, and no world stands on top of
 * it, so the world's side of the game is empty and kept in memory, where nothing written
 * to it reaches the disk.
 */
export async function baseGameHere(fs: GameFs): Promise<{ engine: Source; world: Source } | null> {
  if (!(await fs.exists('engine.md'))) return null;
  const { header, body } = splitHeader(await fs.readText('engine.md'));
  const name = (typeof header.name === 'string' && header.name.trim()) || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || 'Engine';
  return {
    engine: { origin: 'engine', name, fs, dir: '' },
    world: { origin: 'world', name, fs: new MemoryFs({}), dir: 'game' },
  };
}

/** The `world.md` that puts an engine's folder on the Worlds page as a base game. */
export function baseGameFile(name: string): string {
  return `---\nname: ${JSON.stringify(name)}\ntagline: The base game\nonly: game\n---\n\n# ${name}\n\nThis folder is a base game. Immersion opens it with one module, Game, on the base game's own book.\n`;
}
