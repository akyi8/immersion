import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { WikiIndex } from './index/wiki';

export type View = 'narrator' | 'protagonist';

/** Elements whose text is never turned into automatic links. */
const NO_LINKS = new Set(['A', 'BUTTON', 'CODE', 'PRE', 'H1']);

/**
 * Renders an entry's markdown for display. Names that match wiki entries become
 * automatic links drawn over the text (architecture decision 8). The links exist only
 * on screen and are never written to the file. Narrator-only callouts, written in the
 * file as `> [!narrator]`, are kept in Narrator view and removed in Protagonist view
 * (architecture decision 7).
 */
export function renderBody(markdown: string, index: WikiIndex, selfId: string | null, view: View): string {
  const source = markdown.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');
  const html = DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true }) as string);
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root')!;

  for (const quote of [...root.querySelectorAll('blockquote')]) {
    const first = quote.querySelector('p');
    const match = first?.innerHTML.match(/^\s*\[!(\w+)\][^\S\n]*(?:<br>)?\s*/i);
    if (!first || !match) continue;
    const kind = match[1].toLowerCase();
    if (kind === 'narrator' && view === 'protagonist') {
      quote.remove();
      continue;
    }
    first.innerHTML = first.innerHTML.slice(match[0].length);
    quote.classList.add('callout', `callout-${kind}`);
    const label = doc.createElement('div');
    label.className = 'callout-label';
    label.textContent = kind === 'narrator' ? 'Narrator only' : kind;
    quote.prepend(label);
  }

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let el = n.parentElement;
    let skip = false;
    while (el && el !== root) {
      if (NO_LINKS.has(el.tagName)) skip = true;
      el = el.parentElement;
    }
    if (!skip) textNodes.push(n as Text);
  }

  for (const node of textNodes) {
    const text = node.data;
    const mentions = index.scanner.find(text).filter((m) => m.id !== selfId);
    if (mentions.length === 0) continue;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const m of mentions) {
      if (m.start > at) frag.append(text.slice(at, m.start));
      const link = doc.createElement('button');
      link.type = 'button';
      link.className = 'mention';
      link.dataset.entry = m.id;
      link.textContent = text.slice(m.start, m.end);
      frag.append(link);
      at = m.end;
    }
    if (at < text.length) frag.append(text.slice(at));
    node.replaceWith(frag);
  }

  return root.innerHTML;
}
