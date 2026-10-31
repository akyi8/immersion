/**
 * When each entry was last opened on this computer (Mike, October 31), so the faces on
 * a world's home page start with the people the writer has been living with. Kept per
 * world in the app's own storage, like other things the app remembers about layout.
 */
const key = (world: string) => `immersion.opened:${world}`;

export function openedTimes(world: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key(world)) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function markOpened(world: string, id: string) {
  const all = openedTimes(world);
  all[id] = Date.now();
  // Only the most recent few hundred are worth keeping.
  const kept = Object.fromEntries(
    Object.entries(all)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 300),
  );
  try {
    localStorage.setItem(key(world), JSON.stringify(kept));
  } catch {
    // Not remembering is harmless.
  }
}
