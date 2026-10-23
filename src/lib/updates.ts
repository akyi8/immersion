import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { inDesktopApp } from './runtime';

/**
 * Asks GitHub whether a newer build exists. Every build is signed with the project's
 * update key, and the updater refuses anything not signed with it. Returns null when
 * the app is current, offline, or running in a browser.
 */
export async function findUpdate(): Promise<Update | null> {
  if (!inDesktopApp) return null;
  try {
    return await check();
  } catch {
    return null;
  }
}

/** Downloads and installs an update, then restarts into it. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
