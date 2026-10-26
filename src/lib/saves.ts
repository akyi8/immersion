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

/** Saves every open editor, before the world syncs. */
export async function saveAll(): Promise<void> {
  await Promise.all([...savers.values()].map((save) => save()));
}

/** Saves every open editor whose file is inside `folder`, before the folder moves. */
export async function saveAllUnder(folder: string): Promise<void> {
  await Promise.all([...savers].filter(([path]) => path.startsWith(folder + '/')).map(([, save]) => save()));
}
