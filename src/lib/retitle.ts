import { titleFocus } from './table/tray.svelte';

/**
 * A page's title is renamed by typing over it (Mike, November 15). The title looks like
 * a heading and wraps like one. A rename is taken on Enter or when the cursor leaves the
 * title, and Escape puts the old name back, so a stray key cannot rename a page: a rename
 * can move files and change every link to the page. "Rename" in a menu puts the cursor
 * here, through `titleFocus`.
 */
export interface Retitle {
  /** The page's id, which a menu's Rename asks for. */
  id: string;
  name: string;
  /** Renames the page. Returns a problem to show, or null. Without it the title only shows. */
  rename?: ((name: string) => Promise<string | null>) | null;
  /** Called with a problem, or with '' when a rename went through. */
  problem?: (text: string) => void;
}

export function retitle(node: HTMLElement, given: Retitle) {
  let now = given;
  let busy = false;

  const show = () => {
    if (document.activeElement !== node || !now.rename) node.textContent = now.name;
    if (now.rename) {
      node.setAttribute('contenteditable', 'plaintext-only');
      node.setAttribute('role', 'textbox');
      node.setAttribute('aria-label', 'The name. Type over it to rename.');
      node.spellcheck = false;
      node.classList.add('retitle');
    } else {
      node.removeAttribute('contenteditable');
      node.removeAttribute('role');
      node.removeAttribute('aria-label');
      node.classList.remove('retitle');
    }
  };

  const serve = () => {
    const ask = titleFocus.ask;
    if (!ask || ask.id !== now.id || !now.rename || Date.now() - ask.at > 4000) return;
    titleFocus.ask = null;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  async function commit() {
    const next = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!now.rename || busy || !next || next === now.name) {
      node.textContent = now.name;
      return;
    }
    busy = true;
    const problem = await now.rename(next).catch((e) => (e instanceof Error ? e.message : String(e)));
    busy = false;
    now.problem?.(problem ?? '');
    if (problem) node.textContent = now.name;
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      node.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      node.textContent = now.name;
      node.blur();
    }
  }
  const blur = () => void commit();

  node.addEventListener('keydown', keydown);
  node.addEventListener('blur', blur);
  show();
  // A request made before the page existed is served once it does.
  const waiting = setInterval(serve, 120);

  return {
    update(next: Retitle) {
      now = next;
      show();
    },
    destroy() {
      clearInterval(waiting);
      node.removeEventListener('keydown', keydown);
      node.removeEventListener('blur', blur);
    },
  };
}
