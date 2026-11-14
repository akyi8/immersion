/**
 * Rulebooks (Mike, November 14). A campaign keeps its rulebooks as PDF files in its
 * `rules` folder, and a rulebook opens in a pane beside the session. The pages are drawn
 * by PDF.js, Mozilla's PDF library, which is loaded only when a book is first opened.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

export type Book = PDFDocumentProxy;

/** A place the book's own contents list points to. */
export interface Chapter {
  title: string;
  page: number;
  depth: number;
}

let loading: Promise<typeof import('pdfjs-dist')> | null = null;
function library() {
  loading ??= (async () => {
    // The legacy build carries what older web views lack.
    const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist');
    // The worker is built as a plain script file, so the desktop app serves it as one.
    const Worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker')).default;
    lib.GlobalWorkerOptions.workerPort = new Worker();
    return lib;
  })();
  return loading;
}

const support = (part: string) => new URL(`pdfjs/${part}/`, document.baseURI).href;

export async function openBook(url: string): Promise<Book> {
  const lib = await library();
  let data: ArrayBuffer;
  if (url.startsWith('data:')) {
    const raw = atob(url.slice(url.indexOf(',') + 1));
    data = Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
  } else {
    const got = await fetch(url);
    if (!got.ok) throw new Error('The book could not be read from its file.');
    data = await got.arrayBuffer();
  }
  return lib.getDocument({ data, wasmUrl: support('wasm'), standardFontDataUrl: support('standard_fonts') }).promise;
}

/** The book's own contents list, flattened, with the page each line opens. */
export async function chaptersOf(book: Book, limit = 400): Promise<Chapter[]> {
  const out: Chapter[] = [];
  type Item = { title: string; dest: string | unknown[] | null; items?: Item[] };
  const walk = async (items: Item[], depth: number) => {
    for (const item of items) {
      if (out.length >= limit) return;
      try {
        const dest = typeof item.dest === 'string' ? await book.getDestination(item.dest) : item.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        const page = typeof ref === 'number' ? ref + 1 : ref ? (await book.getPageIndex(ref as Parameters<Book['getPageIndex']>[0])) + 1 : 0;
        if (page > 0 && item.title.trim()) out.push({ title: item.title.trim(), page, depth });
      } catch {
        // A line that points nowhere is left out.
      }
      if (item.items?.length && depth < 2) await walk(item.items, depth + 1);
    }
  };
  try {
    const outline = (await book.getOutline()) as Item[] | null;
    if (outline) await walk(outline, 0);
  } catch {
    // A book with no contents list still opens.
  }
  return out;
}

/** Draws one page onto a canvas, as wide as `width` CSS pixels. Returns a way to stop a drawing still running. */
export async function drawPage(book: Book, number: number, canvas: HTMLCanvasElement, width: number): Promise<{ cancel: () => void; done: Promise<void> }> {
  const page = await book.getPage(number);
  const natural = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
  const viewport = page.getViewport({ scale: (width / natural.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.aspectRatio = `${natural.width} / ${natural.height}`;
  const task = page.render({ canvas, viewport });
  return {
    cancel: () => task.cancel(),
    done: task.promise.then(
      () => {},
      (e: unknown) => {
        if ((e as { name?: string })?.name !== 'RenderingCancelledException') throw e;
      },
    ),
  };
}

const KEY = 'immersion.table.pages';
export function rememberedPage(path: string): number {
  try {
    return Number((JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>)[path]) || 1;
  } catch {
    return 1;
  }
}
export function rememberPage(path: string, page: number) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
    all[path] = page;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not remembering the page is harmless.
  }
}
