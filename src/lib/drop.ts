import { imageExtension, type ImageSource } from './fs/types';

/**
 * Lets a picture be dropped onto an element, such as a portrait or a world's cover.
 * Use it as `use:dropImage={(image) => ...}`. While a picture is dragged over the
 * element, the element carries the `drop-over` class.
 *
 * The element hears the drop itself and gets the file, in the desktop app as in a
 * browser. The desktop window used to catch dropped files itself, which on Windows kept
 * every drag inside the page from working (Mike, October 31).
 */
type Handler = (image: ImageSource) => void;

const targets = new Map<HTMLElement, Handler>();

// A file dropped where nothing takes it would otherwise open in place of the app.
if (typeof window !== 'undefined') {
  const holdFiles = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  };
  window.addEventListener('dragover', holdFiles);
  window.addEventListener('drop', holdFiles);
}

export function dropImage(el: HTMLElement, handler: Handler) {
  targets.set(el, handler);
  const over = (e: DragEvent) => {
    e.preventDefault();
    el.classList.add('drop-over');
  };
  const leave = () => el.classList.remove('drop-over');
  const drop = (e: DragEvent) => {
    e.preventDefault();
    el.classList.remove('drop-over');
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => imageExtension(f.name));
    if (file) targets.get(el)!({ kind: 'file', file });
  };
  el.addEventListener('dragover', over);
  el.addEventListener('dragleave', leave);
  el.addEventListener('drop', drop);
  return {
    update(next: Handler) {
      targets.set(el, next);
    },
    destroy() {
      targets.delete(el);
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    },
  };
}
