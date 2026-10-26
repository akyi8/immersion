/**
 * Whether a chapter's beats show beside the writing (Mike, October 25 and 26). One switch
 * in the document toolbar covers every chapter, and it is remembered on this computer.
 */
const KEY = 'immersion.outlineAside';

function saved(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

class Beats {
  on = $state(saved());

  set(on: boolean) {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Not remembering the choice is harmless.
    }
  }
}

export const beats = new Beats();
