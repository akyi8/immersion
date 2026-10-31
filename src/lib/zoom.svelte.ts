import { inDesktopApp } from './runtime';

/**
 * How large everything is drawn (Mike, October 31), from Ctrl or Cmd with plus, minus,
 * and zero, or from Settings. Each computer keeps its own, because screens differ. The
 * desktop app zooms the page the way a browser does, so pointers and dragging stay true.
 */
const KEY = 'immersion.zoom';
const STEPS = [0.7, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.3, 1.5];

function saved(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return STEPS.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

class Zoom {
  level = $state(saved());

  /** Applies the saved level, once at launch, and listens for the keys. */
  start() {
    void this.apply();
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '=' || e.key === '+') this.step(1);
      else if (e.key === '-' || e.key === '_') this.step(-1);
      else if (e.key === '0') this.set(1);
      else return;
      e.preventDefault();
    });
  }

  step(by: 1 | -1) {
    const i = STEPS.indexOf(this.level);
    this.set(STEPS[Math.min(STEPS.length - 1, Math.max(0, (i < 0 ? STEPS.indexOf(1) : i) + by))]);
  }

  set(level: number) {
    this.level = level;
    try {
      localStorage.setItem(KEY, String(level));
    } catch {
      // Not remembering the size is harmless.
    }
    void this.apply();
  }

  private async apply() {
    if (inDesktopApp) {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview()
        .setZoom(this.level)
        .catch(() => {});
    } else {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(this.level);
    }
  }
}

export const zoom = new Zoom();
