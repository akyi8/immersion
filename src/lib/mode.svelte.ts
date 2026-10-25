import type { Mode } from './theme';

/**
 * Light or dark, for the whole app (Mike, October 25). One switch beside the Worlds
 * button picks the side every theme shows: dark, light, or whatever the computer is set
 * to. The choice is remembered on this computer.
 */
export type ModeChoice = Mode | 'system';

const KEY = 'immersion.mode';

function saved(): ModeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

class ModeSetting {
  choice = $state<ModeChoice>(saved());
  private systemDark = $state(true);

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark = query.matches;
    query.addEventListener('change', (e) => (this.systemDark = e.matches));
  }

  /** The side on screen now. */
  get current(): Mode {
    return this.choice === 'system' ? (this.systemDark ? 'dark' : 'light') : this.choice;
  }

  set(choice: ModeChoice) {
    this.choice = choice;
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // Not remembering the choice is harmless.
    }
  }
}

export const mode = new ModeSetting();
