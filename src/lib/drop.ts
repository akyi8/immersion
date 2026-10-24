import { inDesktopApp } from './runtime';
import { imageExtension, type ImageSource } from './fs/types';

/**
 * Lets a picture be dropped onto an element, such as a portrait or a world's cover.
 * Use it as `use:dropImage={(image) => ...}`. While a picture is dragged over the
 * element, the element carries the `drop-over` class.
 *
 * Inside the desktop app, the window receives dropped files as paths on disk and
 * reports where the drop happened, so one listener finds the element under the
 * pointer. In a browser, the element hears the drop itself and gets the file.
 */
type Handler = (image: ImageSource) => void;

const targets = new Map<HTMLElement, Handler>();
let listening = false;

function targetAt(x: number, y: number): HTMLElement | null {
  // The window reports physical pixels, and the page lays out in CSS pixels.
  const ratio = window.devicePixelRatio || 1;
  let el = document.elementFromPoint(x / ratio, y / ratio) as HTMLElement | null;
  while (el && !targets.has(el)) el = el.parentElement;
  return el;
}

function mark(over: HTMLElement | null) {
  for (const el of targets.keys()) el.classList.toggle('drop-over', el === over);
}

async function listenToWindow() {
  if (listening) return;
  listening = true;
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  await getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === 'leave') return mark(null);
    const target = targetAt(p.position.x, p.position.y);
    if (p.type === 'drop') {
      mark(null);
      const path = p.paths.find((f) => imageExtension(f));
      if (target && path) targets.get(target)!({ kind: 'path', path });
    } else {
      mark(target);
    }
  });
}

export function dropImage(el: HTMLElement, handler: Handler) {
  targets.set(el, handler);
  if (inDesktopApp) {
    void listenToWindow();
    return {
      update(next: Handler) {
        targets.set(el, next);
      },
      destroy() {
        targets.delete(el);
      },
    };
  }

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
