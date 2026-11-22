import type { WorldFs } from '../fs/types';
import { withHeader } from '../world.ts';
import { slugOf, type Campaign } from './index.ts';

/**
 * Adds rulebooks and handouts to a campaign (Cerys, November 14). Files chosen on this
 * computer are copied into the campaign's folder, and a text handout is a markdown file
 * written there, for words pasted from a chat or an email.
 */
export async function chooseAndAdd(fs: WorldFs, campaign: Campaign, folder: 'rules' | 'handouts'): Promise<string[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    title: folder === 'rules' ? 'Choose rulebooks' : 'Choose handouts',
    multiple: true,
    filters: folder === 'rules' ? [{ name: 'PDF files', extensions: ['pdf'] }] : [{ name: 'PDFs and pictures', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  const files = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
  const added: string[] = [];
  for (const file of files) added.push(await fs.addFile(`${campaign.path}/${folder}`, file));
  return added;
}

/** Starts a text handout, and returns its path. */
export async function createTextHandout(fs: WorldFs, campaign: Campaign, name: string): Promise<string> {
  const dir = `${campaign.path}/handouts`;
  const base = slugOf(name);
  for (let n = 1; ; n++) {
    const path = `${dir}/${n === 1 ? base : `${base}-${n}`}.md`;
    if (await fs.exists(path)) continue;
    await fs.writeText(path, withHeader('', { name: name.trim() }));
    return path;
  }
}
