import { inDesktopApp } from './runtime';

/**
 * Reading windows (Jen and Mike, October 25). A page opens in a bare window of its own,
 * holding only that page, so it can sit on a second monitor or be shared on a call.
 * Names in it open beside it, inside the same window. Reading windows close when their
 * world closes, and they never reopen on their own at the next launch.
 */

/** The world folder the reading windows read from, set when a world opens. */
let worldPath = '';

export function setWindowWorld(path: string) {
  worldPath = path;
}

/** The page a reading window shows, from its address, or null in the main window. */
export function readerPage(): { id: string; world: string } | null {
  const params = new URLSearchParams(location.search);
  const id = params.get('reader');
  return id ? { id, world: params.get('world') ?? '' } : null;
}

/** Opens a page in a reading window, or brings forward the window already showing it. */
export async function openInWindow(id: string, title: string): Promise<void> {
  const query = `?reader=${encodeURIComponent(id)}&world=${encodeURIComponent(worldPath)}`;
  if (!inDesktopApp) {
    window.open(`${location.pathname}${query}`, '_blank', 'width=780,height=900');
    return;
  }
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  let hash = 0;
  for (const ch of worldPath + '\n' + id) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
  const label = `reader-${(hash >>> 0).toString(36)}`;
  const open = await WebviewWindow.getByLabel(label);
  if (open) {
    await open.setFocus();
    return;
  }
  // The window opens in the theme's background color, so it never flashes white first.
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#07090b';
  new WebviewWindow(label, { url: `index.html${query}`, title, width: 780, height: 900, minWidth: 420, minHeight: 360, backgroundColor: background, dragDropEnabled: false });
}
