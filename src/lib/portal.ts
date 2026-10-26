/**
 * Moves an element to the end of the page body while it is shown. A dialog opened from
 * inside a pane would otherwise sit inside that pane's layer, under the panes to its
 * right (Mike, October 26).
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
