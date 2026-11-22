import { untrack } from 'svelte';
import type { Frame } from './index/frame';

/** A picture the room can show, with how it is framed there. */
export interface RoomPicture {
  url: string;
  frame: Frame | null;
}

/**
 * The Radiance layout's room (Cerys, November 17). Every open page is a card on its own
 * ground, and one picture belongs to the room, down its right edge. The paper runs under
 * the picture, which fades into the page's own ground, and the last page keeps its text
 * out of the picture's whole half.
 * The picture is the world's. While a page that has a picture of its own is the one in
 * use, the room shows that page's picture instead. A page's picture shows at the level
 * of the room and never on the card. The room frames a page's picture the way the page
 * frames it behind itself, since both are the same tall shape (Cerys, November 18).
 */
class Room {
  /** Whether the Radiance layout is on. */
  on = $state(false);
  /** The page in use: the last one clicked or typed in. */
  focus = $state<string | null>(null);

  // The pictures are kept outside the reactive state, with a counter that says when they
  // changed, because a page sets its own from an effect.
  private pictures = new Map<string, RoomPicture>();
  private changed = $state(0);

  /** A page says what its picture is, or that it has none. */
  offer(id: string, url: string | null, frame: Frame | null = null) {
    if (url) this.pictures.set(id, { url, frame });
    else this.pictures.delete(id);
    this.changed = untrack(() => this.changed) + 1;
  }

  withdraw(id: string) {
    if (this.pictures.delete(id)) this.changed = untrack(() => this.changed) + 1;
  }

  /** The picture of the page in use among those open, when it has one. */
  pictureFor(open: string[]): RoomPicture | null {
    void this.changed;
    const id = this.focus && open.includes(this.focus) ? this.focus : (open.at(-1) ?? null);
    return (id && this.pictures.get(id)) || null;
  }

  /** The open pages in the module on screen, which the app's shell reports. */
  open = $state<string[]>([]);
}

export const room = new Room();
