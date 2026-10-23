import { isTauri } from '@tauri-apps/api/core';

/** True inside the desktop app, false in an ordinary browser. */
export const inDesktopApp: boolean = isTauri();
