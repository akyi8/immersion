/**
 * Open editors register a way to save at once, so moving or renaming a file can first
 * write whatever is still waiting to be saved. Otherwise the waiting save would land at
 * the file's old place after it moved.
 */
const savers = new Map<string, () => Promise<void>>();

export function registerSaver(path: string, save: () => Promise<void>): () => void {
  savers.set(path, save);
  return () => {
    if (savers.get(path) === save) savers.delete(path);
  };
}

export async function saveNow(path: string): Promise<void> {
  await savers.get(path)?.();
}
