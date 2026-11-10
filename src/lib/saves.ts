/**
 * Open editors register a way to save at once, so moving or renaming a file can first
 * write whatever is still waiting to be saved. Otherwise the waiting save would land at
 * the file's old place after it moved. The same list is saved before the world syncs,
 * before a world closes, and before the window closes, so nothing typed is left behind.
 */
type Save = () => Promise<void>;

const savers = new Map<string, Set<Save>>();
/** Panels that save through something else, such as beats written into an open editor. */
const panels = new Set<Save>();

export function registerSaver(path: string, save: Save): () => void {
  const set = savers.get(path) ?? new Set<Save>();
  set.add(save);
  savers.set(path, set);
  return () => {
    set.delete(save);
    if (!set.size && savers.get(path) === set) savers.delete(path);
  };
}

/** Registers a panel with no single file of its own. Panels save before the editors do. */
export function registerPanel(save: Save): () => void {
  panels.add(save);
  return () => void panels.delete(save);
}

const run = (list: Iterable<Save>) => Promise.all([...list].map((save) => save()));

export async function saveNow(path: string): Promise<void> {
  await run(panels);
  await run(savers.get(path) ?? []);
}

/** Saves every open editor and panel. */
export async function saveAll(): Promise<void> {
  await run(panels);
  await run([...savers.values()].flatMap((set) => [...set]));
}

/** Saves every open editor whose file is inside `folder`, before the folder moves. */
export async function saveAllUnder(folder: string): Promise<void> {
  await run(panels);
  await run([...savers].filter(([path]) => path.startsWith(folder + '/')).flatMap(([, set]) => [...set]));
}
