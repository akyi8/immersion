/**
 * Nothing in a world is deleted. A thing that is archived moves into an `archive` folder,
 * which the app leaves out, and moving it back restores it.
 *
 * When the archive already holds something by the same name, the newcomer takes a number:
 * `harbor.md`, then `harbor-2.md`, then `harbor-3.md`. The number goes before the file's
 * ending, and a folder or a name with no ending takes it at the end. A session's two
 * files end `.log.md` and `.plan.md`, and those endings stay whole.
 */
export async function freePath(exists: (path: string) => Promise<boolean>, wanted: string): Promise<string> {
  const slash = wanted.lastIndexOf('/');
  const name = wanted.slice(slash + 1);
  const dot = name.search(/(\.(log|plan))?\.[a-z0-9]+$/i);
  const cut = dot > 0 ? slash + 1 + dot : wanted.length;
  const [stem, ending] = [wanted.slice(0, cut), wanted.slice(cut)];
  let to = wanted;
  for (let n = 2; await exists(to); n++) to = `${stem}-${n}${ending}`;
  return to;
}
