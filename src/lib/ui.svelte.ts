/**
 * Screen-wide states that more than one part of the app reacts to. Full screen shows one
 * document alone (Mike, October 26; it was drafting mode), so the header and the panes
 * both read it.
 */
class Ui {
  /** The document shown full screen, or null. */
  full = $state<string | null>(null);
  /** The Settings tab that is open, or null when Settings is closed (Mike, October 26). */
  settings = $state<'you' | 'world' | 'computer' | null>(null);
  /** The world open in this window, by its folder and name. */
  world = $state<{ path: string; name: string } | null>(null);
}

export const ui = new Ui();
