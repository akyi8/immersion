/**
 * Screen-wide states that more than one part of the app reacts to. Drafting mode hides
 * everything except the manuscript (design: drafting mode), so the header and the Story
 * module both read it.
 */
class Ui {
  /** The file being drafted, or null outside drafting mode. */
  drafting = $state<string | null>(null);
}

export const ui = new Ui();
