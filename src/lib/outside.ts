/**
 * Calls `close` when a press lands outside `node`, so an open menu closes when the writer
 * clicks anywhere else (Mike, October 25).
 */
export function outside(node: HTMLElement, close: () => void) {
  let handler = close;
  const onDown = (event: PointerEvent) => {
    if (!node.contains(event.target as Node)) handler();
  };
  window.addEventListener('pointerdown', onDown, true);
  return {
    update(next: () => void) {
      handler = next;
    },
    destroy() {
      window.removeEventListener('pointerdown', onDown, true);
    },
  };
}
