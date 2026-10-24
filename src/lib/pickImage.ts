import { inDesktopApp } from './runtime';
import { IMAGE_EXTENSIONS, type ImageSource } from './fs/types';

/** Asks the player for a picture: the system file picker in the desktop app, a file input in a browser. */
export async function pickImage(): Promise<ImageSource | null> {
  if (inDesktopApp) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ title: 'Choose a picture', filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
    return typeof picked === 'string' ? { kind: 'path', path: picked } : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => resolve(input.files?.[0] ? { kind: 'file', file: input.files[0] } : null);
    input.click();
  });
}
