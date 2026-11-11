import type { MentionScanner } from '../../lib/index/scanner';

/** How a piece of game text learns which names to link and what a click opens. */
export const GAME_LINKS = 'immersion.game-links';

export interface GameLinks {
  readonly scanner: MentionScanner;
  open(id: string): void;
  /** Whether the page in this pane links names. Front and back matter do not (Mike, November 11). */
  linked(pane: string): boolean;
}
