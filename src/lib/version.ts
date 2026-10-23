import { getVersion } from '@tauri-apps/api/app';
import { inDesktopApp } from './runtime';

/** The build's version, such as "0.1.4", where the last number is the GitHub build number. */
export async function appVersion(): Promise<string> {
  if (!inDesktopApp) return 'browser test';
  try {
    return await getVersion();
  } catch {
    return 'unknown';
  }
}
