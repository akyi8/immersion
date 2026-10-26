/**
 * Screen-wide states that more than one part of the app reacts to. Full screen shows one
 * document alone (Mike, October 26; it was drafting mode), so the header and the panes
 * both read it.
 */
class Ui {
  /** The document shown full screen, or null. */
  full = $state<string | null>(null);
}

export const ui = new Ui();
